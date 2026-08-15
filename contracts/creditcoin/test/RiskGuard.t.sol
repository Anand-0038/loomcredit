// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {FacilityRegistry} from "../src/FacilityRegistry.sol";
import {RiskGuard} from "../src/RiskGuard.sol";
import {SandboxCapitalVault} from "../src/SandboxCapitalVault.sol";
import {TestBase} from "./TestBase.sol";

contract RiskGuardTest is TestBase {
    uint256 private constant AGENT_KEY = 0xA11CE;
    FacilityRegistry private registry;
    SandboxCapitalVault private vault;
    RiskGuard private guard;
    address private agent;
    bytes32 private orderId = bytes32(uint256(1));
    bytes32 private evidenceId = bytes32(uint256(2));

    function setUp() public {
        agent = vm.addr(AGENT_KEY);
        registry = new FacilityRegistry(address(this));
        vault = new SandboxCapitalVault(address(this));
        guard = new RiskGuard(address(this), registry, vault);
        registry.setRiskGuard(address(guard));
        registry.setCapitalVault(address(vault));
        vault.setRiskGuard(address(guard));
        vault.setFacilityRegistry(address(registry));
        guard.setAgentSigner(agent, true);
        vault.depositTestLiquidity(5_000_000);
        registry.setEvidenceVerifier(address(this));
        registry.registerEvidence(
            evidenceId,
            orderId,
            bytes32(uint256(3)),
            address(4),
            address(5),
            address(6),
            1_000_000,
            200_000,
            uint64(block.timestamp + 45 days),
            bytes32(uint256(7)),
            bytes32(uint256(8)),
            bytes32(uint256(9)),
            bytes32(uint256(10))
        );
    }

    function _quote(uint16 advanceBps) private view returns (RiskGuard.FacilityQuote memory) {
        return _quoteFor(orderId, evidenceId, advanceBps, 1);
    }

    function _quoteFor(bytes32 quoteOrderId, bytes32 quoteEvidenceId, uint16 advanceBps, uint64 nonce)
        private
        view
        returns (RiskGuard.FacilityQuote memory)
    {
        return RiskGuard.FacilityQuote({
            orderId: quoteOrderId,
            decision: guard.APPROVE_DECISION(),
            advanceBps: advanceBps,
            feeBps: 250,
            expiresAt: uint64(block.timestamp + 300),
            evidenceId: quoteEvidenceId,
            reasonCodesHash: bytes32(uint256(11)),
            policyVersion: guard.POLICY_VERSION(),
            modelVersion: guard.MODEL_VERSION(),
            nonce: nonce
        });
    }

    function _signature(RiskGuard.FacilityQuote memory quote) private returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AGENT_KEY, guard.quoteDigest(quote));
        return abi.encodePacked(r, s, v);
    }

    function testApprovesSafeQuoteAndReservesSandboxLiquidity() public {
        RiskGuard.FacilityQuote memory quote = _quote(3_000);
        bytes32 quoteHash = guard.quoteDigest(quote);
        vm.expectEmit(true, true, false, true, address(guard));
        emit RiskGuard.QuoteApproved(orderId, evidenceId, 300_000, quoteHash);
        vm.expectEmit(true, true, false, true, address(guard));
        emit RiskGuard.QuoteDecisionAudited(
            orderId,
            evidenceId,
            quote.decision,
            300_000,
            quote.advanceBps,
            quote.feeBps,
            quote.expiresAt,
            quote.reasonCodesHash,
            quote.policyVersion,
            quote.modelVersion,
            quote.nonce,
            quoteHash
        );
        uint256 amount = guard.submitQuote(quote, _signature(quote));

        assertEq(amount, 300_000);
        assertEq(vault.availableLiquidity(), 4_700_000);
        FacilityRegistry.TradeEvidence memory evidence = registry.getEvidence(orderId);
        assertEq(uint256(evidence.state), uint256(FacilityRegistry.FacilityState.Reserved));
        assertEq(registry.buyerReservedExposure(evidence.buyer), 300_000);
    }

    function testRejectsUnsafeQuote() public {
        RiskGuard.FacilityQuote memory quote = _quote(8_000);
        bytes memory signature = _signature(quote);

        vm.expectRevert(RiskGuard.AdvanceLimit.selector);
        guard.submitQuote(quote, signature);
    }

    function testRejectsZeroAdvanceQuote() public {
        RiskGuard.FacilityQuote memory quote = _quote(0);
        bytes memory signature = _signature(quote);

        vm.expectRevert(RiskGuard.InvalidReservationAmount.selector);
        guard.submitQuote(quote, signature);
    }

    function testRejectsFeeAboveQuoteSchemaMaximum() public {
        RiskGuard.FacilityQuote memory quote = _quote(3_000);
        quote.feeBps = 10_001;
        bytes memory signature = _signature(quote);

        vm.expectRevert(RiskGuard.FeeLimit.selector);
        guard.submitQuote(quote, signature);
    }

    function testRejectsNonApprovalDecision() public {
        RiskGuard.FacilityQuote memory quote = _quote(3_000);
        quote.decision = keccak256("REJECT");
        bytes memory signature = _signature(quote);

        vm.expectRevert(RiskGuard.InvalidDecision.selector);
        guard.submitQuote(quote, signature);
    }

    function testQuoteDigestBindsDecision() public view {
        RiskGuard.FacilityQuote memory quote = _quote(3_000);
        bytes32 approvalDigest = guard.quoteDigest(quote);

        quote.decision = keccak256("REJECT");

        assertTrue(approvalDigest != guard.quoteDigest(quote));
    }

    function testRejectsReplayNonce() public {
        RiskGuard.FacilityQuote memory quote = _quote(3_000);
        bytes memory signature = _signature(quote);
        guard.submitQuote(quote, signature);

        vm.expectRevert(RiskGuard.InvalidNonce.selector);
        guard.submitQuote(quote, signature);
    }

    function testRejectsUnknownSigner() public {
        RiskGuard.FacilityQuote memory quote = _quote(3_000);
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(uint256(keccak256("RISKGUARD_UNKNOWN_SIGNER")), guard.quoteDigest(quote));
        vm.expectRevert(RiskGuard.UnknownSigner.selector);
        guard.submitQuote(quote, abi.encodePacked(r, s, v));
    }

    function testFuzzRejectsReplayNonce(uint64 nonce) public {
        RiskGuard.FacilityQuote memory quote = _quoteFor(orderId, evidenceId, 3_000, nonce);
        bytes memory signature = _signature(quote);
        guard.submitQuote(quote, signature);

        vm.expectRevert(RiskGuard.InvalidNonce.selector);
        guard.submitQuote(quote, signature);
    }

    function testRejectsBuyerConcentration() public {
        bytes32 existingOrderId = bytes32(uint256(10));
        bytes32 existingEvidenceId = bytes32(uint256(11));
        registry.registerEvidence(
            existingEvidenceId,
            existingOrderId,
            bytes32(uint256(12)),
            address(4),
            address(7),
            address(6),
            2_500_000,
            500_000,
            uint64(block.timestamp + 45 days),
            bytes32(uint256(13)),
            bytes32(uint256(14)),
            bytes32(uint256(15)),
            bytes32(uint256(16))
        );
        RiskGuard.FacilityQuote memory existingQuote = _quoteFor(existingOrderId, existingEvidenceId, 4_000, 2);
        guard.submitQuote(existingQuote, _signature(existingQuote));

        RiskGuard.FacilityQuote memory concentratedQuote = _quoteFor(orderId, evidenceId, 3_000, 3);
        bytes memory signature = _signature(concentratedQuote);

        vm.expectRevert(RiskGuard.BuyerConcentration.selector);
        guard.submitQuote(concentratedQuote, signature);
    }

    function testReleasesExposureWhenReservedFacilityIsDisputed() public {
        RiskGuard.FacilityQuote memory quote = _quote(3_000);
        guard.submitQuote(quote, _signature(quote));
        assertEq(registry.buyerReservedExposure(address(4)), 300_000);

        registry.markDisputed(orderId);
        assertEq(registry.buyerReservedExposure(address(4)), 0);
        assertEq(registry.supplierReservedExposure(address(5)), 0);
        assertEq(vault.availableLiquidity(), 5_000_000);
    }

    function testCancelledStateRejectsFurtherTransitions() public {
        RiskGuard.FacilityQuote memory quote = _quote(3_000);
        guard.submitQuote(quote, _signature(quote));
        registry.markCancelled(orderId);

        vm.expectRevert(FacilityRegistry.InvalidTransition.selector);
        registry.markDisputed(orderId);
        assertEq(vault.availableLiquidity(), 5_000_000);
        assertTrue(!registry.isActive(orderId));
    }

    function testSettledStateRejectsFurtherTransitions() public {
        RiskGuard.FacilityQuote memory quote = _quote(3_000);
        guard.submitQuote(quote, _signature(quote));
        registry.markSettled(orderId);

        vm.expectRevert(FacilityRegistry.InvalidTransition.selector);
        registry.markCancelled(orderId);
        assertEq(vault.availableLiquidity(), 5_000_000);
        assertTrue(!registry.isActive(orderId));
    }
}
