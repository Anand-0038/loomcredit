import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { keccak256, toUtf8Bytes } from "ethers";

import { summarizeAgentArtifact } from "./agent-evidence.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const evidence = JSON.parse(
  readFileSync(resolve(root, "docs/demo-evidence.json"), "utf8"),
);
const packet = evidence.packet;
const NOW = 1_000;
const quote = {
  decision: "APPROVE",
  advanceBps: 2_000,
  feeBps: 100,
  expiresAt: NOW + 300,
  riskTier: "A",
  reasonCodes: ["BUYER_GUARANTEE_VERIFIED"],
  evidenceIds: [packet.evidenceId],
  policyVersion: packet.policyVersion,
  modelVersion: "structured-agent-v1",
};

function artifact(overrides = {}) {
  return {
    mode: "MODEL",
    proofStatus: "LIVE_VERIFIED",
    orderId: packet.orderId,
    evidenceId: packet.evidenceId,
    quote,
    policy: { decision: "APPROVED" },
    signing: { status: "NOT_REQUESTED" },
    ...overrides,
  };
}

function hashText(value) {
  return keccak256(toUtf8Bytes(value));
}

function signedRiskGuardQuote(overrides = {}) {
  return {
    orderId: packet.orderId,
    decision: hashText(quote.decision),
    advanceBps: quote.advanceBps,
    feeBps: quote.feeBps,
    expiresAt: String(quote.expiresAt),
    evidenceId: packet.evidenceId,
    reasonCodesHash: hashText(quote.reasonCodes.join("|")),
    policyVersion: hashText(quote.policyVersion),
    modelVersion: hashText(quote.modelVersion),
    nonce: "0",
    ...overrides,
  };
}

test("summarizes a live unsigned model quote without exposing raw output", () => {
  const summary = summarizeAgentArtifact(artifact(), packet, { now: NOW });
  assert.deepEqual(
    {
      status: summary.status,
      boundary: summary.boundary,
      decision: summary.decision,
      evidenceId: summary.evidenceId,
      signing: summary.signing,
    },
    {
      status: "MODEL_QUOTE_VERIFIED",
      boundary: "LIVE_MODEL_QUOTE",
      decision: "APPROVE",
      evidenceId: packet.evidenceId,
      signing: { status: "NOT_REQUESTED" },
    },
  );
  assert.equal("signature" in summary, false);
});

test("summarizes signed RiskGuard terms and accepts serialized uint fields", () => {
  const summary = summarizeAgentArtifact(
    artifact({
      signing: {
        status: "SIGNED",
        signer: `0x${"11".repeat(20)}`,
        signature: `0x${"22".repeat(65)}`,
        chainId: 102031,
        verifyingContract: evidence.creditcoin.riskGuardAddress,
        riskGuardQuote: signedRiskGuardQuote(),
      },
    }),
    packet,
    { now: NOW },
  );
  assert.equal(summary.status, "SIGNED_QUOTE_BOUND");
  assert.equal(summary.boundary, "LIVE_SIGNED_QUOTE_BOUND");
  assert.equal(summary.signing.status, "SIGNED");
  assert.equal(summary.signing.chainId, 102031);
});

test("rejects signed RiskGuard terms that drift from the model quote", () => {
  assert.throws(
    () =>
      summarizeAgentArtifact(
        artifact({
          signing: {
            status: "SIGNED",
            signer: `0x${"11".repeat(20)}`,
            signature: `0x${"22".repeat(65)}`,
            chainId: 102031,
            verifyingContract: evidence.creditcoin.riskGuardAddress,
            riskGuardQuote: signedRiskGuardQuote({
              reasonCodesHash: `0x${"44".repeat(32)}`,
            }),
          },
        }),
        packet,
        { now: NOW },
      ),
    /signed RiskGuard terms do not match the model quote/,
  );
});

test("does not publish a signed artifact for a policy-rejected quote", () => {
  assert.throws(
    () =>
      summarizeAgentArtifact(
        artifact({
          policy: { decision: "REJECTED", failureCode: "ADVANCE_LIMIT" },
          signing: {
            status: "SIGNED",
            signer: `0x${"11".repeat(20)}`,
            signature: `0x${"22".repeat(65)}`,
            chainId: 102031,
            verifyingContract: evidence.creditcoin.riskGuardAddress,
            riskGuardQuote: signedRiskGuardQuote(),
          },
        }),
        packet,
        { now: NOW },
      ),
    /signed quote requires an APPROVED policy result/,
  );
});

test("rejects fixture evidence before accepting an agent result", () => {
  assert.throws(
    () =>
      summarizeAgentArtifact(
        artifact({ proofStatus: "LOCAL_FIXTURE" }),
        packet,
        { now: NOW },
      ),
    /not bound to LIVE_VERIFIED evidence/,
  );
});

test("rejects a quote bound to a different order", () => {
  assert.throws(
    () =>
      summarizeAgentArtifact(
        artifact({ orderId: `0x${"aa".repeat(32)}` }),
        packet,
        { now: NOW },
      ),
    /orderId does not match/,
  );
});

test("rejects an expired model quote", () => {
  assert.throws(
    () =>
      summarizeAgentArtifact(
        artifact({ quote: { ...quote, expiresAt: NOW - 1 } }),
        packet,
        { now: NOW },
      ),
    /quote has expired/,
  );
});
