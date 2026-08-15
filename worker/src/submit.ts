import {
  Interface,
  JsonRpcProvider,
  Wallet,
  type TransactionReceipt,
} from "ethers";

import type { WorkerConfig } from "./config.js";
import type {
  SourceOrderEvent,
  SourceOrderGuaranteed,
  SourceProof,
} from "./proof.js";
import type { SourceEventType } from "./event.js";
import { TerminalWorkerError } from "./errors.js";
import { configureRpcTransport } from "./network.js";

const TRADE_EVIDENCE_ABI = [
  "function verifyOrderGuaranteed((uint64 chainKey,uint64 blockHeight,bytes encodedTransaction,bytes32 merkleRoot,(bytes32 hash,bool isLeft)[] siblings,bytes32 lowerEndpointDigest,bytes32[] continuityRoots) proof,(bytes32 orderId,address buyer,address supplier,address settlementToken,uint128 orderValue,uint128 guaranteeAmount,uint64 deliveryDeadline,bytes32 termsCommitment,bytes32 buyerIdentityCommitment,bytes32 supplierIdentityCommitment,uint64 nonce,uint64 logIndex) expected) returns (bytes32 evidenceId)",
  "event OrderEvidenceVerified(bytes32 indexed evidenceId,bytes32 indexed orderId,bytes32 queryKey)",
  "function verifyOrderCancelled((uint64 chainKey,uint64 blockHeight,bytes encodedTransaction,bytes32 merkleRoot,(bytes32 hash,bool isLeft)[] siblings,bytes32 lowerEndpointDigest,bytes32[] continuityRoots) proof,bytes32 expectedOrderId,uint64 expectedLogIndex)",
  "function verifyOrderDisputed((uint64 chainKey,uint64 blockHeight,bytes encodedTransaction,bytes32 merkleRoot,(bytes32 hash,bool isLeft)[] siblings,bytes32 lowerEndpointDigest,bytes32[] continuityRoots) proof,bytes32 expectedOrderId,uint64 expectedLogIndex)",
  "function verifyOrderSettled((uint64 chainKey,uint64 blockHeight,bytes encodedTransaction,bytes32 merkleRoot,(bytes32 hash,bool isLeft)[] siblings,bytes32 lowerEndpointDigest,bytes32[] continuityRoots) proof,bytes32 expectedOrderId,uint64 expectedLogIndex)",
  "event LifecycleEvidenceVerified(bytes32 indexed orderId,uint8 state,bytes32 queryKey)",
];

const tradeEvidenceInterface = new Interface(TRADE_EVIDENCE_ABI);
const orderEvidenceVerifiedTopic = tradeEvidenceInterface.getEvent(
  "OrderEvidenceVerified",
)!.topicHash;
const lifecycleEvidenceVerifiedTopic = tradeEvidenceInterface.getEvent(
  "LifecycleEvidenceVerified",
)!.topicHash;
const MAX_LOG_RANGE = 2_000;

export interface CreditcoinSubmission {
  transactionHash: string;
  evidenceId: string | null;
}

export type SubmissionBroadcastHandler = (
  transactionHash: string,
) => void | Promise<void>;

function toProofTuple(proof: SourceProof): readonly unknown[] {
  return [
    proof.chainKey,
    proof.blockHeight,
    proof.encodedTransaction,
    proof.merkleRoot,
    proof.siblings.map((sibling) => [sibling.hash, sibling.isLeft]),
    proof.lowerEndpointDigest,
    proof.continuityRoots,
  ];
}

function toExpectedTuple(event: SourceOrderGuaranteed): readonly unknown[] {
  return [
    event.orderId,
    event.buyer,
    event.supplier,
    event.settlementToken,
    event.orderValue,
    event.guaranteeAmount,
    event.deliveryDeadline,
    event.termsCommitment,
    event.buyerIdentityCommitment,
    event.supplierIdentityCommitment,
    event.nonce,
    event.logIndex,
  ];
}

function lifecycleFunction(
  eventType: SourceEventType,
): "verifyOrderCancelled" | "verifyOrderDisputed" | "verifyOrderSettled" {
  if (eventType === "ORDER_CANCELLED") return "verifyOrderCancelled";
  if (eventType === "ORDER_DISPUTED") return "verifyOrderDisputed";
  if (eventType === "ORDER_SETTLED") return "verifyOrderSettled";
  throw new Error(`Unsupported lifecycle event type: ${eventType}`);
}

function lifecycleState(eventType: SourceEventType): number {
  if (eventType === "ORDER_CANCELLED") return 4;
  if (eventType === "ORDER_DISPUTED") return 5;
  if (eventType === "ORDER_SETTLED") return 6;
  throw new Error(`Unsupported lifecycle event type: ${eventType}`);
}

export class CreditcoinSubmitter {
  private readonly provider: JsonRpcProvider;
  private readonly wallet: Wallet;
  private readonly config: WorkerConfig;

  constructor(config: WorkerConfig) {
    configureRpcTransport();
    this.config = config;
    this.provider = new JsonRpcProvider(config.creditcoinRpcUrl);
    this.wallet = new Wallet(config.creditcoinWalletPrivateKey, this.provider);
  }

  async findExisting(
    orderId: string,
    eventType: SourceEventType = "ORDER_GUARANTEED",
  ): Promise<CreditcoinSubmission | null> {
    const startBlock = this.config.creditcoinStartBlock;
    if (startBlock === null) {
      throw new Error(
        "CONFIG_INVALID: CREDITCOIN_START_BLOCK or a deployment manifest block is required for receipt reconciliation",
      );
    }
    let toBlock = await this.provider.getBlockNumber();
    const topics =
      eventType === "ORDER_GUARANTEED"
        ? [orderEvidenceVerifiedTopic, null, orderId]
        : [lifecycleEvidenceVerifiedTopic, orderId];
    while (toBlock >= startBlock) {
      const fromBlock = Math.max(startBlock, toBlock - MAX_LOG_RANGE + 1);
      const logs = await this.provider.getLogs({
        address: this.config.tradeEvidenceUscAddress,
        fromBlock,
        toBlock,
        topics,
      });
      for (const log of logs) {
        let parsed;
        try {
          parsed = tradeEvidenceInterface.parseLog({
            topics: log.topics,
            data: log.data,
          });
        } catch {
          continue;
        }
        if (!parsed) continue;
        if (eventType === "ORDER_GUARANTEED") {
          if (
            parsed.name !== "OrderEvidenceVerified" ||
            String(parsed.args[1]).toLowerCase() !== orderId.toLowerCase()
          )
            continue;
        } else if (
          parsed.name !== "LifecycleEvidenceVerified" ||
          String(parsed.args[0]).toLowerCase() !== orderId.toLowerCase() ||
          Number(parsed.args[1]) !== lifecycleState(eventType)
        )
          continue;
        return {
          transactionHash: log.transactionHash,
          evidenceId:
            eventType === "ORDER_GUARANTEED" ? String(parsed.args[0]) : null,
        };
      }
      if (fromBlock === startBlock) break;
      toBlock = fromBlock - 1;
    }
    return null;
  }

  async submit(
    proof: SourceProof,
    event: SourceOrderEvent,
    onBroadcast?: SubmissionBroadcastHandler,
  ): Promise<CreditcoinSubmission> {
    const data =
      event.eventType === "ORDER_GUARANTEED"
        ? tradeEvidenceInterface.encodeFunctionData("verifyOrderGuaranteed", [
            toProofTuple(proof),
            toExpectedTuple(event),
          ])
        : tradeEvidenceInterface.encodeFunctionData(
            lifecycleFunction(event.eventType),
            [toProofTuple(proof), event.orderId, event.logIndex],
          );
    const gasLimit = await this.estimateGas(data, proof.continuityRoots.length);
    const transaction = await this.wallet.sendTransaction({
      to: this.config.tradeEvidenceUscAddress,
      data,
      gasLimit,
    });
    // Persist the hash before waiting for mining. A worker restart can then
    // inspect/confirm this exact transaction instead of broadcasting again.
    await onBroadcast?.(transaction.hash);
    const receipt = await transaction.wait();
    if (!receipt)
      throw new Error(
        `Creditcoin transaction is not mined: ${transaction.hash}`,
      );
    return {
      transactionHash: transaction.hash,
      evidenceId:
        event.eventType === "ORDER_GUARANTEED"
          ? evidenceIdFromReceipt(
              receipt,
              this.config.tradeEvidenceUscAddress,
              event.orderId,
              transaction.hash,
            )
          : lifecycleFromReceipt(
              receipt,
              this.config.tradeEvidenceUscAddress,
              event.orderId,
              event.eventType,
              transaction.hash,
            ),
    };
  }

  async confirm(
    transactionHash: string,
    orderId: string,
    eventType: SourceEventType = "ORDER_GUARANTEED",
  ): Promise<CreditcoinSubmission> {
    const receipt = await this.provider.getTransactionReceipt(transactionHash);
    if (!receipt)
      throw new Error(
        `Creditcoin transaction is not mined: ${transactionHash}`,
      );
    return {
      transactionHash,
      evidenceId:
        eventType === "ORDER_GUARANTEED"
          ? evidenceIdFromReceipt(
              receipt,
              this.config.tradeEvidenceUscAddress,
              orderId,
              transactionHash,
            )
          : lifecycleFromReceipt(
              receipt,
              this.config.tradeEvidenceUscAddress,
              orderId,
              eventType,
              transactionHash,
            ),
    };
  }

  private async estimateGas(
    data: string,
    continuityRootCount: number,
  ): Promise<bigint> {
    try {
      const estimate = await this.provider.estimateGas({
        from: this.wallet.address,
        to: this.config.tradeEvidenceUscAddress,
        data,
      });
      return (estimate * 120n) / 100n;
    } catch {
      // The USC precompile can be unavailable to eth_estimateGas even when the
      // state-changing call is valid. Keep a bounded fallback and surface any
      // actual send failure to the worker's retry state.
      return 1_500_000n + BigInt(continuityRootCount) * 50_000n;
    }
  }
}

function evidenceIdFromReceipt(
  receipt: TransactionReceipt,
  tradeEvidenceAddress: string,
  orderId: string,
  transactionHash: string,
): string {
  if (receipt.status !== 1)
    throw new TerminalWorkerError(
      `Creditcoin transaction failed: ${transactionHash}`,
    );
  const evidenceLog = receipt.logs
    .map((log) => {
      if (log.address.toLowerCase() !== tradeEvidenceAddress.toLowerCase())
        return null;
      try {
        return tradeEvidenceInterface.parseLog({
          topics: log.topics,
          data: log.data,
        });
      } catch {
        return null;
      }
    })
    .find((log) => log?.name === "OrderEvidenceVerified");
  if (!evidenceLog)
    throw new TerminalWorkerError(
      `Creditcoin receipt omitted OrderEvidenceVerified: ${transactionHash}`,
    );
  if (String(evidenceLog.args[1]).toLowerCase() !== orderId.toLowerCase()) {
    throw new TerminalWorkerError(
      `Creditcoin receipt evidence belongs to another order: ${transactionHash}`,
    );
  }
  return String(evidenceLog.args[0]);
}

function lifecycleFromReceipt(
  receipt: TransactionReceipt,
  tradeEvidenceAddress: string,
  orderId: string,
  eventType: Exclude<SourceEventType, "ORDER_GUARANTEED">,
  transactionHash: string,
): null {
  if (receipt.status !== 1)
    throw new TerminalWorkerError(
      `Creditcoin transaction failed: ${transactionHash}`,
    );
  const lifecycleLog = receipt.logs
    .map((log) => {
      if (log.address.toLowerCase() !== tradeEvidenceAddress.toLowerCase())
        return null;
      try {
        return tradeEvidenceInterface.parseLog({
          topics: log.topics,
          data: log.data,
        });
      } catch {
        return null;
      }
    })
    .find(
      (log) =>
        log?.name === "LifecycleEvidenceVerified" &&
        String(log.args[0]).toLowerCase() === orderId.toLowerCase() &&
        Number(log.args[1]) === lifecycleState(eventType),
    );
  if (!lifecycleLog)
    throw new TerminalWorkerError(
      `Creditcoin receipt omitted LifecycleEvidenceVerified: ${transactionHash}`,
    );
  return null;
}
