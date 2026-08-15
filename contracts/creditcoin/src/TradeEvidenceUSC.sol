// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { FacilityRegistry } from "./FacilityRegistry.sol";
import { INativeQueryVerifier } from "./interfaces/VerifierInterface.sol";
import { EvmV1Decoder } from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";

/// @notice Creditcoin USC boundary for verified source-chain order lifecycle events.
/// @dev Inclusion is not enough: receipt success, emitter, exact fields, replay, and fingerprint are checked here.
contract TradeEvidenceUSC {
    bytes32 public constant ORDER_GUARANTEED_TOPIC = keccak256(
        "OrderGuaranteed(bytes32,address,address,address,uint256,uint256,uint64,bytes32,bytes32,bytes32,uint64)"
    );
    bytes32 public constant ORDER_CANCELLED_TOPIC = keccak256("OrderCancelled(bytes32,bytes32)");
    bytes32 public constant ORDER_DISPUTED_TOPIC = keccak256("OrderDisputed(bytes32,bytes32)");
    bytes32 public constant ORDER_SETTLED_TOPIC = keccak256("OrderSettled(bytes32,uint256,bytes32)");

    struct QueryProof {
        uint64 chainKey;
        uint64 blockHeight;
        bytes encodedTransaction;
        bytes32 merkleRoot;
        INativeQueryVerifier.MerkleProofEntry[] siblings;
        bytes32 lowerEndpointDigest;
        bytes32[] continuityRoots;
    }

    struct ExpectedOrder {
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
        uint64 logIndex;
    }

    address public immutable owner;
    uint64 public immutable sourceChainKey;
    address public immutable sourceEscrow;
    INativeQueryVerifier public immutable verifier;
    FacilityRegistry public immutable registry;
    mapping(bytes32 => bool) public processedQueries;

    event OrderEvidenceVerified(bytes32 indexed evidenceId, bytes32 indexed orderId, bytes32 queryKey);
    event LifecycleEvidenceVerified(
        bytes32 indexed orderId, FacilityRegistry.FacilityState state, bytes32 queryKey
    );
    event SourceContractUpdated(address indexed sourceEscrow);

    error Unauthorized();
    error UnsupportedChain();
    error MalformedProof();
    error VerificationFailed();
    error SourceTransactionFailed();
    error EventNotFound();
    error EmitterMismatch();
    error EventMismatch();
    error QueryProcessed();

    constructor(
        address initialOwner,
        uint64 chainKey,
        address escrow,
        INativeQueryVerifier nativeVerifier,
        FacilityRegistry facilityRegistry
    ) {
        owner = initialOwner == address(0) ? msg.sender : initialOwner;
        sourceChainKey = chainKey;
        sourceEscrow = escrow;
        verifier = nativeVerifier;
        registry = facilityRegistry;
        emit SourceContractUpdated(escrow);
    }

    function verifyOrderGuaranteed(QueryProof calldata proof, ExpectedOrder calldata expected)
        external
        returns (bytes32 evidenceId)
    {
        (EvmV1Decoder.LogEntry[] memory logs, bytes32 queryKey) =
            _verifyAndDecode(proof, ORDER_GUARANTEED_TOPIC, expected.logIndex);
        EvmV1Decoder.LogEntry memory log = _findLog(logs, expected.logIndex);
        if (log.address_ != sourceEscrow) revert EmitterMismatch();
        if (log.topics.length != 4) revert EventMismatch();
        if (log.topics[1] != expected.orderId) revert EventMismatch();
        if (address(uint160(uint256(log.topics[2]))) != expected.buyer) revert EventMismatch();
        if (address(uint160(uint256(log.topics[3]))) != expected.supplier) revert EventMismatch();

        (
            address settlementToken,
            uint256 orderValue,
            uint256 guaranteeAmount,
            uint64 deliveryDeadline,
            bytes32 termsCommitment,
            bytes32 buyerIdentityCommitment,
            bytes32 supplierIdentityCommitment,
            uint64 nonce
        ) = abi.decode(log.data, (address, uint256, uint256, uint64, bytes32, bytes32, bytes32, uint64));
        if (
            settlementToken != expected.settlementToken || orderValue != expected.orderValue
                || guaranteeAmount != expected.guaranteeAmount
                || deliveryDeadline != expected.deliveryDeadline
                || termsCommitment != expected.termsCommitment
                || buyerIdentityCommitment != expected.buyerIdentityCommitment
                || supplierIdentityCommitment != expected.supplierIdentityCommitment
                || nonce != expected.nonce
        ) revert EventMismatch();

        bytes32 fingerprint = keccak256(
            abi.encode(
                expected.buyerIdentityCommitment,
                expected.supplierIdentityCommitment,
                expected.orderId,
                expected.orderValue,
                expected.settlementToken,
                expected.deliveryDeadline,
                expected.termsCommitment
            )
        );
        evidenceId = keccak256(abi.encode(expected.orderId, queryKey));
        registry.registerEvidence(
            evidenceId,
            expected.orderId,
            fingerprint,
            expected.buyer,
            expected.supplier,
            expected.settlementToken,
            expected.orderValue,
            expected.guaranteeAmount,
            expected.deliveryDeadline,
            expected.termsCommitment,
            expected.buyerIdentityCommitment,
            expected.supplierIdentityCommitment,
            queryKey
        );
        processedQueries[queryKey] = true;
        emit OrderEvidenceVerified(evidenceId, expected.orderId, queryKey);
    }

    function verifyOrderCancelled(QueryProof calldata proof, bytes32 expectedOrderId, uint64 expectedLogIndex)
        external
    {
        (EvmV1Decoder.LogEntry[] memory logs, bytes32 queryKey) =
            _verifyAndDecode(proof, ORDER_CANCELLED_TOPIC, expectedLogIndex);
        EvmV1Decoder.LogEntry memory log = _findLog(logs, expectedLogIndex);
        if (log.address_ != sourceEscrow) revert EmitterMismatch();
        if (log.topics.length != 2 || log.topics[1] != expectedOrderId || log.data.length != 32) {
            revert EventMismatch();
        }
        registry.markCancelled(expectedOrderId);
        processedQueries[queryKey] = true;
        emit LifecycleEvidenceVerified(expectedOrderId, FacilityRegistry.FacilityState.Cancelled, queryKey);
    }

    function verifyOrderDisputed(QueryProof calldata proof, bytes32 expectedOrderId, uint64 expectedLogIndex)
        external
    {
        (EvmV1Decoder.LogEntry[] memory logs, bytes32 queryKey) =
            _verifyAndDecode(proof, ORDER_DISPUTED_TOPIC, expectedLogIndex);
        EvmV1Decoder.LogEntry memory log = _findLog(logs, expectedLogIndex);
        if (log.address_ != sourceEscrow) revert EmitterMismatch();
        if (log.topics.length != 2 || log.topics[1] != expectedOrderId || log.data.length != 32) {
            revert EventMismatch();
        }
        registry.markDisputed(expectedOrderId);
        processedQueries[queryKey] = true;
        emit LifecycleEvidenceVerified(expectedOrderId, FacilityRegistry.FacilityState.Disputed, queryKey);
    }

    function verifyOrderSettled(QueryProof calldata proof, bytes32 expectedOrderId, uint64 expectedLogIndex)
        external
    {
        (EvmV1Decoder.LogEntry[] memory logs, bytes32 queryKey) =
            _verifyAndDecode(proof, ORDER_SETTLED_TOPIC, expectedLogIndex);
        EvmV1Decoder.LogEntry memory log = _findLog(logs, expectedLogIndex);
        if (log.address_ != sourceEscrow) revert EmitterMismatch();
        if (log.topics.length != 2 || log.topics[1] != expectedOrderId || log.data.length != 64) {
            revert EventMismatch();
        }
        registry.markSettled(expectedOrderId);
        processedQueries[queryKey] = true;
        emit LifecycleEvidenceVerified(expectedOrderId, FacilityRegistry.FacilityState.Settled, queryKey);
    }

    function isProcessed(bytes32 queryKey) external view returns (bool) {
        return processedQueries[queryKey];
    }

    function _verifyAndDecode(QueryProof calldata proof, bytes32 eventTopic, uint64 expectedLogIndex)
        internal
        returns (EvmV1Decoder.LogEntry[] memory logs, bytes32 queryKey)
    {
        if (proof.chainKey != sourceChainKey) revert UnsupportedChain();
        if (proof.encodedTransaction.length == 0 || proof.continuityRoots.length == 0) {
            revert MalformedProof();
        }

        INativeQueryVerifier.MerkleProof memory merkleProof =
            INativeQueryVerifier.MerkleProof({ root: proof.merkleRoot, siblings: proof.siblings });
        INativeQueryVerifier.ContinuityProof memory continuityProof = INativeQueryVerifier.ContinuityProof({
            lowerEndpointDigest: proof.lowerEndpointDigest, roots: proof.continuityRoots
        });
        bool verified = verifier.verifyAndEmit(
            proof.chainKey, proof.blockHeight, proof.encodedTransaction, merkleProof, continuityProof
        );
        if (!verified) revert VerificationFailed();

        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(proof.encodedTransaction);
        if (receipt.receiptStatus != 1) revert SourceTransactionFailed();
        logs = receipt.receiptLogs;
        if (expectedLogIndex >= logs.length) revert EventNotFound();
        if (logs[expectedLogIndex].topics.length == 0 || logs[expectedLogIndex].topics[0] != eventTopic) {
            revert EventNotFound();
        }
        uint64 txIndex = verifier.calculateTxIndex(merkleProof);
        queryKey =
            keccak256(abi.encode(sourceChainKey, proof.blockHeight, txIndex, expectedLogIndex, sourceEscrow));
        if (processedQueries[queryKey]) revert QueryProcessed();
    }

    function _findLog(EvmV1Decoder.LogEntry[] memory logs, uint64 logIndex)
        internal
        pure
        returns (EvmV1Decoder.LogEntry memory log)
    {
        if (logIndex >= logs.length) revert EventNotFound();
        log = logs[logIndex];
        if (log.topics.length == 0) revert EventNotFound();
    }
}
