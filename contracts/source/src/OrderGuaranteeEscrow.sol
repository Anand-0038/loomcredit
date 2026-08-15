// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Captures a buyer-backed, testnet-only order commitment on the source chain.
/// @dev The contract records lifecycle facts. Underwriting and policy remain on Creditcoin.
contract OrderGuaranteeEscrow {
    enum OrderState {
        None,
        Guaranteed,
        Cancelled,
        Disputed,
        Settled
    }

    struct OrderInput {
        bytes32 orderId;
        address buyer;
        address supplier;
        address settlementToken;
        uint128 orderValue;
        uint128 guaranteeAmount;
        uint64 deliveryDeadline;
        bytes32 termsCommitment;
        bytes32 buyerIdentityCommitment;
        bytes32 supplierIdentityCommitment;
        uint64 nonce;
    }

    struct Order {
        address buyer;
        address supplier;
        address settlementToken;
        uint128 orderValue;
        uint128 guaranteeAmount;
        uint64 deliveryDeadline;
        bytes32 termsCommitment;
        bytes32 buyerIdentityCommitment;
        bytes32 supplierIdentityCommitment;
        uint64 nonce;
        OrderState state;
    }

    mapping(bytes32 => Order) private orders;

    event OrderGuaranteed(
        bytes32 indexed orderId,
        address indexed buyer,
        address indexed supplier,
        address settlementToken,
        uint256 orderValue,
        uint256 guaranteeAmount,
        uint64 deliveryDeadline,
        bytes32 termsCommitment,
        bytes32 buyerIdentityCommitment,
        bytes32 supplierIdentityCommitment,
        uint64 nonce
    );
    event OrderCancelled(bytes32 indexed orderId, bytes32 reasonCommitment);
    event OrderDisputed(bytes32 indexed orderId, bytes32 disputeCommitment);
    event OrderSettled(bytes32 indexed orderId, uint256 settlementAmount, bytes32 settlementReference);

    error InvalidOrderId();
    error InvalidBuyer();
    error InvalidSupplier();
    error InvalidToken();
    error InvalidOrderValue();
    error InvalidGuarantee();
    error InvalidDeadline();
    error InvalidTerms();
    error OrderAlreadyExists();
    error Unauthorized();
    error InvalidState();
    error TransferFailed();

    function createAndGuaranteeOrder(OrderInput calldata input) external {
        if (input.orderId == bytes32(0)) revert InvalidOrderId();
        if (input.buyer != msg.sender) revert InvalidBuyer();
        if (input.supplier == address(0) || input.supplier == input.buyer) revert InvalidSupplier();
        if (input.settlementToken == address(0)) revert InvalidToken();
        if (input.orderValue == 0) revert InvalidOrderValue();
        if (input.guaranteeAmount == 0 || input.guaranteeAmount > input.orderValue) {
            revert InvalidGuarantee();
        }
        if (input.deliveryDeadline <= block.timestamp) revert InvalidDeadline();
        if (input.termsCommitment == bytes32(0)) revert InvalidTerms();
        if (orders[input.orderId].state != OrderState.None) revert OrderAlreadyExists();

        bool transferred = IERC20Minimal(input.settlementToken)
            .transferFrom(msg.sender, address(this), input.guaranteeAmount);
        if (!transferred) revert TransferFailed();

        orders[input.orderId] = Order({
            buyer: input.buyer,
            supplier: input.supplier,
            settlementToken: input.settlementToken,
            orderValue: input.orderValue,
            guaranteeAmount: input.guaranteeAmount,
            deliveryDeadline: input.deliveryDeadline,
            termsCommitment: input.termsCommitment,
            buyerIdentityCommitment: input.buyerIdentityCommitment,
            supplierIdentityCommitment: input.supplierIdentityCommitment,
            nonce: input.nonce,
            state: OrderState.Guaranteed
        });

        emit OrderGuaranteed(
            input.orderId,
            input.buyer,
            input.supplier,
            input.settlementToken,
            input.orderValue,
            input.guaranteeAmount,
            input.deliveryDeadline,
            input.termsCommitment,
            input.buyerIdentityCommitment,
            input.supplierIdentityCommitment,
            input.nonce
        );
    }

    function cancelOrder(bytes32 orderId, bytes32 reasonCommitment) external {
        Order storage order = orders[orderId];
        if (order.buyer == address(0)) revert InvalidOrderId();
        if (order.buyer != msg.sender) revert Unauthorized();
        if (order.state != OrderState.Guaranteed && order.state != OrderState.Disputed) {
            revert InvalidState();
        }

        order.state = OrderState.Cancelled;
        bool refunded = IERC20Minimal(order.settlementToken).transfer(order.buyer, order.guaranteeAmount);
        if (!refunded) revert TransferFailed();
        emit OrderCancelled(orderId, reasonCommitment);
    }

    function raiseDispute(bytes32 orderId, bytes32 disputeCommitment) external {
        Order storage order = orders[orderId];
        if (order.buyer == address(0)) revert InvalidOrderId();
        if (msg.sender != order.buyer && msg.sender != order.supplier) revert Unauthorized();
        if (order.state != OrderState.Guaranteed) revert InvalidState();

        order.state = OrderState.Disputed;
        emit OrderDisputed(orderId, disputeCommitment);
    }

    function settleOrder(bytes32 orderId, uint256 settlementAmount, bytes32 settlementReference) external {
        Order storage order = orders[orderId];
        if (order.buyer == address(0)) revert InvalidOrderId();
        if (msg.sender != order.buyer) revert Unauthorized();
        if (order.state != OrderState.Guaranteed && order.state != OrderState.Disputed) {
            revert InvalidState();
        }
        if (settlementAmount > order.guaranteeAmount) revert InvalidGuarantee();

        order.state = OrderState.Settled;
        if (settlementAmount > 0) {
            bool transferred = IERC20Minimal(order.settlementToken).transfer(order.supplier, settlementAmount);
            if (!transferred) revert TransferFailed();
        }

        // Return any unused guarantee to the buyer. Without this transfer, a
        // partial or zero settlement would leave funds permanently trapped in
        // the escrow after the order reaches its terminal state.
        uint256 refundAmount = uint256(order.guaranteeAmount) - settlementAmount;
        if (refundAmount > 0) {
            bool refunded = IERC20Minimal(order.settlementToken).transfer(order.buyer, refundAmount);
            if (!refunded) revert TransferFailed();
        }
        emit OrderSettled(orderId, settlementAmount, settlementReference);
    }

    function getOrder(bytes32 orderId) external view returns (Order memory) {
        return orders[orderId];
    }
}
