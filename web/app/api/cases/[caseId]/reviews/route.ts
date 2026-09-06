import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AuthProtocolError,
  AuthorizationError,
  isTrustedAuthOrigin,
  requirePrivilegedSession,
} from "../../../../../lib/auth";
import {
  CASE_REVIEW_DECISIONS,
  CaseStore,
  type CaseReviewEvent,
} from "../../../../../lib/case-store";
import { parsePublicProposal } from "../../../../../lib/case-proposal";
import { proposalFingerprint } from "../../../../../lib/case-proposal-fingerprint";
import { parseWorkerIntakeResponse } from "../../../../../lib/case-status";
import { resolveLiveEvidenceApiUrl } from "../../../../../lib/live-evidence";
import {
  readJsonBody,
  RequestBodyError,
} from "../../../../../lib/request-body";
import { consumeRateLimit } from "../../../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InputSchema = z
  .object({
    decision: z.enum(CASE_REVIEW_DECISIONS),
    note: z.string().trim().max(1_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.decision !== "ACCEPT_RECOMMENDATION" &&
      (!value.note || value.note.length < 3)
    ) {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "A short reason is required for referrals and declines.",
      });
    }
  });

const UPSTREAM_TIMEOUT_MS = 8_000;

function response(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function errorResponse(
  code: string,
  error: string,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 502 | 503,
) {
  return response({ boundary: "CASE_REVIEW", code, error }, status);
}

function publicReview(review: CaseReviewEvent) {
  return {
    reviewId: review.reviewId,
    decision: review.decision,
    note: review.note,
    actorAddress: review.actorAddress,
    proposalEvidenceId: review.proposalEvidenceId,
    proposalFingerprint: review.proposalFingerprint,
    proposalDecision: review.proposalDecision,
    createdAt: review.createdAt,
  };
}

async function currentEvidenceAllowsAcceptance(
  workerRequestId: string,
  evidenceId: string,
): Promise<"allowed" | "unavailable" | "blocked"> {
  const upstreamUrl = resolveLiveEvidenceApiUrl();
  if (!upstreamUrl) return "unavailable";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(
      `${upstreamUrl}/v1/intakes/${encodeURIComponent(workerRequestId)}`,
      { signal: controller.signal, cache: "no-store" },
    );
    if (!upstream.ok) return "unavailable";
    const parsed = parseWorkerIntakeResponse(await upstream.json());
    if (!parsed) return "unavailable";
    const order = parsed.intake.order;
    const hasLaterLifecycle = parsed.intake.history.some(
      (event) => event.eventType !== "ORDER_GUARANTEED",
    );
    return parsed.intake.status === "COMPLETED" &&
      order?.proofStatus === "LIVE_VERIFIED" &&
      order.evidenceId?.toLowerCase() === evidenceId.toLowerCase() &&
      !hasLaterLifecycle
      ? "allowed"
      : "blocked";
  } catch {
    return "unavailable";
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    if (!isTrustedAuthOrigin(request)) {
      return errorResponse(
        "ORIGIN_REJECTED",
        "This review request did not come from the configured application origin.",
        403,
      );
    }
  } catch (error) {
    if (error instanceof AuthProtocolError) {
      return errorResponse("AUTH_CONFIGURATION", error.message, 503);
    }
    throw error;
  }

  let session;
  try {
    session = await requirePrivilegedSession("case.review", "operator");
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(
        error.code,
        error.message,
        error.code === "AUTH_REQUIRED" ? 401 : 403,
      );
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, 2_048);
  } catch (error) {
    if (error instanceof RequestBodyError && error.code === "TOO_LARGE") {
      return errorResponse("REQUEST_TOO_LARGE", error.message, 413);
    }
    return errorResponse("INVALID_REQUEST", "Expected a valid JSON body.", 400);
  }
  const input = InputSchema.safeParse(body);
  if (!input.success) {
    return errorResponse(
      "INVALID_REVIEW",
      input.error.issues[0]?.message ?? "The review decision is invalid.",
      422,
    );
  }

  const { caseId } = await context.params;
  const rateLimit = consumeRateLimit(
    `case:review:${session.accountId}:${caseId}`,
    {
      maxRequests: 10,
      windowMs: 60_000,
    },
  );
  if (!rateLimit.allowed) {
    return errorResponse(
      "RATE_LIMITED",
      "Too many review updates for this case. Try again later.",
      429,
    );
  }

  const store = new CaseStore();
  try {
    const financeCase = store.get(caseId);
    if (!financeCase) {
      return errorResponse(
        "CASE_NOT_FOUND",
        "The financing case was not found.",
        404,
      );
    }
    if (financeCase.accountId !== session.accountId) {
      return errorResponse(
        "CASE_ACCESS_DENIED",
        "This financing case belongs to another operator account.",
        403,
      );
    }

    const proposal = parsePublicProposal(store.getProposal(caseId));
    if (
      !proposal ||
      proposal.requestId !== financeCase.workerRequestId ||
      proposal.sourceTxHash.toLowerCase() !==
        financeCase.sourceTxHash.toLowerCase()
    ) {
      return errorResponse(
        "PROPOSAL_REQUIRED",
        "Generate a current, case-bound proposal before recording human review.",
        409,
      );
    }

    if (input.data.decision === "ACCEPT_RECOMMENDATION") {
      if (
        proposal.decision !== "APPROVED" ||
        proposal.policy?.decision !== "APPROVED" ||
        proposal.terms.status !== "MATCHED"
      ) {
        return errorResponse(
          "RECOMMENDATION_NOT_ACCEPTABLE",
          "Only a policy-approved proposal with matched requested terms can be accepted.",
          409,
        );
      }
      const evidenceState = await currentEvidenceAllowsAcceptance(
        financeCase.workerRequestId,
        proposal.evidenceId,
      );
      if (evidenceState === "unavailable") {
        return errorResponse(
          "EVIDENCE_READBACK_REQUIRED",
          "Current worker evidence must be readable before accepting the recommendation.",
          503,
        );
      }
      if (evidenceState === "blocked") {
        return errorResponse(
          "EVIDENCE_NOT_ACTIONABLE",
          "Current evidence is no longer eligible for acceptance.",
          409,
        );
      }
    }

    const review = store.appendReview({
      reviewId: randomUUID(),
      caseId,
      decision: input.data.decision,
      ...(input.data.note === undefined ? {} : { note: input.data.note }),
      actorAccountId: session.accountId,
      actorAddress: session.address,
      proposalEvidenceId: proposal.evidenceId,
      proposalFingerprint: proposalFingerprint(proposal),
      proposalDecision: proposal.decision,
    });
    return response(
      { boundary: "CASE_REVIEW", review: publicReview(review) },
      201,
    );
  } finally {
    store.close();
  }
}
