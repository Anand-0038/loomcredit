import { afterEach, describe, expect, it, vi } from "vitest";

import { readLiveEvidenceHealth } from "./live-evidence-health";

afterEach(() => {
  vi.unstubAllGlobals();
});

const validPayload = {
  boundary: "LIVE_EVIDENCE_STATUS_API",
  orders: [
    {
      sourceEventKey: "0x01",
      sourceTxHash: `0x${"a1".repeat(32)}`,
      sourceChainKey: 11155111,
      sourceEmitter: `0x${"bb".repeat(20)}`,
      orderId: `0x${"11".repeat(32)}`,
      eventType: "ORDER_GUARANTEED",
      txIndex: 0,
      logIndex: 0,
      stage: "VERIFIED",
      proofStatus: "LIVE_VERIFIED",
      evidenceId: `0x${"cc".repeat(32)}`,
      creditcoinTxHash: `0x${"dd".repeat(32)}`,
      retryCount: 0,
      blockHeight: 123,
      stageTimestamps: {
        DETECTED: "2026-08-08T10:00:00.000Z",
        VERIFIED: "2026-08-08T10:00:01.000Z",
      },
      createdAt: "2026-08-08T10:00:00.000Z",
      updatedAt: "2026-08-08T10:00:01.000Z",
    },
    {
      sourceEventKey: "0x02",
      sourceTxHash: `0x${"b2".repeat(32)}`,
      sourceChainKey: 11155111,
      sourceEmitter: `0x${"bb".repeat(20)}`,
      orderId: `0x${"22".repeat(32)}`,
      eventType: "ORDER_GUARANTEED",
      txIndex: 1,
      logIndex: 1,
      stage: "VERIFIED",
      proofStatus: "LIVE_VERIFIED",
      evidenceId: `0x${"ee".repeat(32)}`,
      creditcoinTxHash: `0x${"ff".repeat(32)}`,
      retryCount: 0,
      blockHeight: 124,
      stageTimestamps: {
        DETECTED: "2026-08-08T10:01:00.000Z",
        VERIFIED: "2026-08-08T10:01:01.000Z",
      },
      createdAt: "2026-08-08T10:01:00.000Z",
      updatedAt: "2026-08-08T10:01:01.000Z",
    },
    {
      sourceEventKey: "0x03",
      sourceTxHash: `0x${"c3".repeat(32)}`,
      sourceChainKey: 11155111,
      sourceEmitter: `0x${"bb".repeat(20)}`,
      orderId: `0x${"33".repeat(32)}`,
      eventType: "ORDER_GUARANTEED",
      txIndex: 2,
      logIndex: 2,
      stage: "DETECTED",
      proofStatus: "PENDING",
      evidenceId: null,
      creditcoinTxHash: null,
      retryCount: 0,
      blockHeight: 125,
      stageTimestamps: {
        DETECTED: "2026-08-08T10:02:00.000Z",
      },
      createdAt: "2026-08-08T10:02:00.000Z",
      updatedAt: "2026-08-08T10:02:00.000Z",
    },
  ],
};

describe("live evidence upstream health checks", () => {
  it("returns the most recently updated verified order", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await readLiveEvidenceHealth("https://worker.example");

    expect(result).toEqual({
      upstream: "reachable",
      latestVerifiedOrder: `0x${"22".repeat(32)}`,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://worker.example/v1/orders",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        cache: "no-store",
      }),
    );
  });

  it("returns invalid when upstream payload is invalid JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("not-json", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await readLiveEvidenceHealth("https://worker.example");

    expect(result).toEqual({
      upstream: "invalid",
      latestVerifiedOrder: null,
    });
  });

  it("returns unavailable when upstream is unreachable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await readLiveEvidenceHealth("https://worker.example");

    expect(result).toEqual({
      upstream: "unavailable",
      latestVerifiedOrder: null,
    });
  });
});
