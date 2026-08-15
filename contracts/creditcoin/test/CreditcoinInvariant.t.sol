// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { FacilityRegistry } from "../src/FacilityRegistry.sol";
import { RiskGuard } from "../src/RiskGuard.sol";
import { SandboxCapitalVault } from "../src/SandboxCapitalVault.sol";
import { TestBase } from "./TestBase.sol";

contract ReleaseActor {
    SandboxCapitalVault private immutable vault;

    constructor(SandboxCapitalVault capitalVault) {
        vault = capitalVault;
    }

    function reserve(bytes32 orderId, uint256 amount) external {
        vault.reserve(orderId, address(0xBEEF), amount);
    }

    function releaseTwice(bytes32 orderId) external {
        vault.release(orderId);
        vault.release(orderId);
    }
}

contract ReleaseIdempotencyTest is TestBase {
    function testReleaseIsIdempotent() public {
        SandboxCapitalVault vault = new SandboxCapitalVault(address(this));
        ReleaseActor actor = new ReleaseActor(vault);
        vault.setRiskGuard(address(actor));
        vault.setFacilityRegistry(address(actor));
        vault.depositTestLiquidity(5_000_000);
        bytes32 orderId = bytes32(uint256(99));

        actor.reserve(orderId, 1_000_000);
        assertEq(vault.availableLiquidity(), 4_000_000);
        actor.releaseTwice(orderId);

        assertEq(vault.reservedByOrder(orderId), 0);
        assertEq(vault.availableLiquidity(), 5_000_000);
        assertTrue(vault.availableLiquidity() <= vault.totalLiquidity());
    }
}

contract CreditcoinInvariantTest is TestBase {
    uint256 private constant AGENT_KEY = 0xA11CE;
    uint256 private constant ORDER_VALUE = 1_000_000;
    uint256 private constant GUARANTEE_AMOUNT = 200_000;
    address public constant BUYER = address(0x4004);

    FacilityRegistry private registry;
    SandboxCapitalVault private vault;
    RiskGuard private guard;
    bytes32[] private orderIds;

    function setUp() public {
        registry = new FacilityRegistry(address(this));
        vault = new SandboxCapitalVault(address(this));
        guard = new RiskGuard(address(this), registry, vault);

        registry.setRiskGuard(address(guard));
        registry.setCapitalVault(address(vault));
        registry.setEvidenceVerifier(address(this));
        vault.setRiskGuard(address(guard));
        vault.setFacilityRegistry(address(registry));
        guard.setAgentSigner(vm.addr(AGENT_KEY), true);
        vault.depositTestLiquidity(5_000_000);
    }

    function _createAndQuote(uint256 rawAdvanceBps) private {
        uint256 index = orderIds.length;
        bytes32 orderId = keccak256(abi.encode("invariant-order", index));
        bytes32 evidenceId = keccak256(abi.encode("invariant-evidence", index));
        registry.registerEvidence(
            evidenceId,
            orderId,
            keccak256(abi.encode("invariant-fingerprint", index)),
            BUYER,
            supplierFor(index),
            address(6),
            uint128(ORDER_VALUE),
            uint128(GUARANTEE_AMOUNT),
            uint64(block.timestamp + 45 days),
            bytes32(uint256(7)),
            bytes32(uint256(8)),
            bytes32(uint256(9)),
            bytes32(uint256(10))
        );
        orderIds.push(orderId);

        uint16 advanceBps = uint16(rawAdvanceBps % guard.MAX_ADVANCE_BPS()) + 1;
        RiskGuard.FacilityQuote memory quote = RiskGuard.FacilityQuote({
            orderId: orderId,
            decision: guard.APPROVE_DECISION(),
            advanceBps: advanceBps,
            feeBps: 250,
            expiresAt: uint64(block.timestamp + 300),
            evidenceId: evidenceId,
            reasonCodesHash: bytes32(uint256(11)),
            policyVersion: guard.POLICY_VERSION(),
            modelVersion: guard.MODEL_VERSION(),
            nonce: uint64(index)
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AGENT_KEY, guard.quoteDigest(quote));
        try guard.submitQuote(quote, abi.encodePacked(r, s, v)) { } catch { }
    }

    function _resolve(uint256 rawIndex, uint8 rawTerminalState) private {
        if (orderIds.length == 0) return;
        bytes32 orderId = orderIds[rawIndex % orderIds.length];
        FacilityRegistry.TradeEvidence memory evidence = registry.getEvidence(orderId);
        if (evidence.state != FacilityRegistry.FacilityState.Reserved) return;

        uint8 terminalState = rawTerminalState % 3;
        if (terminalState == 0) {
            registry.markCancelled(orderId);
        } else if (terminalState == 1) {
            registry.markDisputed(orderId);
        } else {
            registry.markSettled(orderId);
        }
    }

    function supplierFor(uint256 index) public pure returns (address) {
        return address(uint160(0x5000 + index));
    }

    function reservedTotal() public view returns (uint256 total) {
        for (uint256 index = 0; index < orderIds.length; index++) {
            total += vault.reservedByOrder(orderIds[index]);
        }
    }

    function supplierExposureTotal() public view returns (uint256 total) {
        for (uint256 index = 0; index < orderIds.length; index++) {
            total += registry.supplierReservedExposure(supplierFor(index));
        }
    }

    function testFuzzLifecycleMaintainsLiquidityAndExposure(
        uint16[8] memory advances,
        uint8[8] memory terminals
    ) public {
        for (uint256 index = 0; index < advances.length; index++) {
            _createAndQuote(advances[index]);
            if (index % 2 == 1) _resolve(index / 2, terminals[index]);

            uint256 reserved = reservedTotal();
            assertTrue(reserved <= vault.totalLiquidity());
            assertEq(vault.availableLiquidity() + reserved, vault.totalLiquidity());

            uint256 buyerLimit = (vault.totalLiquidity() * guard.MAX_BUYER_CONCENTRATION_BPS()) / 10_000;
            assertTrue(registry.buyerReservedExposure(BUYER) <= buyerLimit);
            assertEq(supplierExposureTotal(), reserved);
        }
    }
}
