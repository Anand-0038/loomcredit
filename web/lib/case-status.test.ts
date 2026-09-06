import { describe, expect, it } from "vitest";

import {
  caseStatusFromIntake,
  parsePublicCaseListResponse,
  parsePublicCaseResponse,
  parseWorkerIntakeResponse,
} from "./case-status";

const sourceTxHash = `0x${"aa".repeat(32)}`;
const orderId = `0x${"bb".repeat(32)}`;

function intake(status: "ACCEPTED" | "PROCESSING" | "COMPLETED") {
  return {
    requestId: "11111111-1111-4111-8111-111111111111",
    sourceTxHash,
    expectedOrderId: null,
    expectedEventType: "ORDER_GUARANTEED" as const,
    status,
    failureCode: null,
    history: [],
    order:
      status === "COMPLETED"
        ? {
            sourceEventKey: "event-key",
            sourceTxHash,
            sourceChainKey: 1,
            sourceEmitter: `0x${"cc".repeat(20)}`,
            orderId,
            eventType: "ORDER_GUARANTEED" as const,
            txIndex: 1,
            logIndex: 0,
            stage: "VERIFIED" as const,
            proofStatus: "LIVE_VERIFIED" as const,
            evidenceId: `0x${"dd".repeat(32)}`,
            creditcoinTxHash: `0x${"ee".repeat(32)}`,
            retryCount: 0,
            blockHeight: 10,
            sourceOrder: null,
            stageTimestamps: {
              DETECTED: "2026-08-17T18:00:00.000Z",
            },
            createdAt: "2026-08-17T18:00:00.000Z",
            updatedAt: "2026-08-17T18:00:00.000Z",
          }
        : null,
    createdAt: "2026-08-17T18:00:00.000Z",
    updatedAt: "2026-08-17T18:00:00.000Z",
  };
}

describe("case status boundary", () => {
  it("accepts the documented worker shape and maps its lifecycle", () => {
    const parsed = parseWorkerIntakeResponse({
      boundary: "LIVE_EVIDENCE_STATUS_API",
      intake: intake("COMPLETED"),
    });
    expect(parsed).not.toBeNull();
    expect(caseStatusFromIntake(parsed!.intake)).toBe("COMPLETED");
  });

  it("rejects malformed worker data instead of showing a false live result", () => {
    expect(
      parseWorkerIntakeResponse({
        boundary: "LIVE_EVIDENCE_STATUS_API",
        intake: { ...intake("PROCESSING"), sourceTxHash: "not-a-hash" },
      }),
    ).toBeNull();
  });

  it("accepts the worker conflict envelope so an existing intake can be reconciled", () => {
    const parsed = parseWorkerIntakeResponse({
      boundary: "LIVE_EVIDENCE_STATUS_API",
      code: "SOURCE_TRANSACTION_ALREADY_TRACKED",
      error:
        "This source transaction is already tracked under another request.",
      intake: intake("PROCESSING"),
    });
    expect(parsed?.code).toBe("SOURCE_TRANSACTION_ALREADY_TRACKED");
  });

  it("reduces an error envelope to its durable case for retry UI", () => {
    const parsed = parsePublicCaseResponse({
      boundary: "LIVE_CASE_INTAKE",
      code: "WORKER_UNAVAILABLE",
      error: "worker unavailable",
      case: {
        caseId: "11111111-1111-4111-8111-111111111111",
        sourceTxHash,
        requestedAdvanceBps: 3_000,
        deliveryDays: 30,
        role: "lender",
        status: "WORKER_UNAVAILABLE",
        createdAt: "2026-08-17T18:00:00.000Z",
        updatedAt: "2026-08-17T18:00:00.000Z",
      },
      intake: null,
    });
    expect(parsed?.case.status).toBe("WORKER_UNAVAILABLE");
  });

  it("accepts an authenticated case inbox response with proposal state", () => {
    const parsed = parsePublicCaseListResponse({
      boundary: "LIVE_CASE_INTAKE",
      cases: [
        {
          caseId: "11111111-1111-4111-8111-111111111111",
          sourceTxHash,
          requestedAdvanceBps: 3_000,
          deliveryDays: 30,
          role: "lender",
          status: "COMPLETED",
          createdAt: "2026-08-17T18:00:00.000Z",
          updatedAt: "2026-08-17T18:01:00.000Z",
          proposalAvailable: true,
          latestReview: null,
        },
      ],
    });
    expect(parsed?.cases[0]).toMatchObject({
      status: "COMPLETED",
      proposalAvailable: true,
    });
  });
});
