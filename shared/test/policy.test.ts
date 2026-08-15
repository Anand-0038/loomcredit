import { describe, expect, it } from "vitest";

import {
  DEMO_EVIDENCE_PACKET,
  DEMO_NOW,
  DEMO_SAFE_QUOTE,
  DEMO_UNSAFE_QUOTE,
  evaluateQuote,
  POLICY_VERSION,
} from "../src/index.js";

const inputFor = (quote = DEMO_SAFE_QUOTE) => ({
  orderValueMinor: DEMO_EVIDENCE_PACKET.orderValueMinor,
  guaranteeAmountMinor: DEMO_EVIDENCE_PACKET.guaranteeAmountMinor,
  deliveryDeadline: DEMO_NOW + DEMO_EVIDENCE_PACKET.tenorDays * 86_400,
  now: DEMO_NOW,
  decision: quote.decision,
  advanceBps: quote.advanceBps,
  quoteExpiresAt: quote.expiresAt,
  buyerExposureMinor: DEMO_EVIDENCE_PACKET.openBuyerExposureMinor,
  portfolioCapacityMinor: 10_000_000,
  availableLiquidityMinor: DEMO_EVIDENCE_PACKET.vaultAvailableLiquidityMinor,
  state: DEMO_EVIDENCE_PACKET.facilityState,
  evidenceIds: quote.evidenceIds,
  requiredEvidenceIds: [DEMO_EVIDENCE_PACKET.evidenceId],
  signerApproved: true,
  policyVersion: POLICY_VERSION,
});

describe("RiskGuard policy", () => {
  it("approves the 30% fixture within the 40% cap", () => {
    const result = evaluateQuote(inputFor());
    expect(result.decision).toBe("APPROVED");
    expect(result.approvedAdvanceMinor).toBe(300_000);
  });

  it("does not claim a signer check when signing was not requested", () => {
    const result = evaluateQuote({
      ...inputFor(),
      signerApproved: "NOT_REQUESTED",
    });
    const signerCheck = result.checks.find((check) => check.id === "signer");

    expect(result.decision).toBe("APPROVED");
    expect(signerCheck?.status).toBe("NOT_APPLICABLE");
    expect(signerCheck?.failureCode).toBeUndefined();
  });

  it("rejects the manipulated 80% quote", () => {
    const result = evaluateQuote(inputFor(DEMO_UNSAFE_QUOTE));
    expect(result.decision).toBe("REJECTED");
    expect(result.failureCode).toBe("ADVANCE_LIMIT");
    expect(result.approvedAdvanceMinor).toBe(0);
  });

  it("rejects a zero-value approval before it can be signed", () => {
    const result = evaluateQuote(
      inputFor({ ...DEMO_SAFE_QUOTE, advanceBps: 0 }),
    );
    expect(result.decision).toBe("REJECTED");
    expect(result.failureCode).toBe("ZERO_ADVANCE");
    expect(result.requestedAdvanceMinor).toBe(0);
    expect(result.approvedAdvanceMinor).toBe(0);
  });

  it("rejects a cancelled facility", () => {
    const result = evaluateQuote({ ...inputFor(), state: "CANCELLED" });
    expect(result.failureCode).toBe("INVALID_STATE");
  });

  it("does not approve a reject decision with otherwise safe terms", () => {
    const result = evaluateQuote({ ...inputFor(), decision: "REJECT" });
    expect(result.decision).toBe("REJECTED");
    expect(result.failureCode).toBe("NON_APPROVAL_DECISION");
    expect(result.approvedAdvanceMinor).toBe(0);
  });

  it("preserves refer as a human-review outcome", () => {
    const result = evaluateQuote({ ...inputFor(), decision: "REFER" });
    expect(result.decision).toBe("REFER");
    expect(result.failureCode).toBe("NON_APPROVAL_DECISION");
    expect(result.approvedAdvanceMinor).toBe(0);
  });

  it("keeps basis-point arithmetic exact for large safe integers", () => {
    const maximum = Number.MAX_SAFE_INTEGER;
    const result = evaluateQuote({
      ...inputFor(),
      orderValueMinor: maximum,
      guaranteeAmountMinor: maximum,
      advanceBps: 2_000,
      buyerExposureMinor: 0,
      portfolioCapacityMinor: maximum,
      availableLiquidityMinor: maximum,
    });
    const expectedAdvance = Number((BigInt(maximum) * 2_000n) / 10_000n);
    const expectedBuyerLimit = Number((BigInt(maximum) * 2_500n) / 10_000n);

    expect(result.decision).toBe("APPROVED");
    expect(result.requestedAdvanceMinor).toBe(expectedAdvance);
    expect(
      result.checks.find((check) => check.id === "buyer-concentration")?.limit,
    ).toBe(`${expectedBuyerLimit} minor units`);
  });
});
