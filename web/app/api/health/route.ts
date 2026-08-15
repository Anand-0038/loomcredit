import { NextResponse } from "next/server";

import { readLiveEvidenceHealth } from "../../../lib/live-evidence-health";
import { resolveLiveEvidenceApiUrl } from "../../../lib/live-evidence";

export const dynamic = "force-dynamic";

export async function GET() {
  const liveEvidenceApiUrl = resolveLiveEvidenceApiUrl();
  const liveEvidenceApiConfigured = Boolean(liveEvidenceApiUrl);
  const liveEvidenceHealth = liveEvidenceApiUrl
    ? await readLiveEvidenceHealth(liveEvidenceApiUrl)
    : { upstream: "not-configured" as const, latestVerifiedOrder: null };

  return NextResponse.json(
    {
      status: "ok",
      service: "loomcredit-web",
      liveIntegrationConfigured: liveEvidenceApiConfigured,
      liveEvidenceConfigured: liveEvidenceApiConfigured,
      liveEvidenceApi: liveEvidenceApiConfigured
        ? "configured"
        : "not-configured",
      liveEvidenceUpstream: liveEvidenceHealth.upstream,
      liveEvidenceEndpoint: "/api/live-evidence",
      latestVerifiedOrder: liveEvidenceHealth.latestVerifiedOrder,
      workerSecrets: "not-applicable",
      proofBoundary: "external USC worker only",
    },
    {
      headers: { "cache-control": "no-store" },
    },
  );
}
