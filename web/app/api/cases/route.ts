import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AuthProtocolError,
  isTrustedAuthOrigin,
  requirePrivilegedSession,
  AuthorizationError,
} from "../../../lib/auth";
import {
  CaseStore,
  CASE_ROLES,
  type FinanceCase,
  type CaseReviewEvent,
} from "../../../lib/case-store";
import {
  caseStatusFromIntake,
  parseWorkerIntakeResponse,
  type PublicCaseResponse,
} from "../../../lib/case-status";
import {
  parsePublicProposal,
  type PublicProposal,
} from "../../../lib/case-proposal";
import { proposalFingerprint } from "../../../lib/case-proposal-fingerprint";
import { resolveLiveEvidenceApiUrl } from "../../../lib/live-evidence";
import { readJsonBody, RequestBodyError } from "../../../lib/request-body";
import { consumeRateLimit } from "../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InputSchema = z.object({
  sourceTxHash: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{64}$/),
  requestedAdvanceBps: z.number().int().min(0).max(10_000),
  deliveryDays: z.number().int().min(0).max(365),
  role: z.enum(CASE_ROLES),
});

const UPSTREAM_TIMEOUT_MS = 10_000;

function response(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

function errorResponse(
  code: string,
  error: string,
  status: 400 | 401 | 403 | 409 | 413 | 422 | 429 | 500 | 502 | 503,
  extra: object = {},
  retryAfterSeconds?: number,
) {
  return response(
    { boundary: "LIVE_CASE_INTAKE", code, error, ...extra },
    status,
    retryAfterSeconds
      ? { "retry-after": String(retryAfterSeconds) }
      : undefined,
  );
}

function publicCase(financeCase: FinanceCase): PublicCaseResponse["case"] {
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

async function verifyOrigin(request: Request): Promise<NextResponse | null> {
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
  return null;
}

async function currentOperator(request: Request, action = "case.create") {
  const originError = await verifyOrigin(request);
  if (originError) return { response: originError, session: null };
  try {
    return {
      response: null,
      session: await requirePrivilegedSession(action, "operator"),
    };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return {
        response: errorResponse(
          error.code,
          error.message,
          error.code === "AUTH_REQUIRED" ? 401 : 403,
        ),
        session: null,
      };
    }
    throw error;
  }
}

async function workerRequest(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
    let body: unknown | null = null;
    try {
      body = await upstream.json();
    } catch {
      body = null;
    }
    return { ok: upstream.ok, status: upstream.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

function statusFromWorker(
  workerStatus: ReturnType<typeof parseWorkerIntakeResponse>,
): FinanceCase["status"] {
  if (!workerStatus) return "WORKER_UNAVAILABLE";
  return caseStatusFromIntake(workerStatus.intake);
}

function upstreamError(body: unknown): { code: string; error: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const candidate = body as { code?: unknown; error?: unknown };
  if (
    typeof candidate.code !== "string" ||
    typeof candidate.error !== "string"
  ) {
    return null;
  }
  return { code: candidate.code, error: candidate.error };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error && /unique constraint failed/i.test(error.message)
  );
}

function existingCaseConflict(
  existing: FinanceCase,
  accountId: string,
  input: z.infer<typeof InputSchema>,
): NextResponse | null {
  if (existing.accountId !== accountId) {
    return errorResponse(
      "SOURCE_TRANSACTION_ALREADY_TRACKED",
      "This source transaction is already attached to another case.",
      409,
    );
  }
  if (
    existing.requestedAdvanceBps !== input.requestedAdvanceBps ||
    existing.deliveryDays !== input.deliveryDays ||
    existing.role !== input.role
  ) {
    return errorResponse(
      "CASE_TERMS_LOCKED",
      "This source transaction already has a case. Start a new case with a different source transaction to change the requested terms.",
      409,
      { case: publicCase(existing), intake: null },
    );
  }
  return null;
}

export async function GET(request: Request) {
  const auth = await currentOperator(request, "case.list");
  if (auth.response || !auth.session) return auth.response;

  const store = new CaseStore();
  try {
    return response({
      boundary: "LIVE_CASE_INTAKE",
      cases: store
        .listForAccount(auth.session.accountId)
        .map((financeCase) => ({
          ...publicCase(financeCase),
          // Do not advertise a proposal merely because a JSON blob exists.
          // The saved artifact must still parse and bind to this case's
          // current worker request and source transaction.
          proposalAvailable: Boolean(storedProposal(financeCase, store)),
          latestReview: (() => {
            const review = store.latestReview(financeCase.caseId);
            const proposal = storedProposal(financeCase, store);
            return review &&
              proposal &&
              review.proposalFingerprint === proposalFingerprint(proposal)
              ? publicReview(review)
              : null;
          })(),
        })),
    });
  } finally {
    store.close();
  }
}

export async function POST(request: Request) {
  const auth = await currentOperator(request);
  if (auth.response || !auth.session) return auth.response;

  let body: unknown;
  try {
    body = await readJsonBody(request, 4_096);
  } catch (error) {
    if (error instanceof RequestBodyError && error.code === "TOO_LARGE") {
      return errorResponse("REQUEST_TOO_LARGE", error.message, 413);
    }
    return errorResponse("INVALID_REQUEST", "Expected a valid JSON body.", 400);
  }

  const input = InputSchema.safeParse(body);
  if (!input.success) {
    return errorResponse(
      "INVALID_REQUEST",
      "sourceTxHash, requestedAdvanceBps, deliveryDays, and role are required.",
      400,
    );
  }

  const rateLimit = consumeRateLimit(`case:create:${auth.session.accountId}`, {
    maxRequests: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return errorResponse(
      "RATE_LIMITED",
      "Too many case intake requests. Try again later.",
      429,
      {},
      rateLimit.retryAfterSeconds,
    );
  }

  const store = new CaseStore();
  try {
    const sourceTxHash = input.data.sourceTxHash.toLowerCase();
    const existing = store.findBySourceTxHash(sourceTxHash);
    if (existing) {
      const conflict = existingCaseConflict(
        existing,
        auth.session.accountId,
        input.data,
      );
      if (conflict) return conflict;
    }

    if (existing?.status === "COMPLETED") {
      return response(caseResponse(existing, store, null));
    }
    if (existing?.status === "FAILED_TERMINAL") {
      return errorResponse(
        "CASE_TERMINAL",
        "This case reached a terminal evidence failure and cannot be retried.",
        409,
        caseResponse(existing, store, null),
      );
    }

    let financeCase: FinanceCase;
    if (existing) {
      financeCase = existing;
    } else {
      try {
        financeCase = store.create({
          caseId: randomUUID(),
          sourceTxHash,
          requestedAdvanceBps: input.data.requestedAdvanceBps,
          deliveryDays: input.data.deliveryDays,
          role: input.data.role,
          accountId: auth.session.accountId,
          address: auth.session.address,
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const raced = store.findBySourceTxHash(sourceTxHash);
        if (!raced) throw error;
        const conflict = existingCaseConflict(
          raced,
          auth.session.accountId,
          input.data,
        );
        if (conflict) return conflict;
        financeCase = raced;
      }
    }

    const upstreamUrl = resolveLiveEvidenceApiUrl();
    if (!upstreamUrl) {
      if (financeCase.status === "COMPLETED") {
        return response(caseResponse(financeCase, store, null));
      }
      const unavailable = store.updateStatus(
        financeCase.caseId,
        "WORKER_UNAVAILABLE",
      );
      return errorResponse(
        "WORKER_NOT_CONFIGURED",
        "The live evidence worker is not configured for this service.",
        503,
        caseResponse(unavailable, store, null),
      );
    }

    let upstream;
    try {
      upstream = await workerRequest(`${upstreamUrl}/v1/intakes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: financeCase.workerRequestId,
          sourceTxHash: financeCase.sourceTxHash,
          expectedEventType: "ORDER_GUARANTEED",
        }),
      });
    } catch {
      const unavailable = store.updateStatus(
        financeCase.caseId,
        "WORKER_UNAVAILABLE",
      );
      return errorResponse(
        "WORKER_UNAVAILABLE",
        "The live evidence worker could not be reached.",
        503,
        caseResponse(unavailable, store, null),
      );
    }

    if (!upstream.ok && upstream.status === 409) {
      const workerFailure = upstreamError(upstream.body);
      const failed = store.updateStatus(financeCase.caseId, "FAILED_TERMINAL");
      return errorResponse(
        workerFailure?.code ?? "SOURCE_TRANSACTION_ALREADY_TRACKED",
        workerFailure?.error ??
          "The worker already tracks this source transaction under another request.",
        409,
        caseResponse(failed, store, null),
      );
    }

    const parsed = parseWorkerIntakeResponse(upstream.body);
    if (!parsed) {
      const workerFailure = upstreamError(upstream.body);
      const failed = store.updateStatus(
        financeCase.caseId,
        upstream.status >= 500 ? "WORKER_UNAVAILABLE" : "FAILED_TERMINAL",
      );
      return errorResponse(
        workerFailure?.code ?? "WORKER_INVALID_RESPONSE",
        workerFailure?.error ??
          "The live evidence worker returned an invalid status shape.",
        upstream.status >= 500 ? 502 : 422,
        caseResponse(failed, store, null),
      );
    }

    if (parsed.intake.requestId !== financeCase.workerRequestId) {
      financeCase = store.updateWorkerRequestId(
        financeCase.caseId,
        parsed.intake.requestId,
      );
      store.clearProposal(financeCase.caseId);
    }

    const updated = store.updateStatus(
      financeCase.caseId,
      statusFromWorker(parsed),
    );
    return response(caseResponse(updated, store, parsed.intake), 202);
  } finally {
    store.close();
  }
}
