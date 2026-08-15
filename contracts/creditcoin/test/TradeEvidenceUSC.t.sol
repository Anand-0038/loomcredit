// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {FacilityRegistry} from "../src/FacilityRegistry.sol";
import {TradeEvidenceUSC} from "../src/TradeEvidenceUSC.sol";
import {INativeQueryVerifier} from "../src/interfaces/VerifierInterface.sol";
import {TestBase} from "./TestBase.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";

contract MockNativeVerifier is INativeQueryVerifier {
    function verifyAndEmit(uint64, uint64, bytes calldata, MerkleProof calldata, ContinuityProof calldata)
        external
        pure
        returns (bool)
    {
        return true;
    }

    function calculateTxIndex(MerkleProof calldata) external pure returns (uint64) {
        return 7;
    }
}

contract TradeEvidenceUSCTest is TestBase {
    FacilityRegistry private registry;
    MockNativeVerifier private verifier;
    TradeEvidenceUSC private usc;
    address private constant ESCROW = address(0xBEEF);
    address private constant BUYER = address(0x1001);
    address private constant SUPPLIER = address(0x1002);
    address private constant TOKEN = address(0x1003);
    bytes32 private constant TERMS = bytes32(uint256(11));
    bytes32 private constant BUYER_COMMITMENT = bytes32(uint256(12));
    bytes32 private constant SUPPLIER_COMMITMENT = bytes32(uint256(13));

    function setUp() public {
        registry = new FacilityRegistry(address(this));
        verifier = new MockNativeVerifier();
        usc = new TradeEvidenceUSC(address(this), 1, ESCROW, verifier, registry);
        registry.setEvidenceVerifier(address(usc));
    }

    function _encodedTransaction(bytes32 orderId, address emitter, uint8 receiptStatus)
        private
        pure
        returns (bytes memory)
    {
        bytes32[] memory topics = new bytes32[](4);
        topics[0] = keccak256(
            "OrderGuaranteed(bytes32,address,address,address,uint256,uint256,uint64,bytes32,bytes32,bytes32,uint64)"
        );
        topics[1] = orderId;
        topics[2] = bytes32(uint256(uint160(BUYER)));
        topics[3] = bytes32(uint256(uint160(SUPPLIER)));

        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = EvmV1Decoder.LogEntryTuple({
            address_: emitter,
            topics: topics,
            data: abi.encode(
                TOKEN,
                uint256(1_000_000),
                uint256(200_000),
                uint64(1_786_203_888),
                TERMS,
                BUYER_COMMITMENT,
                SUPPLIER_COMMITMENT,
                uint64(1)
            )
        });

        bytes[] memory chunks = new bytes[](3);
        chunks[0] = abi.encode(uint64(1), uint64(200_000), address(0xABCD), false, address(0), uint256(0), bytes(""));
        chunks[1] = abi.encode(uint128(1), uint256(27), bytes32(0), bytes32(0));
        chunks[2] = abi.encode(receiptStatus, uint64(20_000), logs, new bytes(256));
        return abi.encode(uint8(0), chunks);
    }

    function _proof(bytes memory encodedTransaction, uint64 blockHeight)
        private
        pure
        returns (TradeEvidenceUSC.QueryProof memory proof)
    {
        INativeQueryVerifier.MerkleProofEntry[] memory siblings = new INativeQueryVerifier.MerkleProofEntry[](1);
        siblings[0] = INativeQueryVerifier.MerkleProofEntry({hash: bytes32(uint256(1)), isLeft: false});
        bytes32[] memory continuityRoots = new bytes32[](1);
        continuityRoots[0] = bytes32(uint256(2));
        proof = TradeEvidenceUSC.QueryProof({
            chainKey: 1,
            blockHeight: blockHeight,
            encodedTransaction: encodedTransaction,
            merkleRoot: bytes32(uint256(3)),
            siblings: siblings,
            lowerEndpointDigest: bytes32(uint256(4)),
            continuityRoots: continuityRoots
        });
    }

    function _encodedLifecycleTransaction(bytes32 orderId, bytes32 eventTopic, bytes memory data)
        private
        pure
        returns (bytes memory)
    {
        bytes32[] memory topics = new bytes32[](2);
        topics[0] = eventTopic;
        topics[1] = orderId;

        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = EvmV1Decoder.LogEntryTuple({address_: ESCROW, topics: topics, data: data});

        bytes[] memory chunks = new bytes[](3);
        chunks[0] = abi.encode(uint64(1), uint64(200_000), address(0xABCD), false, address(0), uint256(0), bytes(""));
        chunks[1] = abi.encode(uint128(1), uint256(27), bytes32(0), bytes32(0));
        chunks[2] = abi.encode(uint8(1), uint64(20_000), logs, new bytes(256));
        return abi.encode(uint8(0), chunks);
    }

    function _expected(bytes32 orderId) private pure returns (TradeEvidenceUSC.ExpectedOrder memory expected) {
        expected = TradeEvidenceUSC.ExpectedOrder({
            orderId: orderId,
            buyer: BUYER,
            supplier: SUPPLIER,
            settlementToken: TOKEN,
            orderValue: 1_000_000,
            guaranteeAmount: 200_000,
            deliveryDeadline: 1_786_203_888,
            termsCommitment: TERMS,
            buyerIdentityCommitment: BUYER_COMMITMENT,
            supplierIdentityCommitment: SUPPLIER_COMMITMENT,
            nonce: 1,
            logIndex: 0
        });
    }

    function testRegistersOnlySuccessfulTrustedEvent() public {
        bytes32 orderId = bytes32(uint256(1));
        bytes32 evidenceId =
            usc.verifyOrderGuaranteed(_proof(_encodedTransaction(orderId, ESCROW, 1), 100), _expected(orderId));

        FacilityRegistry.TradeEvidence memory evidence = registry.getEvidence(orderId);
        assertEq(evidence.evidenceId, evidenceId);
        assertEq(uint256(evidence.state), uint256(FacilityRegistry.FacilityState.EvidenceVerified));
    }

    function testRejectsFailedReceipt() public {
        bytes32 orderId = bytes32(uint256(2));
        vm.expectRevert(TradeEvidenceUSC.SourceTransactionFailed.selector);
        usc.verifyOrderGuaranteed(_proof(_encodedTransaction(orderId, ESCROW, 0), 101), _expected(orderId));
    }

    function testRejectsFakeEmitter() public {
        bytes32 orderId = bytes32(uint256(3));
        vm.expectRevert(TradeEvidenceUSC.EmitterMismatch.selector);
        usc.verifyOrderGuaranteed(_proof(_encodedTransaction(orderId, address(0xCAFE), 1), 102), _expected(orderId));
    }

    function testRejectsReplay() public {
        bytes32 orderId = bytes32(uint256(4));
        TradeEvidenceUSC.QueryProof memory proof = _proof(_encodedTransaction(orderId, ESCROW, 1), 103);
        usc.verifyOrderGuaranteed(proof, _expected(orderId));

        vm.expectRevert(TradeEvidenceUSC.QueryProcessed.selector);
        usc.verifyOrderGuaranteed(proof, _expected(orderId));
    }

    function testRegistersProofBackedCancellation() public {
        bytes32 orderId = bytes32(uint256(5));
        usc.verifyOrderGuaranteed(_proof(_encodedTransaction(orderId, ESCROW, 1), 104), _expected(orderId));

        bytes memory encodedCancellation = _encodedLifecycleTransaction(
            orderId, keccak256("OrderCancelled(bytes32,bytes32)"), abi.encode(bytes32(uint256(99)))
        );
        usc.verifyOrderCancelled(_proof(encodedCancellation, 105), orderId, 0);

        FacilityRegistry.TradeEvidence memory evidence = registry.getEvidence(orderId);
        assertEq(uint256(evidence.state), uint256(FacilityRegistry.FacilityState.Cancelled));
    }

    function testLifecycleReplayPreventsRetryOnlyAfterSuccess() public {
        bytes32 orderId = bytes32(uint256(6));
        bytes memory encodedCancellation = _encodedLifecycleTransaction(
            orderId, keccak256("OrderCancelled(bytes32,bytes32)"), abi.encode(bytes32(uint256(99)))
        );
        TradeEvidenceUSC.QueryProof memory proof = _proof(encodedCancellation, 106);
        bytes32 queryKey = keccak256(abi.encode(uint64(1), uint64(106), uint64(7), uint64(0), ESCROW));

        vm.expectRevert(FacilityRegistry.UnknownOrder.selector);
        usc.verifyOrderCancelled(proof, orderId, 0);
        assertTrue(!usc.isProcessed(queryKey));

        usc.verifyOrderGuaranteed(_proof(_encodedTransaction(orderId, ESCROW, 1), 107), _expected(orderId));
        usc.verifyOrderCancelled(proof, orderId, 0);
        assertTrue(usc.isProcessed(queryKey));

        vm.expectRevert(TradeEvidenceUSC.QueryProcessed.selector);
        usc.verifyOrderCancelled(proof, orderId, 0);
    }
}
