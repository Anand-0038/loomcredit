// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface ICapitalVault {
    function release(bytes32 orderId) external;
}

/// @notice Stores verified order evidence and the facility lifecycle on Creditcoin.
/// @dev Only the proof verifier and RiskGuard may mutate a registered facility.
contract FacilityRegistry {
    enum FacilityState {
        None,
        EvidenceVerified,
        Quoted,
        Reserved,
        Cancelled,
        Disputed,
        Settled,
        Expired,
        Rejected
    }

    struct TradeEvidence {
        bytes32 evidenceId;
        bytes32 orderId;
        bytes32 orderFingerprint;
        address buyer;
        address supplier;
        address settlementToken;
        uint128 orderValue;
        uint128 guaranteeAmount;
        uint64 deliveryDeadline;
        bytes32 termsCommitment;
        bytes32 buyerIdentityCommitment;
        bytes32 supplierIdentityCommitment;
        bytes32 sourceQueryKey;
        uint64 verifiedAt;
        FacilityState state;
    }

    address public immutable owner;
    address public evidenceVerifier;
    address public riskGuard;
    address public capitalVault;

    mapping(bytes32 => TradeEvidence) private evidenceByOrder;
    mapping(bytes32 => bytes32) public orderByEvidenceId;
    mapping(bytes32 => bool) public activeFingerprints;
    mapping(address => uint256) public buyerReservedExposure;
    mapping(address => uint256) public supplierReservedExposure;
    mapping(bytes32 => uint256) public reservedAmountByOrder;

    event EvidenceRegistered(
        bytes32 indexed evidenceId, bytes32 indexed orderId, bytes32 indexed fingerprint
    );
    event FacilityStateChanged(bytes32 indexed orderId, FacilityState previousState, FacilityState nextState);
    event EvidenceVerifierUpdated(address indexed verifier);
    event RiskGuardUpdated(address indexed riskGuard);
    event CapitalVaultUpdated(address indexed capitalVault);

    error Unauthorized();
    error AlreadyRegistered();
    error UnknownOrder();
    error InvalidTransition();
    error FingerprintAlreadyActive();
    error InvalidReservationAmount();

    constructor(address initialOwner) {
        owner = initialOwner == address(0) ? msg.sender : initialOwner;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyVerifier() {
        if (msg.sender != evidenceVerifier) revert Unauthorized();
        _;
    }

    modifier onlyRiskGuard() {
        if (msg.sender != riskGuard) revert Unauthorized();
        _;
    }

    function setEvidenceVerifier(address verifier) external onlyOwner {
        if (verifier == address(0)) revert Unauthorized();
        evidenceVerifier = verifier;
        emit EvidenceVerifierUpdated(verifier);
    }

    function setRiskGuard(address guard) external onlyOwner {
        if (guard == address(0)) revert Unauthorized();
        riskGuard = guard;
        emit RiskGuardUpdated(guard);
    }

    function setCapitalVault(address vault) external onlyOwner {
        if (vault == address(0)) revert Unauthorized();
        capitalVault = vault;
        emit CapitalVaultUpdated(vault);
    }

    function registerEvidence(
        bytes32 evidenceId,
        bytes32 orderId,
        bytes32 orderFingerprint,
        address buyer,
        address supplier,
        address settlementToken,
        uint128 orderValue,
        uint128 guaranteeAmount,
        uint64 deliveryDeadline,
        bytes32 termsCommitment,
        bytes32 buyerIdentityCommitment,
        bytes32 supplierIdentityCommitment,
        bytes32 sourceQueryKey
    ) external onlyVerifier {
        if (evidenceByOrder[orderId].state != FacilityState.None) {
            revert AlreadyRegistered();
        }
        if (activeFingerprints[orderFingerprint]) revert FingerprintAlreadyActive();

        evidenceByOrder[orderId] = TradeEvidence({
            evidenceId: evidenceId,
            orderId: orderId,
            orderFingerprint: orderFingerprint,
            buyer: buyer,
            supplier: supplier,
            settlementToken: settlementToken,
            orderValue: orderValue,
            guaranteeAmount: guaranteeAmount,
            deliveryDeadline: deliveryDeadline,
            termsCommitment: termsCommitment,
            buyerIdentityCommitment: buyerIdentityCommitment,
            supplierIdentityCommitment: supplierIdentityCommitment,
            sourceQueryKey: sourceQueryKey,
            verifiedAt: uint64(block.timestamp),
            state: FacilityState.EvidenceVerified
        });
        orderByEvidenceId[evidenceId] = orderId;
        activeFingerprints[orderFingerprint] = true;
        emit EvidenceRegistered(evidenceId, orderId, orderFingerprint);
    }

    function markQuoted(bytes32 orderId) external onlyRiskGuard {
        _setState(orderId, FacilityState.Quoted);
    }

    function markReserved(bytes32 orderId, uint256 amount) external onlyRiskGuard {
        if (amount == 0) revert InvalidReservationAmount();
        TradeEvidence storage evidence = evidenceByOrder[orderId];
        _setState(orderId, FacilityState.Reserved);
        reservedAmountByOrder[orderId] = amount;
        buyerReservedExposure[evidence.buyer] += amount;
        supplierReservedExposure[evidence.supplier] += amount;
    }

    function markCancelled(bytes32 orderId) external onlyVerifier {
        _setState(orderId, FacilityState.Cancelled);
    }

    function markDisputed(bytes32 orderId) external onlyVerifier {
        _setState(orderId, FacilityState.Disputed);
    }

    function markSettled(bytes32 orderId) external onlyVerifier {
        _setState(orderId, FacilityState.Settled);
    }

    function getEvidence(bytes32 orderId) external view returns (TradeEvidence memory) {
        if (evidenceByOrder[orderId].state == FacilityState.None) revert UnknownOrder();
        return evidenceByOrder[orderId];
    }

    function getEvidenceById(bytes32 evidenceId) external view returns (TradeEvidence memory) {
        bytes32 orderId = orderByEvidenceId[evidenceId];
        if (orderId == bytes32(0)) revert UnknownOrder();
        return evidenceByOrder[orderId];
    }

    function isActive(bytes32 orderId) external view returns (bool) {
        FacilityState state = evidenceByOrder[orderId].state;
        return state == FacilityState.EvidenceVerified || state == FacilityState.Quoted
            || state == FacilityState.Reserved;
    }

    function _setState(bytes32 orderId, FacilityState nextState) internal {
        TradeEvidence storage evidence = evidenceByOrder[orderId];
        FacilityState previousState = evidence.state;
        if (previousState == FacilityState.None) revert UnknownOrder();

        bool valid;
        if (nextState == FacilityState.Quoted) {
            valid = previousState == FacilityState.EvidenceVerified;
        } else if (nextState == FacilityState.Reserved) {
            valid = previousState == FacilityState.Quoted || previousState == FacilityState.EvidenceVerified;
        } else if (nextState == FacilityState.Cancelled || nextState == FacilityState.Disputed) {
            valid = previousState == FacilityState.EvidenceVerified || previousState == FacilityState.Quoted
                || previousState == FacilityState.Reserved;
        } else if (nextState == FacilityState.Settled) {
            valid = previousState == FacilityState.Reserved || previousState == FacilityState.Disputed;
        }
        if (!valid) revert InvalidTransition();

        if (
            (nextState == FacilityState.Cancelled
                    || nextState == FacilityState.Disputed
                    || nextState == FacilityState.Settled) && previousState == FacilityState.Reserved
        ) {
            uint256 reservedAmount = reservedAmountByOrder[orderId];
            buyerReservedExposure[evidence.buyer] -= reservedAmount;
            supplierReservedExposure[evidence.supplier] -= reservedAmount;
            delete reservedAmountByOrder[orderId];
        }

        evidence.state = nextState;
        emit FacilityStateChanged(orderId, previousState, nextState);
        if (
            capitalVault != address(0)
                && (nextState == FacilityState.Cancelled
                    || nextState == FacilityState.Disputed
                    || nextState == FacilityState.Settled) && previousState == FacilityState.Reserved
        ) {
            ICapitalVault(capitalVault).release(orderId);
        }
    }
}
