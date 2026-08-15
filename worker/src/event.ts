import type { CrossChainEvent } from "./store.js";

export const SOURCE_EVENT_TYPES = [
  "ORDER_GUARANTEED",
  "ORDER_CANCELLED",
  "ORDER_DISPUTED",
  "ORDER_SETTLED",
] as const;

export type SourceEventType = (typeof SOURCE_EVENT_TYPES)[number];

export function sourceEventKey(
  sourceChainKey: number,
  sourceTxHash: string,
  orderId: string,
  sourceEmitter: string | null,
  eventType: SourceEventType = "ORDER_GUARANTEED",
): string {
  return [
    sourceChainKey,
    sourceTxHash.toLowerCase(),
    sourceEmitter?.toLowerCase() ?? "unknown-emitter",
    orderId.toLowerCase(),
    eventType,
  ].join(":");
}

export function createEvent(
  sourceTxHash: string,
  sourceChainKey: number,
  orderId: string,
  blockHeight: number,
  txIndex: number,
  logIndex: number,
  sourceEmitter: string | null = null,
  eventType: SourceEventType = "ORDER_GUARANTEED",
): CrossChainEvent {
  const now = new Date().toISOString();
  return {
    sourceEventKey: sourceEventKey(
      sourceChainKey,
      sourceTxHash,
      orderId,
      sourceEmitter,
      eventType,
    ),
    sourceTxHash,
    sourceChainKey,
    sourceEmitter,
    blockHeight,
    txIndex,
    logIndex,
    orderId,
    eventType,
    stage: "DETECTED",
    retryCount: 0,
    evidenceId: null,
    creditcoinTxHash: null,
    lastError: null,
    stageTimestamps: { DETECTED: now },
    createdAt: now,
    updatedAt: now,
  };
}
