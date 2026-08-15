import { describe, expect, it } from "vitest";

import { parseLiveOrdersResponse } from "./live-evidence-schema";

const hash = `0x${"11".repeat(32)}`;
const timestamp = "2026-08-08T00:00:00.000Z";

function validResponse() {
  return {
    boundary: "LIVE_EVIDENCE_STATUS_API",
    orders: [
      {
        sourceEventKey: `1:${hash}:unknown-emitter:${hash}:ORDER_GUARANTEED`,
        sourceTxHash: hash,
        sourceChainKey: 1,
        sourceEmitter: null,
        orderId: hash,
        eventType: "ORDER_GUARANTEED",
        txIndex: 4,
        logIndex: 1,
        stage: "VERIFIED",
        proofStatus: "LIVE_VERIFIED",
        evidenceId: `0x${"22".repeat(32)}`,
        creditcoinTxHash: `0x${"33".repeat(32)}`,
        retryCount: 0,
        blockHeight: 10,
        stageTimestamps: { VERIFIED: timestamp },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
}

describe("live evidence response schema", () => {
  it("accepts the worker contract and strips no required fields", () => {
    expect(parseLiveOrdersResponse(validResponse())).toEqual(validResponse());
  });

  it("rejects unexpected fields before they can cross the web boundary", () => {
    const response = validResponse();
    const order = response.orders[0];
    if (!order) throw new Error("Expected a fixture order");
    const payload = {
      ...response,
      orders: [{ ...order, lastError: "secret detail" }],
    };

    expect(parseLiveOrdersResponse(payload)).toBeNull();
  });

  it("rejects malformed hashes and timestamps", () => {
    const payload = validResponse();
    const order = payload.orders[0];
    if (!order) throw new Error("Expected a fixture order");
    order.sourceTxHash = "not-a-transaction";
    expect(parseLiveOrdersResponse(payload)).toBeNull();

    const timestampPayload = validResponse();
    const timestampOrder = timestampPayload.orders[0];
    if (!timestampOrder) throw new Error("Expected a fixture order");
    timestampOrder.updatedAt = "not-a-timestamp";
    expect(parseLiveOrdersResponse(timestampPayload)).toBeNull();
  });
});
