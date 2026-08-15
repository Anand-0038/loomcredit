import { NextResponse } from "next/server";

import {
  LIVE_EVIDENCE_BOUNDARY,
  resolveLiveEvidenceApiUrl,
} from "../../../lib/live-evidence";
import { parseLiveOrdersResponse } from "../../../lib/live-evidence-schema";

const UPSTREAM_TIMEOUT_MS = 8_000;

export const dynamic = "force-dynamic";

function errorResponse(
  status: 502 | 503,
  code: "NOT_CONFIGURED" | "UPSTREAM_UNAVAILABLE" | "UPSTREAM_INVALID",
  error: string,
) {
  return NextResponse.json(
    { boundary: LIVE_EVIDENCE_BOUNDARY, code, error },
    {
      status,
      headers: { "cache-control": "no-store" },
    },
  );
}

export async function GET() {
  const upstreamUrl = resolveLiveEvidenceApiUrl();
  if (!upstreamUrl) {
    return errorResponse(
      503,
      "NOT_CONFIGURED",
      "The worker status endpoint is not configured for this web service.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(`${upstreamUrl}/v1/orders`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return errorResponse(
        502,
        "UPSTREAM_UNAVAILABLE",
        `The worker status endpoint returned HTTP ${response.status}.`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return errorResponse(
        502,
        "UPSTREAM_INVALID",
        "The worker status endpoint returned invalid JSON.",
      );
    }

    const sanitized = parseLiveOrdersResponse(payload);
    if (!sanitized) {
      return errorResponse(
        502,
        "UPSTREAM_INVALID",
        "The worker status endpoint returned an invalid evidence shape.",
      );
    }

    return NextResponse.json(sanitized, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return errorResponse(
      503,
      "UPSTREAM_UNAVAILABLE",
      "The web service could not reach the worker status endpoint.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
