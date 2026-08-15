import { describe, expect, it } from "vitest";

import { buildReadinessResult } from "./readiness";

describe("readiness boundary", () => {
  it("requires a configured evidence dependency", () => {
    expect(
      buildReadinessResult({
        configured: false,
        upstream: "not-configured",
        latestVerifiedOrder: null,
      }),
    ).toEqual({
      statusCode: 503,
      payload: expect.objectContaining({
        status: "not-ready",
        code: "LIVE_EVIDENCE_NOT_CONFIGURED",
      }),
    });
  });

  it("fails readiness for invalid or unavailable upstream data", () => {
    expect(
      buildReadinessResult({
        configured: true,
        upstream: "invalid",
        latestVerifiedOrder: null,
      }),
    ).toEqual({
      statusCode: 503,
      payload: expect.objectContaining({
        status: "not-ready",
        code: "LIVE_EVIDENCE_UNAVAILABLE",
        upstream: "invalid",
      }),
    });
  });

  it("reports ready only for a reachable, schema-valid feed", () => {
    const orderId = `0x${"11".repeat(32)}`;
    expect(
      buildReadinessResult({
        configured: true,
        upstream: "reachable",
        latestVerifiedOrder: orderId,
      }),
    ).toEqual({
      statusCode: 200,
      payload: {
        status: "ready",
        service: "loomcredit-web",
        dependency: "live-evidence",
        upstream: "reachable",
        latestVerifiedOrder: orderId,
      },
    });
  });
});
