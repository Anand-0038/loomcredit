import { readFileSync } from "node:fs";

import { keccak256, toUtf8Bytes } from "ethers";

const MODEL_VERSION = "structured-agent-v1";
const DECISIONS = new Set(["APPROVE", "REFER", "REJECT"]);
const RISK_TIERS = new Set(["A", "B", "C", "REFER"]);
const POLICY_DECISIONS = new Set(["APPROVED", "REJECTED", "REFER"]);
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const BYTES32_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const SIGNATURE_PATTERN = /^0x[a-fA-F0-9]{130}$/;

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function requireRecord(value, field) {
  if (!isRecord(value)) {
    throw new Error(`AGENT_EVIDENCE_INVALID: ${field} must be an object`);
  }
  return value;
}

function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `AGENT_EVIDENCE_INVALID: ${field} must be a non-empty string`,
    );
  }
  return value;
}

function requireInteger(
  value,
  field,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `AGENT_EVIDENCE_INVALID: ${field} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function requireSerializedInteger(
  value,
  field,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  if (typeof value === "number") {
    return requireInteger(value, field, minimum, maximum);
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(
      `AGENT_EVIDENCE_INVALID: ${field} must be an unsigned integer`,
    );
  }
  const parsed = BigInt(value);
  if (parsed > BigInt(maximum) || parsed < BigInt(minimum)) {
    throw new Error(
      `AGENT_EVIDENCE_INVALID: ${field} must be between ${minimum} and ${maximum}`,
    );
  }
  return Number(parsed);
}

function requireHex(value, field, pattern = BYTES32_PATTERN) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(
      `AGENT_EVIDENCE_INVALID: ${field} has an invalid hex value`,
    );
  }
  return value;
}

function requireMatchingId(actual, expected, field) {
  requireHex(actual, field);
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `AGENT_EVIDENCE_INVALID: ${field} does not match the LIVE_VERIFIED packet`,
    );
  }
  return actual;
}

function hashText(value) {
  return keccak256(toUtf8Bytes(value));
}

function hashReasonCodes(reasonCodes) {
  return hashText(reasonCodes.join("|"));
}

function requireQuote(artifact, packet) {
  const quote = requireRecord(artifact.quote, "quote");
  const decision = requireString(quote.decision, "quote.decision");
  if (!DECISIONS.has(decision)) {
    throw new Error(`AGENT_EVIDENCE_INVALID: quote.decision is unsupported`);
  }
  const advanceBps = requireInteger(
    quote.advanceBps,
    "quote.advanceBps",
    0,
    10_000,
  );
  const feeBps = requireInteger(quote.feeBps, "quote.feeBps", 0, 10_000);
  const expiresAt = requireInteger(quote.expiresAt, "quote.expiresAt", 1);
  const riskTier = requireString(quote.riskTier, "quote.riskTier");
  if (!RISK_TIERS.has(riskTier)) {
    throw new Error(`AGENT_EVIDENCE_INVALID: quote.riskTier is unsupported`);
  }
  const reasonCodes = quote.reasonCodes;
  if (
    !Array.isArray(reasonCodes) ||
    reasonCodes.length < 1 ||
    reasonCodes.some((code) => typeof code !== "string" || code.length === 0)
  ) {
    throw new Error(
      "AGENT_EVIDENCE_INVALID: quote.reasonCodes must contain at least one code",
    );
  }
  const evidenceIds = quote.evidenceIds;
  if (
    !Array.isArray(evidenceIds) ||
    evidenceIds.length !== 1 ||
    evidenceIds[0]?.toLowerCase() !== packet.evidenceId.toLowerCase()
  ) {
    throw new Error(
      "AGENT_EVIDENCE_INVALID: quote must reference exactly the LIVE_VERIFIED evidence ID",
    );
  }
  requireHex(evidenceIds[0], "quote.evidenceIds[0]");
  const policyVersion = requireString(
    quote.policyVersion,
    "quote.policyVersion",
  );
  if (policyVersion !== packet.policyVersion) {
    throw new Error(
      "AGENT_EVIDENCE_INVALID: quote.policyVersion does not match the evidence packet",
    );
  }
  const modelVersion = requireString(quote.modelVersion, "quote.modelVersion");
  if (modelVersion !== MODEL_VERSION) {
    throw new Error(
      `AGENT_EVIDENCE_INVALID: quote.modelVersion must be ${MODEL_VERSION}`,
    );
  }
  if (quote.nonce !== undefined) {
    requireInteger(quote.nonce, "quote.nonce", 0, Number.MAX_SAFE_INTEGER);
  }
  return {
    decision,
    advanceBps,
    feeBps,
    expiresAt,
    riskTier,
    reasonCodes: [...reasonCodes],
    evidenceIds: [...evidenceIds],
    policyVersion,
    modelVersion,
    ...(quote.nonce === undefined ? {} : { nonce: quote.nonce }),
  };
}

function requirePolicy(artifact) {
  const policy = requireRecord(artifact.policy, "policy");
  const decision = requireString(policy.decision, "policy.decision");
  if (!POLICY_DECISIONS.has(decision)) {
    throw new Error(`AGENT_EVIDENCE_INVALID: policy.decision is unsupported`);
  }
  if (
    policy.failureCode !== undefined &&
    typeof policy.failureCode !== "string"
  ) {
    throw new Error(
      "AGENT_EVIDENCE_INVALID: policy.failureCode must be a string",
    );
  }
  return {
    decision,
    ...(policy.failureCode === undefined
      ? {}
      : { failureCode: policy.failureCode }),
  };
}

function summarizeSigning(artifact, quote, packet) {
  const signing = requireRecord(artifact.signing, "signing");
  const status = requireString(signing.status, "signing.status");
  if (status === "NOT_REQUESTED" || status === "NOT_ELIGIBLE") {
    return { status };
  }
  if (status !== "SIGNED") {
    throw new Error(
      `AGENT_EVIDENCE_INVALID: unsupported signing.status ${status}`,
    );
  }

  const signer = requireHex(signing.signer, "signing.signer", ADDRESS_PATTERN);
  const signature = requireHex(
    signing.signature,
    "signing.signature",
    SIGNATURE_PATTERN,
  );
  const verifyingContract = requireHex(
    signing.verifyingContract,
    "signing.verifyingContract",
    ADDRESS_PATTERN,
  );
  const chainId = requireInteger(signing.chainId, "signing.chainId", 1);
  const riskGuardQuote = requireRecord(
    signing.riskGuardQuote,
    "signing.riskGuardQuote",
  );
  requireMatchingId(
    riskGuardQuote.orderId,
    packet.orderId,
    "riskGuardQuote.orderId",
  );
  requireMatchingId(
    riskGuardQuote.evidenceId,
    packet.evidenceId,
    "riskGuardQuote.evidenceId",
  );
  requireSerializedInteger(
    riskGuardQuote.advanceBps,
    "riskGuardQuote.advanceBps",
    0,
    65_535,
  );
  requireSerializedInteger(
    riskGuardQuote.feeBps,
    "riskGuardQuote.feeBps",
    0,
    65_535,
  );
  requireSerializedInteger(
    riskGuardQuote.expiresAt,
    "riskGuardQuote.expiresAt",
    1,
  );
  requireSerializedInteger(
    riskGuardQuote.nonce,
    "riskGuardQuote.nonce",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  for (const field of [
    "decision",
    "reasonCodesHash",
    "policyVersion",
    "modelVersion",
  ]) {
    requireHex(riskGuardQuote[field], `riskGuardQuote.${field}`);
  }
  if (
    requireSerializedInteger(
      riskGuardQuote.advanceBps,
      "riskGuardQuote.advanceBps",
    ) !== quote.advanceBps ||
    requireSerializedInteger(riskGuardQuote.feeBps, "riskGuardQuote.feeBps") !==
      quote.feeBps ||
    requireSerializedInteger(
      riskGuardQuote.expiresAt,
      "riskGuardQuote.expiresAt",
    ) !== quote.expiresAt ||
    riskGuardQuote.decision.toLowerCase() !==
      hashText(quote.decision).toLowerCase() ||
    riskGuardQuote.reasonCodesHash.toLowerCase() !==
      hashReasonCodes(quote.reasonCodes).toLowerCase() ||
    riskGuardQuote.policyVersion.toLowerCase() !==
      hashText(quote.policyVersion).toLowerCase() ||
    riskGuardQuote.modelVersion.toLowerCase() !==
      hashText(quote.modelVersion).toLowerCase() ||
    requireSerializedInteger(
      riskGuardQuote.nonce,
      "riskGuardQuote.nonce",
      0,
      Number.MAX_SAFE_INTEGER,
    ) !== (quote.nonce ?? 0)
  ) {
    throw new Error(
      "AGENT_EVIDENCE_INVALID: signed RiskGuard terms do not match the model quote",
    );
  }
  return {
    status,
    signer,
    signature,
    chainId,
    verifyingContract,
  };
}

/**
 * Validate and reduce the agent CLI output to a public-safe evidence summary.
 * The summary deliberately excludes the signature and raw model response from
 * the generated demo bundle. A signed artifact is structurally bound here;
 * build-demo-evidence.mjs separately runs submit-quote.mjs in dry-run mode to
 * validate its EIP-712 signature before upgrading the status.
 */
export function summarizeAgentArtifact(
  artifact,
  packet,
  { now = Math.floor(Date.now() / 1000) } = {},
) {
  const livePacket = requireRecord(packet, "packet");
  if (livePacket.proofStatus !== "LIVE_VERIFIED") {
    throw new Error(
      "AGENT_EVIDENCE_INVALID: only a LIVE_VERIFIED evidence packet may be attached",
    );
  }
  const input = requireRecord(artifact, "artifact");
  if (input.mode !== "MODEL") {
    throw new Error(
      "AGENT_EVIDENCE_INVALID: only a real MODEL artifact may be attached",
    );
  }
  if (input.proofStatus !== "LIVE_VERIFIED") {
    throw new Error(
      "AGENT_EVIDENCE_INVALID: agent artifact is not bound to LIVE_VERIFIED evidence",
    );
  }
  requireMatchingId(input.orderId, livePacket.orderId, "orderId");
  requireMatchingId(input.evidenceId, livePacket.evidenceId, "evidenceId");
  const quote = requireQuote(input, livePacket);
  if (quote.expiresAt < now) {
    throw new Error("AGENT_EVIDENCE_INVALID: quote has expired");
  }
  const policy = requirePolicy(input);
  if (policy.decision === "APPROVED" && quote.decision !== "APPROVE") {
    throw new Error(
      "AGENT_EVIDENCE_INVALID: an APPROVED policy result requires an APPROVE quote",
    );
  }
  const signing = summarizeSigning(input, quote, livePacket);
  if (signing.status === "SIGNED" && policy.decision !== "APPROVED") {
    throw new Error(
      "AGENT_EVIDENCE_INVALID: a signed quote requires an APPROVED policy result",
    );
  }

  return {
    status:
      signing.status === "SIGNED"
        ? "SIGNED_QUOTE_BOUND"
        : "MODEL_QUOTE_VERIFIED",
    boundary:
      signing.status === "SIGNED"
        ? "LIVE_SIGNED_QUOTE_BOUND"
        : "LIVE_MODEL_QUOTE",
    mode: "MODEL",
    proofStatus: "LIVE_VERIFIED",
    orderId: livePacket.orderId,
    evidenceId: livePacket.evidenceId,
    decision: quote.decision,
    advanceBps: quote.advanceBps,
    feeBps: quote.feeBps,
    expiresAt: quote.expiresAt,
    riskTier: quote.riskTier,
    modelVersion: quote.modelVersion,
    policyVersion: quote.policyVersion,
    policyDecision: policy.decision,
    ...(policy.failureCode ? { policyFailureCode: policy.failureCode } : {}),
    signing: {
      status: signing.status,
      ...(signing.signer ? { signer: signing.signer } : {}),
      ...(signing.chainId ? { chainId: signing.chainId } : {}),
      ...(signing.verifyingContract
        ? { verifyingContract: signing.verifyingContract }
        : {}),
    },
  };
}

export function readAgentArtifact(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`AGENT_EVIDENCE_INVALID: unable to read ${path}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`AGENT_EVIDENCE_INVALID: ${path} is not valid JSON`);
  }
}
