import { z } from "zod";

const BYTES32 = /^0x[a-fA-F0-9]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

const nullableBytes32 = z.string().regex(BYTES32).nullable();
const timestamp = z.string().regex(ISO_TIMESTAMP);
const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const nonNegativeIntegerString = z.string().regex(/^\d+$/);

const stage = z.enum([
  "DETECTED",
  "WAITING_FOR_ATTESTATION",
  "PROOF_REQUESTED",
  "PROOF_READY",
  "CREDITCOIN_SUBMITTED",
  "VERIFIED",
  "FAILED_RETRYABLE",
  "FAILED_TERMINAL",
]);

export const sourceOrderDetailsSchema = z
  .object({
    buyer: address,
    supplier: address,
    settlementToken: address,
    orderValueMinor: nonNegativeIntegerString,
    guaranteeAmountMinor: nonNegativeIntegerString,
    deliveryDeadline: z.number().int().nonnegative(),
    nonce: z.number().int().nonnegative(),
  })
  .strict();

export type SourceOrderDetails = z.infer<typeof sourceOrderDetailsSchema>;

export const liveEventSchema = z
  .object({
    sourceEventKey: z.string().min(1).max(512),
    sourceTxHash: z.string().regex(BYTES32),
    sourceChainKey: z.number().int().nonnegative(),
    sourceEmitter: z.string().max(128).nullable(),
    orderId: z.string().regex(BYTES32),
    eventType: z.enum([
      "ORDER_GUARANTEED",
      "ORDER_CANCELLED",
      "ORDER_DISPUTED",
      "ORDER_SETTLED",
    ]),
    txIndex: z.number().int().nonnegative().nullable(),
    logIndex: z.number().int().nonnegative(),
    stage,
    proofStatus: z.enum(["LIVE_VERIFIED", "PENDING", "FAILED"]),
    evidenceId: nullableBytes32,
    creditcoinTxHash: nullableBytes32,
    retryCount: z.number().int().nonnegative(),
    blockHeight: z.number().int().nonnegative().nullable(),
    sourceOrder: sourceOrderDetailsSchema.nullable(),
    // Older workers did not expose provenance. Treat that boundary as worker
    // live for backward compatibility; newly recovered records label their
    // recorded-testnet origin explicitly.
    provenance: z
      .enum(["WORKER_LIVE", "RECORDED_TESTNET"])
      .default("WORKER_LIVE"),
    stageTimestamps: z.record(z.string(), timestamp),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export const liveOrdersResponseSchema = z
  .object({
    boundary: z.literal("LIVE_EVIDENCE_STATUS_API"),
    orders: z.array(liveEventSchema).max(100),
  })
  .strict();

export type LiveOrdersResponse = z.infer<typeof liveOrdersResponseSchema>;
export type LiveEventStatus = z.infer<typeof liveEventSchema>;

export function parseLiveOrdersResponse(
  value: unknown,
): LiveOrdersResponse | null {
  const result = liveOrdersResponseSchema.safeParse(value);
  return result.success ? result.data : null;
}
