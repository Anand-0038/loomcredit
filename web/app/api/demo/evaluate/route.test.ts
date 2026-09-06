import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("api /api/demo/evaluate", () => {
  it("returns a request-scoped, fixture-bound decision trace", async () => {
    const response = await POST(
      new Request("https://app.example/api/demo/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "safe" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      boundary: "LOCAL_FIXTURE_ONLY",
      mode: "safe",
      trace: {
        schemaVersion: "fixture-evaluation-v1",
        origin: "FIXTURE",
        boundary: "LOCAL_FIXTURE_ONLY",
        policyVersion: "2026-08-demo-v1",
      },
    });
    expect(body.trace.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(body.trace.evaluatedAt).toMatch(/Z$/);
    expect(body.trace.evaluationDurationMs).toBeGreaterThanOrEqual(0);
    expect(body.trace.inputHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects an unknown local scenario before evaluating it", async () => {
    const response = await POST(
      new Request("https://app.example/api/demo/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "live" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error:
        "mode must be safe, unsafe, cancelled, or custom with advanceBps and deliveryDays",
    });
  });

  it("evaluates an operator-provided proposal without leaving the fixture boundary", async () => {
    const response = await POST(
      new Request("https://app.example/api/demo/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "custom",
          advanceBps: 3_000,
          deliveryDays: 45,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("custom");
    expect(body.boundary).toBe("LOCAL_FIXTURE_ONLY");
    expect(body.policy.decision).toBe("APPROVED");
    expect(body.policy.requestedAdvanceMinor).toBe(300_000);
    expect(body.trace.origin).toBe("FIXTURE");
  });

  it("rejects an incomplete custom proposal", async () => {
    const response = await POST(
      new Request("https://app.example/api/demo/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "custom", advanceBps: 3_000 }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
