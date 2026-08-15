import { readFile } from "node:fs/promises";

import {
  Contract,
  Interface,
  TypedDataEncoder,
  Wallet,
  verifyTypedData,
} from "ethers";

import {
  closeProvider,
  createProvider,
  EXPLORER_URLS,
  formatError,
  loadManifest,
  manifestAddress,
  normalizePrivateKey,
  optionalEnv,
  requireEnv,
} from "./deployment-utils.mjs";

const CREDITCOIN_CHAIN_ID = 102031;
const RISK_GUARD_ABI = [
  "function submitQuote((bytes32 orderId,bytes32 decision,uint16 advanceBps,uint16 feeBps,uint64 expiresAt,bytes32 evidenceId,bytes32 reasonCodesHash,bytes32 policyVersion,bytes32 modelVersion,uint64 nonce) quote,bytes signature) returns (uint256 amount)",
  "function approvedSigners(address signer) view returns (bool)",
  "event QuoteApproved(bytes32 indexed orderId,bytes32 indexed evidenceId,uint256 amount,bytes32 quoteHash)",
  "event QuoteDecisionAudited(bytes32 indexed orderId,bytes32 indexed evidenceId,bytes32 decision,uint256 amount,uint16 advanceBps,uint16 feeBps,uint64 expiresAt,bytes32 reasonCodesHash,bytes32 policyVersion,bytes32 modelVersion,uint64 nonce,bytes32 quoteHash)",
];
const riskGuardInterface = new Interface(RISK_GUARD_ABI);
const usage = `Usage: pnpm submit:quote <signed-quote.json> [--dry-run] [--chain-check] [--no-chain-check]

Validates a signed LIVE_VERIFIED quote against the configured RiskGuard. Use
--dry-run to verify the recovered signer and contract binding without RPC or
transaction mutation. Add --chain-check to verify allowlist status against the
configured RiskGuard deployment in dry-runs. Live submission performs the
allowlist check by default; pass --no-chain-check to skip the pre-flight
allowlist check.`;
const quoteTypes = {
  FacilityQuote: [
    { name: "orderId", type: "bytes32" },
    { name: "decision", type: "bytes32" },
    { name: "advanceBps", type: "uint16" },
    { name: "feeBps", type: "uint16" },
    { name: "expiresAt", type: "uint64" },
    { name: "evidenceId", type: "bytes32" },
    { name: "reasonCodesHash", type: "bytes32" },
    { name: "policyVersion", type: "bytes32" },
    { name: "modelVersion", type: "bytes32" },
    { name: "nonce", type: "uint64" },
  ],
};

function parseChainIdValue(value) {
  if (!/^\d+$/.test(value)) {
    throw new Error("CONFIG_INVALID: CREDITCOIN_CHAIN_ID must be numeric");
  }
  return Number(value);
}

async function resolveChainId() {
  const configured = optionalEnv("CREDITCOIN_CHAIN_ID");
  const manifestPath =
    optionalEnv("CREDITCOIN_DEPLOYMENT_MANIFEST") ??
    "docs/deployments/creditcoin-deployment.json";

  let manifestChainId = null;
  try {
    const manifest = await loadManifest(manifestPath);
    if (typeof manifest.chainId === "number") {
      manifestChainId = String(manifest.chainId);
    } else if (
      typeof manifest.chainId === "string" &&
      /^\d+$/.test(manifest.chainId)
    ) {
      manifestChainId = manifest.chainId;
    }
  } catch {
    manifestChainId = null;
  }

  // Never let a deployment manifest silently choose the execution network.
  // The configured chain or the known CC3 default is the trust anchor; the
  // manifest is only compared against it for drift detection.
  const resolved = configured ?? String(CREDITCOIN_CHAIN_ID);
  if (
    manifestChainId !== null &&
    parseChainIdValue(resolved) !== parseChainIdValue(manifestChainId)
  ) {
    throw new Error(
      `CONFIG_INVALID: CREDITCOIN_CHAIN_ID (${resolved}) does not match deployment manifest chain ${manifestChainId}`,
    );
  }

  return parseChainIdValue(resolved);
}

function isBytes32(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
}

function isAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function parseUint(value, field, maximum) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    !/^\d+$/.test(String(value))
  ) {
    throw new Error(`INPUT_INVALID: ${field} must be a non-negative integer`);
  }
  const parsed = BigInt(value);
  if (parsed > maximum) {
    throw new Error(`INPUT_INVALID: ${field} exceeds its uint range`);
  }
  return parsed;
}

async function resolveRiskGuardAddress() {
  const explicit = optionalEnv("RISK_GUARD_ADDRESS");
  if (explicit) {
    if (!isAddress(explicit)) {
      throw new Error(
        "CONFIG_INVALID: RISK_GUARD_ADDRESS must be a 20-byte address",
      );
    }
    return explicit;
  }

  const manifestPath =
    optionalEnv("CREDITCOIN_DEPLOYMENT_MANIFEST") ??
    "docs/deployments/creditcoin-deployment.json";
  const manifest = await loadManifest(manifestPath);
  return manifestAddress(manifest, "RiskGuard", manifestPath);
}

function validateSignedPayload(payload, expectedChainId) {
  if (payload?.proofStatus !== "LIVE_VERIFIED") {
    throw new Error(
      "INPUT_INVALID: only LIVE_VERIFIED evidence may reach RiskGuard",
    );
  }
  if (payload?.signing?.status !== "SIGNED") {
    throw new Error(
      "INPUT_INVALID: quote file does not contain a signed payload",
    );
  }
  const signed = payload.signing;
  if (!isAddress(signed.verifyingContract)) {
    throw new Error("INPUT_INVALID: signing.verifyingContract is invalid");
  }
  if (
    parseUint(signed.chainId, "signing.chainId", (1n << 256n) - 1n) !==
    BigInt(expectedChainId)
  ) {
    throw new Error(
      `INPUT_INVALID: signing.chainId must be ${expectedChainId}`,
    );
  }
  if (!/^0x[a-fA-F0-9]{130}$/.test(signed.signature)) {
    throw new Error(
      "INPUT_INVALID: signing.signature must be a 65-byte signature",
    );
  }
  if (!isAddress(signed.signer)) {
    throw new Error("INPUT_INVALID: signing.signer is invalid");
  }
  const quote = signed.riskGuardQuote;
  if (!quote || !isBytes32(quote.orderId) || !isBytes32(quote.evidenceId)) {
    throw new Error(
      "INPUT_INVALID: RiskGuard quote order/evidence IDs are invalid",
    );
  }
  if (
    typeof payload.orderId !== "string" ||
    payload.orderId.toLowerCase() !== quote.orderId.toLowerCase() ||
    typeof payload.evidenceId !== "string" ||
    payload.evidenceId.toLowerCase() !== quote.evidenceId.toLowerCase()
  ) {
    throw new Error(
      "INPUT_INVALID: signed quote IDs do not match the evidence packet",
    );
  }
  for (const field of [
    "decision",
    "reasonCodesHash",
    "policyVersion",
    "modelVersion",
  ]) {
    if (!isBytes32(quote[field])) {
      throw new Error(`INPUT_INVALID: RiskGuard quote ${field} is invalid`);
    }
  }
  const normalizedQuote = {
    ...quote,
    advanceBps: Number(parseUint(quote.advanceBps, "advanceBps", 65_535n)),
    feeBps: Number(parseUint(quote.feeBps, "feeBps", 65_535n)),
    expiresAt: parseUint(quote.expiresAt, "expiresAt", (1n << 64n) - 1n),
    nonce: parseUint(quote.nonce, "nonce", (1n << 64n) - 1n),
  };
  const signingDomain = {
    name: "LoomCredit RiskGuard",
    version: "1",
    chainId: Number(signed.chainId),
    verifyingContract: signed.verifyingContract,
  };
  const recoveredSigner = verifyTypedData(
    signingDomain,
    quoteTypes,
    normalizedQuote,
    signed.signature,
  );
  if (recoveredSigner.toLowerCase() !== signed.signer.toLowerCase()) {
    throw new Error(
      "INPUT_INVALID: signing.signature does not recover the declared signer",
    );
  }
  return {
    signed,
    quote: normalizedQuote,
    expectedQuoteHash: TypedDataEncoder.hash(
      signingDomain,
      quoteTypes,
      normalizedQuote,
    ),
  };
}

async function validateSubmitterAllowlist(riskGuardAddress, signer, chainId) {
  const provider = await createProvider(
    "CREDITCOIN_RPC_URL",
    chainId,
    "Creditcoin CC3 testnet",
  );
  try {
    const riskGuardReader = new Contract(
      riskGuardAddress,
      ["function approvedSigners(address signer) view returns (bool)"],
      provider,
    );
    const approved = await riskGuardReader.approvedSigners(signer);
    if (!approved) {
      throw new Error(
        "INPUT_INVALID: signing.signer is not allowlisted in RiskGuard",
      );
    }
  } finally {
    closeProvider(provider);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    return;
  }
  const inputPath = args.find((argument) => !argument.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  const chainCheck =
    args.includes("--chain-check") ||
    (!dryRun && !args.includes("--no-chain-check"));
  if (!inputPath) {
    throw new Error(`USAGE_ERROR: missing signed quote path\n\n${usage}`);
  }

  const chainId = await resolveChainId();

  let payload;
  try {
    payload = JSON.parse(await readFile(inputPath, "utf8"));
  } catch {
    throw new Error(`INPUT_INVALID: unable to read signed quote ${inputPath}`);
  }
  const { signed, quote, expectedQuoteHash } = validateSignedPayload(
    payload,
    chainId,
  );
  const expectedRiskGuardAddress = await resolveRiskGuardAddress();
  if (
    signed.verifyingContract.toLowerCase() !==
    expectedRiskGuardAddress.toLowerCase()
  ) {
    throw new Error(
      "INPUT_INVALID: signed quote targets a different RiskGuard contract than the configured deployment",
    );
  }

  if (chainCheck) {
    await validateSubmitterAllowlist(
      expectedRiskGuardAddress,
      signed.signer,
      chainId,
    );
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          boundary: "RISKGUARD_SUBMISSION_DRY_RUN",
          status: "VALIDATED",
          mutation: "NONE",
          signer: signed.signer,
          riskGuard: expectedRiskGuardAddress,
          orderId: quote.orderId,
          evidenceId: quote.evidenceId,
          decision: quote.decision,
          advanceBps: quote.advanceBps,
          feeBps: quote.feeBps,
          expiresAt: String(quote.expiresAt),
          reasonCodesHash: quote.reasonCodesHash,
          policyVersion: quote.policyVersion,
          modelVersion: quote.modelVersion,
          nonce: String(quote.nonce),
          quoteHash: expectedQuoteHash,
          chainCheck,
        },
        null,
        2,
      ),
    );
    return;
  }
  const provider = await createProvider(
    "CREDITCOIN_RPC_URL",
    chainId,
    "Creditcoin CC3 testnet",
  );
  try {
    const wallet = new Wallet(
      normalizePrivateKey(
        "CREDITCOIN_WALLET_PRIVATE_KEY",
        requireEnv("CREDITCOIN_WALLET_PRIVATE_KEY"),
      ),
      provider,
    );
    const riskGuard = new Contract(
      expectedRiskGuardAddress,
      RISK_GUARD_ABI,
      wallet,
    );
    const transaction = await riskGuard.submitQuote(
      {
        ...quote,
      },
      signed.signature,
    );
    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1) {
      throw new Error(
        `TX_FAILED: RiskGuard quote transaction failed: ${transaction.hash}`,
      );
    }

    const approval = receipt.logs
      .map((log) => {
        try {
          return riskGuardInterface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "QuoteApproved");
    if (!approval) {
      throw new Error(
        `TX_FAILED: receipt omitted QuoteApproved: ${transaction.hash}`,
      );
    }
    if (
      String(approval.args[0]).toLowerCase() !== quote.orderId.toLowerCase() ||
      String(approval.args[1]).toLowerCase() !== quote.evidenceId.toLowerCase()
    ) {
      throw new Error(
        `TX_FAILED: QuoteApproved does not match signed order/evidence: ${transaction.hash}`,
      );
    }
    if (
      String(approval.args[3]).toLowerCase() !== expectedQuoteHash.toLowerCase()
    ) {
      throw new Error(
        `TX_FAILED: QuoteApproved hash does not match the signed quote: ${transaction.hash}`,
      );
    }

    const audit = receipt.logs
      .map((log) => {
        try {
          return riskGuardInterface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "QuoteDecisionAudited");
    let auditReceipt;
    if (!audit) {
      auditReceipt = {
        status: "NOT_AVAILABLE_ON_DEPLOYED_BYTECODE",
        note: "The current deployment emitted the backwards-compatible QuoteApproved event only; redeploy the updated source to record full decision terms on-chain.",
      };
    } else {
      const matchesSignedQuote =
        String(audit.args[0]).toLowerCase() === quote.orderId.toLowerCase() &&
        String(audit.args[1]).toLowerCase() ===
          quote.evidenceId.toLowerCase() &&
        String(audit.args[2]).toLowerCase() === quote.decision.toLowerCase() &&
        String(audit.args[3]) === String(approval.args[2]) &&
        Number(audit.args[4]) === quote.advanceBps &&
        Number(audit.args[5]) === quote.feeBps &&
        String(audit.args[6]) === String(quote.expiresAt) &&
        String(audit.args[7]).toLowerCase() ===
          quote.reasonCodesHash.toLowerCase() &&
        String(audit.args[8]).toLowerCase() ===
          quote.policyVersion.toLowerCase() &&
        String(audit.args[9]).toLowerCase() ===
          quote.modelVersion.toLowerCase() &&
        String(audit.args[10]) === String(quote.nonce) &&
        String(audit.args[11]).toLowerCase() ===
          expectedQuoteHash.toLowerCase();
      if (!matchesSignedQuote) {
        throw new Error(
          `TX_FAILED: QuoteDecisionAudited does not match the signed quote: ${transaction.hash}`,
        );
      }
      auditReceipt = {
        status: "VERIFIED",
        decision: String(audit.args[2]),
        amount: String(audit.args[3]),
        advanceBps: Number(audit.args[4]),
        feeBps: Number(audit.args[5]),
        expiresAt: String(audit.args[6]),
        reasonCodesHash: String(audit.args[7]),
        policyVersion: String(audit.args[8]),
        modelVersion: String(audit.args[9]),
        nonce: String(audit.args[10]),
        quoteHash: String(audit.args[11]),
      };
    }

    console.log(
      JSON.stringify(
        {
          boundary: "LIVE_RISKGUARD_SUBMISSION",
          status: "APPROVED",
          signer: signed.signer,
          submitter: wallet.address,
          riskGuard: expectedRiskGuardAddress,
          orderId: quote.orderId,
          evidenceId: quote.evidenceId,
          amount: String(approval.args[2]),
          quoteHash: String(approval.args[3]),
          audit: auditReceipt,
          transactionHash: transaction.hash,
          blockNumber: receipt.blockNumber,
          explorer: `${EXPLORER_URLS.creditcoin}/tx/${transaction.hash}`,
        },
        null,
        2,
      ),
    );
  } finally {
    closeProvider(provider);
  }
}

await main().catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
