// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { MockUSDC } from "../src/MockUSDC.sol";
import { OrderGuaranteeEscrow } from "../src/OrderGuaranteeEscrow.sol";
import { TestBase } from "./TestBase.sol";

contract SourceActor {
    function approve(MockUSDC token, address spender, uint256 amount) external {
        token.approve(spender, amount);
    }

    function create(OrderGuaranteeEscrow escrow, OrderGuaranteeEscrow.OrderInput calldata input) external {
        escrow.createAndGuaranteeOrder(input);
    }

    function cancel(OrderGuaranteeEscrow escrow, bytes32 orderId, bytes32 reason) external {
        escrow.cancelOrder(orderId, reason);
    }

    function dispute(OrderGuaranteeEscrow escrow, bytes32 orderId, bytes32 reason) external {
        escrow.raiseDispute(orderId, reason);
    }

    function settle(
        OrderGuaranteeEscrow escrow,
        bytes32 orderId,
        uint256 settlementAmount,
        bytes32 settlementReference
    ) external {
        escrow.settleOrder(orderId, settlementAmount, settlementReference);
    }
}

contract OrderGuaranteeEscrowTest is TestBase {
    MockUSDC private token;
    OrderGuaranteeEscrow private escrow;
    SourceActor private buyer;
    SourceActor private supplier;

    function setUp() public {
        token = new MockUSDC();
        escrow = new OrderGuaranteeEscrow();
        buyer = new SourceActor();
        supplier = new SourceActor();
        token.mint(address(buyer), 1_000_000);
        buyer.approve(token, address(escrow), 1_000_000);
    }

    function _input(bytes32 orderId) private view returns (OrderGuaranteeEscrow.OrderInput memory) {
        return OrderGuaranteeEscrow.OrderInput({
            orderId: orderId,
            buyer: address(buyer),
            supplier: address(supplier),
            settlementToken: address(token),
            orderValue: 10_000,
            guaranteeAmount: 2_000,
            deliveryDeadline: uint64(block.timestamp + 45 days),
            termsCommitment: bytes32(uint256(11)),
            buyerIdentityCommitment: bytes32(uint256(12)),
            supplierIdentityCommitment: bytes32(uint256(13)),
            nonce: 1
        });
    }

    function testCreatesAndLocksGuarantee() public {
        bytes32 orderId = bytes32(uint256(1));
        buyer.create(escrow, _input(orderId));
        OrderGuaranteeEscrow.Order memory order = escrow.getOrder(orderId);

        assertEq(order.buyer, address(buyer));
        assertEq(uint256(order.state), uint256(OrderGuaranteeEscrow.OrderState.Guaranteed));
        assertEq(token.balanceOf(address(escrow)), 2_000);
    }

    function testRejectsGuaranteeAboveOrderValue() public {
        OrderGuaranteeEscrow.OrderInput memory input = _input(bytes32(uint256(2)));
        input.guaranteeAmount = 10_001;

        vm.expectRevert(OrderGuaranteeEscrow.InvalidGuarantee.selector);
        buyer.create(escrow, input);
    }

    function testRejectsNonBuyerCancellation() public {
        bytes32 orderId = bytes32(uint256(3));
        buyer.create(escrow, _input(orderId));

        vm.expectRevert(OrderGuaranteeEscrow.Unauthorized.selector);
        supplier.cancel(escrow, orderId, bytes32(uint256(99)));
    }

    function testCancellationRefundsGuarantee() public {
        bytes32 orderId = bytes32(uint256(4));
        buyer.create(escrow, _input(orderId));
        uint256 beforeBalance = token.balanceOf(address(buyer));
        buyer.cancel(escrow, orderId, bytes32(uint256(44)));

        OrderGuaranteeEscrow.Order memory order = escrow.getOrder(orderId);
        assertEq(uint256(order.state), uint256(OrderGuaranteeEscrow.OrderState.Cancelled));
        assertEq(token.balanceOf(address(buyer)), beforeBalance + 2_000);
    }

    function testDisputeCanBeCancelledByBuyer() public {
        bytes32 orderId = bytes32(uint256(5));
        buyer.create(escrow, _input(orderId));
        buyer.dispute(escrow, orderId, bytes32(uint256(55)));
        buyer.cancel(escrow, orderId, bytes32(uint256(56)));

        OrderGuaranteeEscrow.Order memory order = escrow.getOrder(orderId);
        assertEq(uint256(order.state), uint256(OrderGuaranteeEscrow.OrderState.Cancelled));
    }

    function testPartialSettlementPaysSupplierAndRefundsRemainder() public {
        bytes32 orderId = bytes32(uint256(6));
        buyer.create(escrow, _input(orderId));
        uint256 beforeBuyerBalance = token.balanceOf(address(buyer));
        uint256 beforeSupplierBalance = token.balanceOf(address(supplier));

        buyer.settle(escrow, orderId, 750, bytes32(uint256(66)));

        OrderGuaranteeEscrow.Order memory order = escrow.getOrder(orderId);
        assertEq(uint256(order.state), uint256(OrderGuaranteeEscrow.OrderState.Settled));
        assertEq(token.balanceOf(address(buyer)), beforeBuyerBalance + 1_250);
        assertEq(token.balanceOf(address(supplier)), beforeSupplierBalance + 750);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function testZeroSettlementRefundsFullGuarantee() public {
        bytes32 orderId = bytes32(uint256(7));
        buyer.create(escrow, _input(orderId));
        uint256 beforeBuyerBalance = token.balanceOf(address(buyer));

        buyer.settle(escrow, orderId, 0, bytes32(uint256(77)));

        OrderGuaranteeEscrow.Order memory order = escrow.getOrder(orderId);
        assertEq(uint256(order.state), uint256(OrderGuaranteeEscrow.OrderState.Settled));
        assertEq(token.balanceOf(address(buyer)), beforeBuyerBalance + 2_000);
        assertEq(token.balanceOf(address(escrow)), 0);
    }
}
