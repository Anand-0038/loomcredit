import { z } from "zod";

const BYTES32 = /^0x[a-fA-F0-9]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

const nullableBytes32 = z.string().regex(BYTES32).nullable();
const timestamp = z.string().regex(ISO_TIMESTAMP);

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

const liveEvent = z
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
    stageTimestamps: z.record(z.string(), timestamp),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export const liveOrdersResponseSchema = z
  .object({
    boundary: z.literal("LIVE_EVIDENCE_STATUS_API"),
    orders: z.array(liveEvent).max(100),
  })
  .strict();

export type LiveOrdersResponse = z.infer<typeof liveOrdersResponseSchema>;

export function parseLiveOrdersResponse(
  value: unknown,
): LiveOrdersResponse | null {
  const result = liveOrdersResponseSchema.safeParse(value);
  return result.success ? result.data : null;
}
