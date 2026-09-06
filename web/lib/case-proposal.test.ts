import { describe, expect, it } from "vitest";

import { parsePublicProposal } from "./case-proposal";

const hash = "0x" + "11".repeat(32);

describe("case proposal boundary", () => {
  it("accepts a validated live proposal", () => {
    const parsed = parsePublicProposal({
      boundary: "LIVE_PROPOSAL",
      requestId: "11111111-1111-4111-8111-111111111111",
      sourceTxHash: hash,
      orderId: "0x" + "22".repeat(32),
      evidenceId: "0x" + "33".repeat(32),
      proofStatus: "LIVE_VERIFIED",
      mode: "MODEL",
      provider: "api.groq.com",
      model: "openai/gpt-oss-120b",
      decision: "APPROVED",
      terms: {
        requestedAdvanceBps: 3_000,
        requestedDeliveryDays: 30,
        quotedAdvanceBps: 2_000,
        evidenceTenorDays: 40,
        status: "MATCHED",
      },
      quote: {
        decision: "APPROVE",
        advanceBps: 2_000,
        feeBps: 250,
        expiresAt: 1_786_200_600,
        riskTier: "B",
        reasonCodes: ["BUYER_GUARANTEE_VERIFIED"],
        evidenceIds: ["0x" + "33".repeat(32)],
        policyVersion: "2026-08-demo-v1",
        modelVersion: "structured-agent-v1",
      },
      policy: {
        decision: "APPROVED",
        requestedAdvanceMinor: 200,
        approvedAdvanceMinor: 200,
        checks: [
          {
            id: "evidence",
            label: "Evidence binding",
            status: "PASS",
            actual: "1 supplied",
            limit: "1 registered in order",
          },
        ],
      },
      signing: { status: "NOT_REQUESTED" },
    });

    expect(parsed?.terms.status).toBe("MATCHED");
    expect(parsed?.signing.status).toBe("NOT_REQUESTED");
  });

  it("rejects proposals whose proof boundary is not live", () => {
    expect(
      parsePublicProposal({
        boundary: "LIVE_PROPOSAL",
        requestId: "11111111-1111-4111-8111-111111111111",
        sourceTxHash: hash,
        orderId: hash,
        evidenceId: hash,
        proofStatus: "LOCAL_FIXTURE",
      }),
    ).toBeNull();
  });
});
