import { NextResponse } from "next/server";

import {
  AuthProtocolError,
  currentAuthSession,
  isTrustedAuthOrigin,
} from "../../../../lib/auth";
import {
  CaseStore,
  type CaseReviewEvent,
  type FinanceCase,
} from "../../../../lib/case-store";
import {
  parsePublicProposal,
  type PublicProposal,
} from "../../../../lib/case-proposal";
import {
  caseStatusFromIntake,
  parseWorkerIntakeResponse,
  type PublicCaseResponse,
} from "../../../../lib/case-status";
import { resolveLiveEvidenceApiUrl } from "../../../../lib/live-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM_TIMEOUT_MS = 8_000;

function response(payload: unknown, status = 200): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function errorResponse(
  code: string,
  error: string,
  status: 400 | 401 | 403 | 404 | 500 | 502 | 503,
  extra: object = {},
) {
  return response(
    { boundary: "LIVE_CASE_INTAKE", code, error, ...extra },
    status,
  );
}

function publicCase(financeCase: FinanceCase) {
  return {
    caseId: financeCase.caseId,
    sourceTxHash: financeCase.sourceTxHash,
    requestedAdvanceBps: financeCase.requestedAdvanceBps,
    deliveryDays: financeCase.deliveryDays,
    role: financeCase.role,
    status: financeCase.status,
    createdAt: financeCase.createdAt,
    updatedAt: financeCase.updatedAt,
  };
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

function storedProposal(
  financeCase: FinanceCase,
  store: CaseStore,
  intake?: PublicCaseResponse["intake"],
): PublicProposal | null {
  const proposal = parsePublicProposal(store.getProposal(financeCase.caseId));
  if (!proposal) return null;
  if (
    proposal.requestId !== financeCase.workerRequestId ||
    proposal.sourceTxHash.toLowerCase() !==
      financeCase.sourceTxHash.toLowerCase()
  ) {
    return null;
  }
  if (intake) {
    const order = intake.order;
    if (
      !order ||
      order.proofStatus !== "LIVE_VERIFIED" ||
      !order.evidenceId ||
      proposal.orderId.toLowerCase() !== order.orderId.toLowerCase() ||
      proposal.evidenceId.toLowerCase() !== order.evidenceId.toLowerCase()
    ) {
      return null;
    }
  }
  return proposal;
}

function caseResponse(
  financeCase: FinanceCase,
  store: CaseStore,
  intake: PublicCaseResponse["intake"],
): PublicCaseResponse & { proposal: PublicProposal | null } {
  return {
    boundary: "LIVE_CASE_INTAKE",
    case: publicCase(financeCase),
    intake,
    proposal: storedProposal(financeCase, store, intake),
    reviews: store.listReviews(financeCase.caseId).map(publicReview),
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    if (!isTrustedAuthOrigin(request)) {
      return errorResponse(
        "ORIGIN_REJECTED",
        "This request did not come from the configured application origin.",
        403,
      );
    }
  } catch (error) {
    if (error instanceof AuthProtocolError) {
      return errorResponse("AUTH_CONFIGURATION", error.message, 500);
    }
    throw error;
  }

  const session = await currentAuthSession();
  if (!session) {
    return errorResponse(
      "AUTH_REQUIRED",
      "A verified server session is required to view this case.",
      401,
    );
  }

  const { caseId } = await context.params;
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

    const upstreamUrl = resolveLiveEvidenceApiUrl();
    if (!upstreamUrl) {
      return response(caseResponse(financeCase, store, null));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const upstream = await fetch(
        `${upstreamUrl}/v1/intakes/${encodeURIComponent(financeCase.workerRequestId)}`,
        { signal: controller.signal, cache: "no-store" },
      );
      if (upstream.status === 404) {
        return response(caseResponse(financeCase, store, null));
      }
      if (!upstream.ok) {
        return errorResponse(
          "WORKER_UNAVAILABLE",
          "The live evidence worker could not return this case.",
          502,
          caseResponse(financeCase, store, null),
        );
      }
      let payload: unknown;
      try {
        payload = await upstream.json();
      } catch {
        return errorResponse(
          "WORKER_INVALID_RESPONSE",
          "The live evidence worker returned invalid JSON.",
          502,
          caseResponse(financeCase, store, null),
        );
      }
      const parsed = parseWorkerIntakeResponse(payload);
      if (!parsed) {
        return errorResponse(
          "WORKER_INVALID_RESPONSE",
          "The live evidence worker returned an invalid status shape.",
          502,
          caseResponse(financeCase, store, null),
        );
      }
      const nextStatus = caseStatusFromIntake(parsed.intake);
      let current = financeCase;
      if (parsed.intake.requestId !== current.workerRequestId) {
        current = store.updateWorkerRequestId(
          current.caseId,
          parsed.intake.requestId,
        );
        store.clearProposal(current.caseId);
      }
      const updated =
        nextStatus === current.status
          ? current
          : store.updateStatus(current.caseId, nextStatus);
      return response(caseResponse(updated, store, parsed.intake));
    } catch {
      return errorResponse(
        "WORKER_UNAVAILABLE",
        "The live evidence worker could not be reached.",
        503,
        caseResponse(financeCase, store, null),
      );
    } finally {
      clearTimeout(timeout);
    }
  } finally {
    store.close();
  }
}
