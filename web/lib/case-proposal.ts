import { z } from "zod";

import { FacilityQuoteSchema } from "@loomcredit/shared";

const BYTES32 = /^0x[a-fA-F0-9]{64}$/;

const policySchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED", "REFER"]),
    failureCode: z.string().optional(),
    requestedAdvanceMinor: z.number().int().nonnegative(),
    approvedAdvanceMinor: z.number().int().nonnegative(),
    checks: z.array(
      z
        .object({
          id: z.string().min(1),
          label: z.string().min(1),
          status: z.enum(["PASS", "FAIL", "NOT_APPLICABLE"]),
          actual: z.string(),
          limit: z.string(),
          failureCode: z.string().optional(),
        })
        .strict(),
    ),
  })
  .nullable();

export const publicProposalSchema = z
  .object({
    boundary: z.literal("LIVE_PROPOSAL"),
    requestId: z.string().min(16).max(80),
    sourceTxHash: z.string().regex(BYTES32),
    orderId: z.string().regex(BYTES32),
    evidenceId: z.string().regex(BYTES32),
    proofStatus: z.literal("LIVE_VERIFIED"),
    mode: z.enum(["MODEL", "REFER"]),
    provider: z.string().min(1).nullable(),
    model: z.string().min(1).nullable(),
    decision: z.enum(["APPROVED", "REJECTED", "REFER"]),
    terms: z
      .object({
        requestedAdvanceBps: z.number().int().min(0).max(10_000),
        requestedDeliveryDays: z.number().int().min(0).max(365),
        quotedAdvanceBps: z.number().int().min(0).max(10_000),
        evidenceTenorDays: z.number().int().nonnegative(),
        status: z.enum([
          "MATCHED",
          "REQUESTED_ADVANCE_EXCEEDED",
          "DELIVERY_EXCEEDS_EVIDENCE",
          "NOT_EVALUATED",
        ]),
      })
      .strict(),
    quote: FacilityQuoteSchema,
    policy: policySchema,
    signing: z
      .object({
        status: z.enum(["NOT_REQUESTED", "NOT_ELIGIBLE", "SIGNED"]),
      })
      .strict(),
  })
  .strict();

export type PublicProposal = z.infer<typeof publicProposalSchema>;

export function parsePublicProposal(value: unknown): PublicProposal | null {
  const result = publicProposalSchema.safeParse(value);
  return result.success ? result.data : null;
}
