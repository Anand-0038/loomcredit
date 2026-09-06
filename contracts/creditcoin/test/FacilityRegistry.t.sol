// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { FacilityRegistry } from "../src/FacilityRegistry.sol";
import { TestBase } from "./TestBase.sol";

contract RegistryRiskGuardActor {
    function markQuoted(FacilityRegistry registry, bytes32 orderId) external {
        registry.markQuoted(orderId);
    }

    function markReserved(FacilityRegistry registry, bytes32 orderId, uint256 amount) external {
        registry.markReserved(orderId, amount);
    }
}

contract FacilityRegistryTest is TestBase {
    RegistryRiskGuardActor private riskGuard;
    FacilityRegistry private registry;

    function setUp() public {
        riskGuard = new RegistryRiskGuardActor();
        registry = new FacilityRegistry(address(this));
        registry.setEvidenceVerifier(address(this));
        registry.setRiskGuard(address(riskGuard));
    }

    function _register(bytes32 orderId) private {
        registry.registerEvidence(
            bytes32(uint256(orderId) + 100),
            orderId,
            bytes32(uint256(orderId) + 200),
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

    function testSourceLifecycleProjectionAllowsTerminalStatesFromAnyOpenState() public {
        bytes32 evidenceVerifiedOrder = bytes32(uint256(1));
        _register(evidenceVerifiedOrder);
        registry.markSettled(evidenceVerifiedOrder);

        bytes32 quotedOrder = bytes32(uint256(2));
        _register(quotedOrder);
        riskGuard.markQuoted(registry, quotedOrder);
        registry.markSettled(quotedOrder);

        bytes32 reservedOrder = bytes32(uint256(3));
        _register(reservedOrder);
        riskGuard.markReserved(registry, reservedOrder, 300_000);
        registry.markCancelled(reservedOrder);

        bytes32 disputedOrder = bytes32(uint256(4));
        _register(disputedOrder);
        registry.markDisputed(disputedOrder);
        registry.markCancelled(disputedOrder);

        assertEq(uint256(registry.getEvidence(evidenceVerifiedOrder).state), uint256(FacilityRegistry.FacilityState.Settled));
        assertEq(uint256(registry.getEvidence(quotedOrder).state), uint256(FacilityRegistry.FacilityState.Settled));
        assertEq(uint256(registry.getEvidence(reservedOrder).state), uint256(FacilityRegistry.FacilityState.Cancelled));
        assertEq(uint256(registry.getEvidence(disputedOrder).state), uint256(FacilityRegistry.FacilityState.Cancelled));
    }

    function testTerminalStatesCannotTransitionAgain() public {
        bytes32 cancelledOrder = bytes32(uint256(5));
        _register(cancelledOrder);
        registry.markCancelled(cancelledOrder);

        vm.expectRevert(FacilityRegistry.InvalidTransition.selector);
        registry.markSettled(cancelledOrder);

        bytes32 settledOrder = bytes32(uint256(6));
        _register(settledOrder);
        registry.markSettled(settledOrder);

        vm.expectRevert(FacilityRegistry.InvalidTransition.selector);
        registry.markCancelled(settledOrder);
    }
}
