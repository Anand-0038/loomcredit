import { NextResponse } from "next/server";

import {
  AuthProtocolError,
  AuthorizationError,
  isTrustedAuthOrigin,
  requirePrivilegedSession,
} from "../../../../../lib/auth";
import { CaseStore } from "../../../../../lib/case-store";
import { parsePublicProposal } from "../../../../../lib/case-proposal";
import { resolveLiveEvidenceApiUrl } from "../../../../../lib/live-evidence";
import { consumeRateLimit } from "../../../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM_TIMEOUT_MS = 45_000;

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
  status: 401 | 403 | 404 | 409 | 422 | 429 | 502 | 503,
  retryAfterSeconds?: number,
): NextResponse {
  return response(
    { boundary: "LIVE_PROPOSAL", code, error },
    status,
    retryAfterSeconds
      ? { "retry-after": String(retryAfterSeconds) }
      : undefined,
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    if (!isTrustedAuthOrigin(request)) {
      return errorResponse(
        "ORIGIN_REJECTED",
        "This proposal request did not come from the configured application origin.",
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
    session = await requirePrivilegedSession("case.proposal", "operator");
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

    const rateLimit = consumeRateLimit(
      `case:proposal:${session.accountId}:${financeCase.caseId}`,
      { maxRequests: 3, windowMs: 60_000 },
    );
    if (!rateLimit.allowed) {
      return response(
        {
          boundary: "LIVE_PROPOSAL",
          code: "RATE_LIMITED",
          error:
            "Too many proposal generations for this case. Try again later.",
        },
        429,
        { "retry-after": String(rateLimit.retryAfterSeconds) },
      );
    }

    const upstreamUrl = resolveLiveEvidenceApiUrl();
    if (!upstreamUrl) {
      return errorResponse(
        "WORKER_NOT_CONFIGURED",
        "The live evidence worker is not configured for this service.",
        503,
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const upstream = await fetch(upstreamUrl + "/v1/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: financeCase.workerRequestId,
          sourceTxHash: financeCase.sourceTxHash,
          requestedAdvanceBps: financeCase.requestedAdvanceBps,
          deliveryDays: financeCase.deliveryDays,
        }),
        signal: controller.signal,
        cache: "no-store",
      });
      let payload: unknown = null;
      try {
        payload = await upstream.json();
      } catch {
        payload = null;
      }
      const parsed = parsePublicProposal(payload);
      if (parsed) {
        if (
          parsed.requestId !== financeCase.workerRequestId ||
          parsed.sourceTxHash.toLowerCase() !==
            financeCase.sourceTxHash.toLowerCase()
        ) {
          return errorResponse(
            "WORKER_INVALID_RESPONSE",
            "The proposal was not bound to this case request.",
            502,
          );
        }
        store.saveProposal(financeCase.caseId, parsed);
        return response(parsed, upstream.status);
      }
      if (
        typeof payload === "object" &&
        payload !== null &&
        "code" in payload &&
        "error" in payload &&
        typeof payload.code === "string" &&
        typeof payload.error === "string"
      ) {
        return errorResponse(
          payload.code,
          payload.error,
          upstream.status === 422 ? 422 : upstream.status >= 500 ? 502 : 409,
        );
      }
      return errorResponse(
        "WORKER_INVALID_RESPONSE",
        "The live proposal worker returned an invalid response.",
        502,
      );
    } catch {
      return errorResponse(
        "WORKER_UNAVAILABLE",
        "The live proposal worker could not be reached.",
        503,
      );
    } finally {
      clearTimeout(timeout);
    }
  } finally {
    store.close();
  }
}
