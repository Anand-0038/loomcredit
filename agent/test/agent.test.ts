import { describe, expect, it, vi } from "vitest";

import {
  DEMO_EVIDENCE_PACKET,
  DEMO_SAFE_QUOTE,
  DEMO_UNSAFE_QUOTE,
} from "@loomcredit/shared";

import {
  assertQuoteCanBeSigned,
  generateQuote,
  localFixtureQuote,
  hashReasonCodes,
  hashVersion,
  signQuote,
  toRiskGuardQuote,
  validateQuoteForEvidence,
} from "../src/index.js";
import { OpenAICompatibleQuoteAdapter } from "../src/model-adapter.js";

describe("underwriting agent", () => {
  it("fails closed when a model adapter is unavailable", async () => {
    const result = await generateQuote(
      { ...DEMO_EVIDENCE_PACKET, proofStatus: "LIVE_VERIFIED" },
      null,
      1_786_200_000,
    );
    expect(result.mode).toBe("REFER");
    expect(result.quote.decision).toBe("REFER");
    expect(result.quote.reasonCodes).toContain("MODEL_UNAVAILABLE");
    expect(result.quote.expiresAt).toBe(1_786_200_000);
  });

  it("requests and parses the strict provider quote contract", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  decision: "APPROVE",
                  advanceBps: 3_000,
                  feeBps: 250,
                  expiresAt: 1_786_200_300,
                  riskTier: "B",
                  reasonCodes: ["BUYER_GUARANTEE_VERIFIED"],
                  evidenceIds: [DEMO_EVIDENCE_PACKET.evidenceId],
                  policyVersion: "2026-08-demo-v1",
                  modelVersion: "structured-agent-v1",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const quote = await new OpenAICompatibleQuoteAdapter({
      baseUrl: "https://example.test/v1",
      apiKey: "test-key",
      model: "test-model",
    }).generateQuote({ ...DEMO_EVIDENCE_PACKET, proofStatus: "LIVE_VERIFIED" });

    expect(quote.decision).toBe("APPROVE");
    expect(quote.evidenceIds).toEqual([DEMO_EVIDENCE_PACKET.evidenceId]);
    const request = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body)).response_format).toMatchObject({
      type: "json_schema",
      json_schema: { strict: true },
    });
    vi.unstubAllGlobals();
  });

  it("does not claim signer authorization for an unsigned model proposal", async () => {
    const result = await generateQuote(
      { ...DEMO_EVIDENCE_PACKET, proofStatus: "LIVE_VERIFIED" },
      { generateQuote: async () => DEMO_SAFE_QUOTE },
      1_786_200_000,
    );

    expect(result.mode).toBe("MODEL");
    expect(result.policy?.decision).toBe("APPROVED");
    expect(
      result.policy?.checks.find((check) => check.id === "signer")?.status,
    ).toBe("NOT_APPLICABLE");
  });

  it("does not send local fixtures to a configured model", async () => {
    const result = await generateQuote(DEMO_EVIDENCE_PACKET, {
      generateQuote: async () => DEMO_SAFE_QUOTE,
    });

    expect(result.mode).toBe("REFER");
    expect(result.quote.decision).toBe("REFER");
    expect(result.quote.reasonCodes).toContain("EVIDENCE_MISSING");
  });

  it("keeps the safe fixture inside policy", () => {
    const result = localFixtureQuote("safe");
    expect(result.policy?.decision).toBe("APPROVED");
    expect(result.policy?.approvedAdvanceMinor).toBe(300_000);
    expect(
      result.policy?.checks.find((check) => check.id === "signer")?.status,
    ).toBe("NOT_APPLICABLE");
  });

  it("shows the unsafe fixture as rejected by policy", () => {
    const result = localFixtureQuote("unsafe");
    expect(result.policy?.decision).toBe("REJECTED");
    expect(result.policy?.failureCode).toBe("ADVANCE_LIMIT");
  });

  it("does not make a zero-value model approval eligible for signing", async () => {
    const result = await generateQuote(
      { ...DEMO_EVIDENCE_PACKET, proofStatus: "LIVE_VERIFIED" },
      { generateQuote: async () => ({ ...DEMO_SAFE_QUOTE, advanceBps: 0 }) },
      1_786_200_000,
    );

    expect(result.mode).toBe("MODEL");
    expect(result.policy?.decision).toBe("REJECTED");
    expect(result.policy?.failureCode).toBe("ZERO_ADVANCE");
    expect(() => assertQuoteCanBeSigned(result)).toThrow(
      "deterministic policy",
    );
  });

  it("never signs the local fixture boundary", () => {
    expect(() => assertQuoteCanBeSigned(localFixtureQuote("safe"))).toThrow(
      "LIVE_VERIFIED",
    );
  });

  it("rejects a quote bound to another evidence id", () => {
    expect(() =>
      validateQuoteForEvidence(DEMO_EVIDENCE_PACKET, {
        ...DEMO_SAFE_QUOTE,
        evidenceIds: [`0x${"ff".repeat(32)}`],
      }),
    ).toThrow("exactly the registered evidence");
  });

  it("rejects a quote that cites additional evidence IDs", () => {
    expect(() =>
      validateQuoteForEvidence(DEMO_EVIDENCE_PACKET, {
        ...DEMO_SAFE_QUOTE,
        evidenceIds: [DEMO_EVIDENCE_PACKET.evidenceId, `0x${"ff".repeat(32)}`],
      }),
    ).toThrow("exactly the registered evidence");
  });

  it("requires the pinned RiskGuard model version", () => {
    expect(() =>
      validateQuoteForEvidence(DEMO_EVIDENCE_PACKET, {
        ...DEMO_SAFE_QUOTE,
        modelVersion: "provider-model-name",
      }),
    ).toThrow("Invalid input");
  });

  it("signs a quote with the same EIP-712 payload RiskGuard receives", async () => {
    const reasonCodesHash = hashReasonCodes(DEMO_SAFE_QUOTE.reasonCodes);
    const policyVersionHash = hashVersion(DEMO_SAFE_QUOTE.policyVersion);
    const modelVersionHash = hashVersion(DEMO_SAFE_QUOTE.modelVersion);
    const orderId = DEMO_EVIDENCE_PACKET.orderId as `0x${string}`;
    const riskGuardQuote = toRiskGuardQuote(
      DEMO_SAFE_QUOTE,
      orderId,
      reasonCodesHash,
      policyVersionHash,
      modelVersionHash,
    );
    const signed = await signQuote(
      DEMO_SAFE_QUOTE,
      orderId,
      `0x${"11".repeat(32)}`,
      102031,
      `0x${"22".repeat(20)}`,
      reasonCodesHash,
      policyVersionHash,
      modelVersionHash,
    );

    expect(signed.signature).toMatch(/^0x[0-9a-f]{130}$/i);
    expect(riskGuardQuote.advanceBps).toBe(3_000);
    expect(riskGuardQuote.nonce).toBe(0n);
  });
});
