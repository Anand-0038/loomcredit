import { NextResponse } from "next/server";

import { readLiveEvidenceHealth } from "../../../lib/live-evidence-health";
import { resolveLiveEvidenceApiUrl } from "../../../lib/live-evidence";
import { buildReadinessResult } from "../../../lib/readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  const upstreamUrl = resolveLiveEvidenceApiUrl();
  if (!upstreamUrl) {
    const result = buildReadinessResult({
      configured: false,
      upstream: "not-configured",
      latestVerifiedOrder: null,
    });
    return NextResponse.json(result.payload, {
      status: result.statusCode,
      headers: { "cache-control": "no-store" },
    });
  }

  const health = await readLiveEvidenceHealth(upstreamUrl);
  const result = buildReadinessResult({
    configured: true,
    upstream: health.upstream,
    latestVerifiedOrder: health.latestVerifiedOrder,
  });
  return NextResponse.json(result.payload, {
    status: result.statusCode,
    headers: { "cache-control": "no-store" },
  });
}
