import { Interface, JsonRpcProvider, type TransactionReceipt } from "ethers";
import { proofProvider } from "@gluwa/usc-sdk";

import type { WorkerConfig } from "./config.js";
import { TerminalWorkerError } from "./errors.js";
import { configureRpcTransport } from "./network.js";
import type { SourceEventType } from "./event.js";

export const ORDER_GUARANTEED_EVENT =
  "event OrderGuaranteed(bytes32 indexed orderId,address indexed buyer,address indexed supplier,address settlementToken,uint256 orderValue,uint256 guaranteeAmount,uint64 deliveryDeadline,bytes32 termsCommitment,bytes32 buyerIdentityCommitment,bytes32 supplierIdentityCommitment,uint64 nonce)";
export const ORDER_CANCELLED_EVENT =
  "event OrderCancelled(bytes32 indexed orderId,bytes32 reasonCommitment)";
export const ORDER_DISPUTED_EVENT =
  "event OrderDisputed(bytes32 indexed orderId,bytes32 disputeCommitment)";
export const ORDER_SETTLED_EVENT =
  "event OrderSettled(bytes32 indexed orderId,uint256 settlementAmount,bytes32 settlementReference)";

export const sourceInterface = new Interface([
  ORDER_GUARANTEED_EVENT,
  ORDER_CANCELLED_EVENT,
  ORDER_DISPUTED_EVENT,
  ORDER_SETTLED_EVENT,
]);

export interface SourceOrderGuaranteed {
  eventType: "ORDER_GUARANTEED";
  sourceTxHash: string;
  sourceEmitter: string;
  blockHeight: number;
  txIndex: number;
  logIndex: number;
  orderId: string;
  buyer: string;
  supplier: string;
  settlementToken: string;
  orderValue: bigint;
  guaranteeAmount: bigint;
  deliveryDeadline: number;
  termsCommitment: string;
  buyerIdentityCommitment: string;
  supplierIdentityCommitment: string;
  nonce: number;
}

export interface SourceOrderLifecycle {
  eventType: Exclude<SourceEventType, "ORDER_GUARANTEED">;
  sourceTxHash: string;
  sourceEmitter: string;
  blockHeight: number;
  txIndex: number;
  logIndex: number;
  orderId: string;
}

export type SourceOrderEvent = SourceOrderGuaranteed | SourceOrderLifecycle;

export interface SourceProof {
  chainKey: number;
  blockHeight: number;
  txIndex: number;
  encodedTransaction: string;
  merkleRoot: string;
  siblings: Array<{ hash: string; isLeft: boolean }>;
  lowerEndpointDigest: string;
  continuityRoots: string[];
}

export interface SourceInspection {
  receipt: TransactionReceipt;
  event: SourceOrderEvent;
}

function asNumber(value: unknown, field: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new TerminalWorkerError(
      `Source event field ${field} is not a safe integer`,
    );
  return result;
}

export function parseOrderGuaranteedLog(
  txHash: string,
  sourceEscrowAddress: string,
  receipt: TransactionReceipt,
  expectedOrderId?: string,
): SourceOrderGuaranteed {
  // The USC decoder addresses logs by their position in the transaction
  // receipt. Ethers' Log.index is the log's block-wide index, so it must not
  // be passed to TradeEvidenceUSC as the receipt log index.
  for (const [receiptLogIndex, log] of receipt.logs.entries()) {
    if (log.address.toLowerCase() !== sourceEscrowAddress.toLowerCase())
      continue;
    let parsed;
    try {
      parsed = sourceInterface.parseLog({ topics: log.topics, data: log.data });
    } catch {
      continue;
    }
    if (!parsed || parsed.name !== "OrderGuaranteed") continue;
    const args = parsed.args;
    if (
      expectedOrderId &&
      String(args[0]).toLowerCase() !== expectedOrderId.toLowerCase()
    ) {
      continue;
    }
    if (receipt.blockNumber === null)
      throw new TerminalWorkerError("Source receipt has no mined block");
    return {
      eventType: "ORDER_GUARANTEED",
      sourceTxHash: txHash,
      sourceEmitter: log.address,
      blockHeight: receipt.blockNumber,
      txIndex: log.transactionIndex,
      logIndex: receiptLogIndex,
      orderId: String(args[0]),
      buyer: String(args[1]),
      supplier: String(args[2]),
      settlementToken: String(args[3]),
      orderValue: BigInt(args[4]),
      guaranteeAmount: BigInt(args[5]),
      deliveryDeadline: asNumber(args[6], "deliveryDeadline"),
      termsCommitment: String(args[7]),
      buyerIdentityCommitment: String(args[8]),
      supplierIdentityCommitment: String(args[9]),
      nonce: asNumber(args[10], "nonce"),
    };
  }
  throw new TerminalWorkerError(
    `No OrderGuaranteed event from configured escrow in ${txHash}`,
  );
}

const lifecycleEventTypes: Record<
  string,
  Exclude<SourceEventType, "ORDER_GUARANTEED">
> = {
  OrderCancelled: "ORDER_CANCELLED",
  OrderDisputed: "ORDER_DISPUTED",
  OrderSettled: "ORDER_SETTLED",
};

export function parseSourceEventLog(
  txHash: string,
  sourceEscrowAddress: string,
  receipt: TransactionReceipt,
  expectedOrderId?: string,
  expectedEventType?: SourceEventType,
): SourceOrderEvent {
  try {
    if (expectedEventType && expectedEventType !== "ORDER_GUARANTEED") {
      throw new Error("skip guaranteed parser");
    }
    return parseOrderGuaranteedLog(
      txHash,
      sourceEscrowAddress,
      receipt,
      expectedOrderId,
    );
  } catch {
    // A lifecycle transaction has no OrderGuaranteed payload. Continue with
    // the narrow lifecycle event parser below.
  }

  for (const [receiptLogIndex, log] of receipt.logs.entries()) {
    if (log.address.toLowerCase() !== sourceEscrowAddress.toLowerCase())
      continue;
    let parsed;
    try {
      parsed = sourceInterface.parseLog({ topics: log.topics, data: log.data });
    } catch {
      continue;
    }
    if (!parsed) continue;
    const eventType = lifecycleEventTypes[parsed.name];
    if (!eventType) continue;
    if (expectedEventType && eventType !== expectedEventType) continue;
    const orderId = String(parsed.args[0]);
    if (
      expectedOrderId &&
      orderId.toLowerCase() !== expectedOrderId.toLowerCase()
    ) {
      continue;
    }
    if (receipt.blockNumber === null)
      throw new TerminalWorkerError("Source receipt has no mined block");
    return {
      eventType,
      sourceTxHash: txHash,
      sourceEmitter: log.address,
      blockHeight: receipt.blockNumber,
      txIndex: log.transactionIndex,
      logIndex: receiptLogIndex,
      orderId,
    };
  }
  throw new TerminalWorkerError(
    `No supported source event from configured escrow in ${txHash}`,
  );
}

export class UscProofClient {
  private readonly sourceProvider: JsonRpcProvider;
  private readonly proofBuilder: proofProvider.service.ProofBuilder;
  private readonly config: WorkerConfig;

  constructor(config: WorkerConfig) {
    configureRpcTransport();
    this.config = config;
    this.sourceProvider = new JsonRpcProvider(config.sourceChainRpcUrl);
    this.proofBuilder = new proofProvider.service.ProofBuilder(
      config.sourceChainKey,
      config.proofBuilderUrl,
    );
  }

  async inspectTransaction(
    sourceTxHash: string,
    expectedOrderId?: string,
    expectedEventType?: SourceEventType,
  ): Promise<SourceInspection> {
    const transaction = await this.sourceProvider.getTransaction(sourceTxHash);
    if (!transaction)
      throw new Error(`Source transaction not found: ${sourceTxHash}`);
    const receipt =
      await this.sourceProvider.getTransactionReceipt(sourceTxHash);
    if (!receipt)
      throw new Error(`Source transaction is not mined: ${sourceTxHash}`);
    if (receipt.status !== 1)
      throw new TerminalWorkerError(
        `Source transaction failed: ${sourceTxHash}`,
      );
    return {
      receipt,
      event: parseSourceEventLog(
        sourceTxHash,
        this.config.sourceEscrowAddress,
        receipt,
        expectedOrderId,
        expectedEventType,
      ),
    };
  }

  async getProof(
    inspection: SourceInspection,
    onStatus?: (status: "WAITING_FOR_ATTESTATION" | "PROOF_REQUESTED") => void,
  ): Promise<SourceProof> {
    const blockHeight = inspection.receipt.blockNumber;
    if (blockHeight === null)
      throw new TerminalWorkerError("Source receipt has no block height");
    onStatus?.("WAITING_FOR_ATTESTATION");
    await this.proofBuilder.waitUntilHeightAttested(
      this.config.sourceChainKey,
      blockHeight,
      15_000,
      1_200_000,
    );
    onStatus?.("PROOF_REQUESTED");
    const result = await this.proofBuilder.getProof(
      inspection.event.sourceTxHash,
    );
    if (!result.success || !result.data) {
      throw new Error(
        `USC proof builder rejected transaction: ${result.error ?? "unknown error"}`,
      );
    }
    const proof = normalizeProof(
      result.data,
      this.config.sourceChainKey,
      inspection.event.sourceTxHash,
    );
    if (
      proof.blockHeight !== inspection.event.blockHeight ||
      proof.txIndex !== inspection.event.txIndex
    ) {
      throw new TerminalWorkerError(
        "USC proof block or transaction index does not match the source receipt",
      );
    }
    return proof;
  }
}

function normalizeProof(
  response: proofProvider.ContinuityResponse,
  sourceChainKey: number,
  sourceTxHash: string,
): SourceProof {
  if (response.chainKey !== sourceChainKey)
    throw new TerminalWorkerError("USC proof returned an unexpected chain key");
  if (response.txHash.toLowerCase() !== sourceTxHash.toLowerCase()) {
    throw new TerminalWorkerError(
      "USC proof returned a different transaction hash",
    );
  }
  if (response.continuityProof.roots.length === 0)
    throw new TerminalWorkerError("USC proof has no continuity roots");
  return {
    chainKey: response.chainKey,
    blockHeight: response.headerNumber,
    txIndex: response.txIndex,
    encodedTransaction: response.txBytes,
    merkleRoot: response.merkleProof.root,
    siblings: response.merkleProof.siblings.map((sibling) => ({
      hash: sibling.hash,
      isLeft: sibling.isLeft,
    })),
    lowerEndpointDigest: response.continuityProof.lowerEndpointDigest,
    continuityRoots: response.continuityProof.roots,
  };
}
