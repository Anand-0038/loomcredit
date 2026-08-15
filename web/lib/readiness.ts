import type { LiveEvidenceUpstreamStatus } from "./live-evidence-health";

type ReadinessInput = {
  configured: boolean;
  upstream: LiveEvidenceUpstreamStatus | "not-configured";
  latestVerifiedOrder: string | null;
};

export type ReadinessResult = {
  statusCode: 200 | 503;
  payload:
    | {
        status: "ready";
        service: "loomcredit-web";
        dependency: "live-evidence";
        upstream: "reachable";
        latestVerifiedOrder: string | null;
      }
    | {
        status: "not-ready";
        service: "loomcredit-web";
        dependency: "live-evidence";
        upstream: "not-configured" | "unavailable" | "invalid";
        code: "LIVE_EVIDENCE_NOT_CONFIGURED" | "LIVE_EVIDENCE_UNAVAILABLE";
      };
};

export function buildReadinessResult(input: ReadinessInput): ReadinessResult {
  if (!input.configured) {
    return {
      statusCode: 503,
      payload: {
        status: "not-ready",
        service: "loomcredit-web",
        dependency: "live-evidence",
        upstream: "not-configured",
        code: "LIVE_EVIDENCE_NOT_CONFIGURED",
      },
    };
  }

  if (input.upstream !== "reachable") {
    return {
      statusCode: 503,
      payload: {
        status: "not-ready",
        service: "loomcredit-web",
        dependency: "live-evidence",
        upstream: input.upstream,
        code: "LIVE_EVIDENCE_UNAVAILABLE",
      },
    };
  }

  return {
    statusCode: 200,
    payload: {
      status: "ready",
      service: "loomcredit-web",
      dependency: "live-evidence",
      upstream: "reachable",
      latestVerifiedOrder: input.latestVerifiedOrder,
    },
  };
}
