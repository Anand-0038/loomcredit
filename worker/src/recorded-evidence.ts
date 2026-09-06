import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { createEvent } from "./event.js";
import type { WorkerConfig } from "./config.js";
import type { CrossChainEvent, EventStore } from "./store.js";

const BYTES32 = /^0x[a-fA-F0-9]{64}$/;
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Recorded evidence ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Recorded evidence ${label} must be a non-empty string`);
  }
  return value;
}

function bytes32(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (!BYTES32.test(parsed)) {
    throw new Error(`Recorded evidence ${label} must be a bytes32 value`);
  }
  return parsed;
}

function address(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (!ADDRESS.test(parsed)) {
    throw new Error(`Recorded evidence ${label} must be an EVM address`);
  }
  return parsed;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(
      `Recorded evidence ${label} must be a non-negative integer`,
    );
  }
  return value as number;
}

function decimal(value: unknown, label: string): string {
  const parsed = typeof value === "number" ? String(value) : value;
  if (typeof parsed !== "string" || !/^\d+$/.test(parsed)) {
    throw new Error(`Recorded evidence ${label} must be a decimal integer`);
  }
  return parsed;
}

function timestampMap(value: unknown): CrossChainEvent["stageTimestamps"] {
  const input = object(value, "worker.stageTimestamps");
  const timestamps: CrossChainEvent["stageTimestamps"] = {};
  for (const [stage, timestamp] of Object.entries(input)) {
    if (typeof timestamp === "string" && !Number.isNaN(Date.parse(timestamp))) {
      timestamps[stage as keyof CrossChainEvent["stageTimestamps"]] = timestamp;
    }
  }
  if (!timestamps.VERIFIED) {
    throw new Error(
      "Recorded evidence worker.stageTimestamps.VERIFIED is required",
    );
  }
  return timestamps;
}

function readJson(path: string): Record<string, unknown> {
  const candidates = isAbsolute(path)
    ? [path]
    : [resolve(process.cwd(), path), resolve(process.cwd(), "..", path)];
  for (const candidate of candidates) {
    try {
      return object(JSON.parse(readFileSync(candidate, "utf8")), path);
    } catch (error) {
      if (error instanceof SyntaxError) throw error;
    }
  }
  throw new Error(`Recorded evidence manifest is unreadable: ${path}`);
}

/**
 * Hydrates only a bundled, independently recorded testnet receipt when an
 * empty worker database starts. This gives the read-only status feed a durable
 * recovery baseline without calling a provider, broadcasting a transaction,
 * or presenting the record as a fresh worker action.
 */
export function hydrateRecordedEvidence(
  store: EventStore,
  config: Pick<
    WorkerConfig,
    | "sourceChainKey"
    | "sourceEscrowAddress"
    | "recordedEvidenceManifestPath"
    | "recordedSourceOrderManifestPath"
  >,
): CrossChainEvent | null {
  const evidence = readJson(config.recordedEvidenceManifestPath);
  const sourceOrder = readJson(config.recordedSourceOrderManifestPath);
  const source = object(evidence.source, "source");
  const creditcoin = object(evidence.creditcoin, "creditcoin");
  const worker = object(evidence.worker, "worker");
  const order = object(sourceOrder.order, "source order");

  const sourceTxHash = bytes32(
    source.transactionHash,
    "source.transactionHash",
  );
  const orderId = bytes32(source.orderId, "source.orderId");
  if (
    orderId.toLowerCase() !==
    bytes32(order.orderId, "order.orderId").toLowerCase()
  ) {
    throw new Error("Recorded evidence order IDs do not match");
  }
  if (
    address(
      sourceOrder.sourceEscrow,
      "sourceOrder.sourceEscrow",
    ).toLowerCase() !== config.sourceEscrowAddress.toLowerCase()
  ) {
    throw new Error(
      "Recorded evidence source escrow does not match worker config",
    );
  }

  const event = createEvent(
    sourceTxHash,
    config.sourceChainKey,
    orderId,
    integer(source.blockNumber, "source.blockNumber"),
    integer(source.txIndex, "source.txIndex"),
    integer(source.blockLogIndex, "source.blockLogIndex"),
    config.sourceEscrowAddress,
  );
  const existing = store.getBySourceEventKey(event.sourceEventKey);
  if (existing) return null;

  const stage = string(worker.stage, "worker.stage");
  if (stage !== "VERIFIED") {
    throw new Error("Recorded evidence worker.stage must be VERIFIED");
  }
  const timestamps = timestampMap(worker.stageTimestamps);
  const verifiedAt = timestamps.VERIFIED!;
  const hydrated: CrossChainEvent = {
    ...event,
    stage: "VERIFIED",
    retryCount: integer(worker.retryCount, "worker.retryCount"),
    evidenceId: bytes32(creditcoin.evidenceId, "creditcoin.evidenceId"),
    creditcoinTxHash: bytes32(
      creditcoin.verificationTransactionHash,
      "creditcoin.verificationTransactionHash",
    ),
    sourceOrder: {
      buyer: address(sourceOrder.buyer, "sourceOrder.buyer"),
      supplier: address(sourceOrder.supplier, "sourceOrder.supplier"),
      settlementToken: address(
        sourceOrder.settlementToken,
        "sourceOrder.settlementToken",
      ),
      orderValueMinor: decimal(order.orderValue, "order.orderValue"),
      guaranteeAmountMinor: decimal(
        order.guaranteeAmount,
        "order.guaranteeAmount",
      ),
      deliveryDeadline: Number(
        decimal(order.deliveryDeadline, "order.deliveryDeadline"),
      ),
      nonce: Number(decimal(order.nonce, "order.nonce")),
    },
    provenance: "RECORDED_TESTNET",
    stageTimestamps: timestamps,
    createdAt: string(evidence.generatedAt, "generatedAt"),
    updatedAt: verifiedAt,
  };
  return store.upsert(hydrated);
}
