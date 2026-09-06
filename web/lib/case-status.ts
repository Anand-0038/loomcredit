import { z } from "zod";

import { liveEventSchema } from "./live-evidence-schema";
import { publicProposalSchema, type PublicProposal } from "./case-proposal";

const TX_HASH = /^0x[a-fA-F0-9]{64}$/;
const BYTES32 = /^0x[a-fA-F0-9]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

const intakeStatus = z.enum([
  "ACCEPTED",
  "PROCESSING",
  "COMPLETED",
  "FAILED_RETRYABLE",
  "FAILED_TERMINAL",
]);

export const publicIntakeSchema = z
  .object({
    requestId: z.string().min(16).max(80),
    sourceTxHash: z.string().regex(TX_HASH),
    expectedOrderId: z.string().regex(BYTES32).nullable(),
    expectedEventType: z.enum([
      "ORDER_GUARANTEED",
      "ORDER_CANCELLED",
      "ORDER_DISPUTED",
      "ORDER_SETTLED",
    ]),
    status: intakeStatus,
    failureCode: z.literal("PROCESSING_FAILED").nullable(),
    order: liveEventSchema.nullable(),
    history: z.array(liveEventSchema).max(100),
    createdAt: z.string().regex(ISO_TIMESTAMP),
    updatedAt: z.string().regex(ISO_TIMESTAMP),
  })
  .strict();

export const workerIntakeResponseSchema = z
  .object({
    boundary: z.literal("LIVE_EVIDENCE_STATUS_API"),
    intake: publicIntakeSchema,
    code: z.string().min(1).optional(),
    error: z.string().min(1).optional(),
  })
  .strict();

export type PublicIntakeStatus = z.infer<typeof publicIntakeSchema>;
export type WorkerIntakeResponse = z.infer<typeof workerIntakeResponseSchema>;

export const publicCaseSchema = z
  .object({
    caseId: z.string().min(16).max(80),
    sourceTxHash: z.string().regex(TX_HASH),
    requestedAdvanceBps: z.number().int().min(0).max(10_000),
    deliveryDays: z.number().int().min(0).max(365),
    role: z.enum(["lender", "marketplace", "supplier"]),
    status: z.enum([
      "SUBMITTED",
      "PROCESSING",
      "COMPLETED",
      "FAILED_RETRYABLE",
      "FAILED_TERMINAL",
      "WORKER_UNAVAILABLE",
    ]),
    createdAt: z.string().regex(ISO_TIMESTAMP),
    updatedAt: z.string().regex(ISO_TIMESTAMP),
  })
  .strict();

export const publicCaseReviewSchema = z
  .object({
    reviewId: z.string().uuid(),
    decision: z.enum([
      "ACCEPT_RECOMMENDATION",
      "REFER_FOR_INFORMATION",
      "DECLINE_CASE",
    ]),
    note: z.string().max(1_000).nullable(),
    actorAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    proposalEvidenceId: z.string().regex(BYTES32),
    proposalFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    proposalDecision: z.enum(["APPROVED", "REJECTED", "REFER"]),
    createdAt: z.string().regex(ISO_TIMESTAMP),
  })
  .strict();

export const publicCaseResponseSchema = z
  .object({
    boundary: z.literal("LIVE_CASE_INTAKE"),
    case: publicCaseSchema,
    intake: publicIntakeSchema.nullable(),
    proposal: publicProposalSchema.nullable(),
    reviews: z.array(publicCaseReviewSchema).max(100),
  })
  .strict();

const publicCaseListItemSchema = publicCaseSchema
  .extend({
    proposalAvailable: z.boolean(),
    latestReview: publicCaseReviewSchema.nullable(),
  })
  .strict();

export const publicCaseListResponseSchema = z
  .object({
    boundary: z.literal("LIVE_CASE_INTAKE"),
    cases: z.array(publicCaseListItemSchema).max(100),
  })
  .strict();

const publicCaseErrorResponseSchema = z
  .object({
    boundary: z.literal("LIVE_CASE_INTAKE"),
    code: z.string().min(1),
    error: z.string().min(1),
    case: publicCaseSchema,
    intake: publicIntakeSchema.nullable(),
    proposal: publicProposalSchema.nullable().optional(),
    reviews: z.array(publicCaseReviewSchema).max(100).optional(),
  })
  .strict();

export interface PublicFinanceCase {
  caseId: string;
  sourceTxHash: string;
  requestedAdvanceBps: number;
  deliveryDays: number;
  role: "lender" | "marketplace" | "supplier";
  status:
    | "SUBMITTED"
    | "PROCESSING"
    | "COMPLETED"
    | "FAILED_RETRYABLE"
    | "FAILED_TERMINAL"
    | "WORKER_UNAVAILABLE";
  createdAt: string;
  updatedAt: string;
}

export interface PublicCaseResponse {
  boundary: "LIVE_CASE_INTAKE";
  case: PublicFinanceCase;
  intake: PublicIntakeStatus | null;
  proposal: PublicProposal | null;
  reviews: PublicCaseReview[];
}

export type PublicCaseReview = z.infer<typeof publicCaseReviewSchema>;

export interface PublicCaseListResponse {
  boundary: "LIVE_CASE_INTAKE";
  cases: Array<
    PublicFinanceCase & {
      proposalAvailable: boolean;
      latestReview: PublicCaseReview | null;
    }
  >;
}

export function parseWorkerIntakeResponse(
  value: unknown,
): WorkerIntakeResponse | null {
  const result = workerIntakeResponseSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function parsePublicCaseResponse(
  value: unknown,
): PublicCaseResponse | null {
  const result = publicCaseResponseSchema.safeParse(value);
  if (result.success) return result.data;

  const errorResult = publicCaseErrorResponseSchema.safeParse(value);
  if (!errorResult.success) return null;
  return {
    boundary: errorResult.data.boundary,
    case: errorResult.data.case,
    intake: errorResult.data.intake,
    proposal: errorResult.data.proposal ?? null,
    reviews: errorResult.data.reviews ?? [],
  };
}

export function parsePublicCaseListResponse(
  value: unknown,
): PublicCaseListResponse | null {
  const result = publicCaseListResponseSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function caseStatusFromIntake(
  intake: PublicIntakeStatus,
): PublicFinanceCase["status"] {
  if (intake.status === "COMPLETED") return "COMPLETED";
  if (intake.status === "FAILED_TERMINAL") return "FAILED_TERMINAL";
  if (intake.status === "FAILED_RETRYABLE") return "FAILED_RETRYABLE";
  return "PROCESSING";
}
