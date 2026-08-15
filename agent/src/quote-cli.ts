import { readFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MODEL_VERSION, type FacilityQuote } from "@loomcredit/shared";
import { type Hex } from "viem";

import { parseEvidencePacket } from "./evidence.js";
import { adapterFromEnvironment } from "./model-adapter.js";
import { evaluateAgentQuote } from "./policy.js";
import { assertQuoteCanBeSigned, generateQuote } from "./quote.js";
import {
  hashReasonCodes,
  hashVersion,
  signQuote,
  toRiskGuardQuote,
} from "./signing.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CREDITCOIN_CHAIN_ID = 102031;

const usage = `Usage: pnpm --filter @loomcredit/agent quote <evidence-packet.json> [--sign]

Reads one typed EvidencePacket and prints a schema-bound quote plus the
deterministic policy result. Without model configuration it returns REFER.
Use --sign only with a LIVE_VERIFIED packet and a separately allowlisted agent
signer; signing does not submit a transaction.`;

try {
  loadEnvFile(resolve(workspaceRoot, ".env"));
} catch (error) {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    error.code !== "ENOENT"
  ) {
    throw error;
  }
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function isEvmAddress(value: string | undefined): value is Hex {
  return Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value));
}

function isPrivateKey(value: string | undefined): value is Hex {
  return Boolean(value && /^(0x)?[a-fA-F0-9]{64}$/.test(value));
}

function parseChainIdValue(value: string, label: string): number {
  if (!/^\d+$/.test(value))
    throw new Error(`CONFIG_INVALID: ${label} must be numeric`);
  return Number(value);
}

async function resolveCreditcoinChainId(): Promise<number> {
  const configured = optionalEnv("CREDITCOIN_CHAIN_ID");
  const manifestPath = resolve(
    workspaceRoot,
    optionalEnv("CREDITCOIN_DEPLOYMENT_MANIFEST") ??
      "docs/deployments/creditcoin-deployment.json",
  );

  let manifestChainId: number | null = null;
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      chainId?: unknown;
    };
    if (typeof manifest.chainId === "number")
      manifestChainId = manifest.chainId;
    else if (
      typeof manifest.chainId === "string" &&
      /^\d+$/.test(manifest.chainId)
    ) {
      manifestChainId = Number(manifest.chainId);
    }
  } catch {
    manifestChainId = null;
  }

  // The manifest is evidence to compare, not authority to select a network.
  // Keep the configured chain or the known CC3 default as the trust anchor.
  const resolved = configured ?? String(CREDITCOIN_CHAIN_ID);
  if (
    manifestChainId !== null &&
    parseChainIdValue(resolved, "CREDITCOIN_CHAIN_ID") !== manifestChainId
  ) {
    throw new Error(
      `CONFIG_INVALID: CREDITCOIN_CHAIN_ID (${resolved}) does not match deployment manifest chain ${manifestChainId}`,
    );
  }

  return parseChainIdValue(resolved, "CREDITCOIN_CHAIN_ID");
}

function parseNonce(): number {
  const value = optionalEnv("QUOTE_NONCE") ?? "0";
  if (!/^\d+$/.test(value))
    throw new Error("CONFIG_INVALID: QUOTE_NONCE must be numeric");
  const nonce = Number(value);
  if (!Number.isSafeInteger(nonce) || nonce < 0)
    throw new Error(
      "CONFIG_INVALID: QUOTE_NONCE must be a safe non-negative integer",
    );
  return nonce;
}

async function resolveRiskGuardAddress(): Promise<Hex | undefined> {
  const explicit = optionalEnv("RISK_GUARD_ADDRESS");
  if (isEvmAddress(explicit)) return explicit;
  if (explicit) {
    throw new Error(
      "CONFIG_INVALID: RISK_GUARD_ADDRESS must be a 20-byte address",
    );
  }

  const manifestPath = resolve(
    workspaceRoot,
    optionalEnv("CREDITCOIN_DEPLOYMENT_MANIFEST") ??
      "docs/deployments/creditcoin-deployment.json",
  );
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      contracts?: { RiskGuard?: { address?: unknown } };
    };
    const address = manifest.contracts?.RiskGuard?.address;
    if (typeof address === "string" && /^0x[a-fA-F0-9]{40}$/.test(address)) {
      return address as Hex;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function resolveAgentSignerAddress(): Promise<Hex | undefined> {
  const explicit = optionalEnv("CREDITCOIN_AGENT_SIGNER_ADDRESS");
  if (explicit) {
    if (!isEvmAddress(explicit)) {
      throw new Error(
        "CONFIG_INVALID: CREDITCOIN_AGENT_SIGNER_ADDRESS must be a 20-byte EVM address",
      );
    }
    return explicit;
  }

  const manifestPath = resolve(
    workspaceRoot,
    optionalEnv("CREDITCOIN_DEPLOYMENT_MANIFEST") ??
      "docs/deployments/creditcoin-deployment.json",
  );
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      agentSigner?: unknown;
    };
    if (typeof manifest.agentSigner === "string") {
      if (!isEvmAddress(manifest.agentSigner)) {
        throw new Error(
          "CONFIG_INVALID: Creditcoin deployment manifest agentSigner is invalid",
        );
      }
      return manifest.agentSigner;
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CONFIG_INVALID:")) {
      throw error;
    }
    return undefined;
  }
  return undefined;
}

async function signIfRequested(
  packet: ReturnType<typeof parseEvidencePacket>,
  quote: FacilityQuote,
  shouldSign: boolean,
  chainId: number,
): Promise<{
  quote: typeof quote;
  signer: string;
  signature: Hex;
  chainId: number;
  verifyingContract: Hex;
  riskGuardQuote: ReturnType<typeof toRiskGuardQuote>;
} | null> {
  if (!shouldSign || quote.decision !== "APPROVE") return null;

  const privateKeyValue = optionalEnv("CREDITCOIN_AGENT_PRIVATE_KEY");
  if (!isPrivateKey(privateKeyValue)) {
    throw new Error(
      "CONFIG_INVALID: CREDITCOIN_AGENT_PRIVATE_KEY is required to sign an approved quote",
    );
  }
  const privateKey = (
    privateKeyValue.startsWith("0x") ? privateKeyValue : `0x${privateKeyValue}`
  ) as Hex;
  const verifyingContract = await resolveRiskGuardAddress();
  if (!verifyingContract) {
    throw new Error(
      "CONFIG_INVALID: RISK_GUARD_ADDRESS or a deployed Creditcoin manifest is required to sign a quote",
    );
  }

  const nonce = parseNonce();
  const quoteWithNonce = { ...quote, nonce };
  const reasonCodesHash = hashReasonCodes(quoteWithNonce.reasonCodes);
  const policyVersionHash = hashVersion(quoteWithNonce.policyVersion);
  const modelVersionHash = hashVersion(MODEL_VERSION);
  const signed = await signQuote(
    quoteWithNonce,
    packet.orderId as Hex,
    privateKey,
    chainId,
    verifyingContract,
    reasonCodesHash,
    policyVersionHash,
    modelVersionHash,
  );
  const expectedAgentSigner = await resolveAgentSignerAddress();
  if (
    expectedAgentSigner &&
    signed.signer.toLowerCase() !== expectedAgentSigner.toLowerCase()
  ) {
    throw new Error(
      "CONFIG_INVALID: CREDITCOIN_AGENT_PRIVATE_KEY does not derive the configured allowlisted agent signer",
    );
  }

  return {
    quote: quoteWithNonce,
    signer: signed.signer,
    signature: signed.signature,
    chainId,
    verifyingContract,
    riskGuardQuote: toRiskGuardQuote(
      quoteWithNonce,
      packet.orderId as Hex,
      reasonCodesHash,
      policyVersionHash,
      modelVersionHash,
    ),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    return;
  }
  const shouldSign =
    args.includes("--sign") || process.env.AGENT_SIGN_QUOTE === "true";
  const inputPath = args.find((argument) => !argument.startsWith("--"));
  if (!inputPath) {
    throw new Error(`USAGE_ERROR: missing evidence packet path\n\n${usage}`);
  }

  let rawInput: string;
  try {
    rawInput = await readFile(inputPath, "utf8");
  } catch {
    throw new Error(`INPUT_INVALID: unable to read ${inputPath}`);
  }

  let input: unknown;
  try {
    input = JSON.parse(rawInput) as unknown;
  } catch {
    throw new Error("INPUT_INVALID: evidence packet is not valid JSON");
  }

  const evidence = parseEvidencePacket(input);
  const now = Math.floor(Date.now() / 1000);
  const result = await generateQuote(evidence, adapterFromEnvironment(), now);
  if (shouldSign) assertQuoteCanBeSigned(result);
  const chainId = await resolveCreditcoinChainId();
  const signed = await signIfRequested(
    evidence,
    result.quote,
    shouldSign,
    chainId,
  );
  const outputPolicy =
    signed && result.policy
      ? evaluateAgentQuote(evidence, signed.quote, now, true)
      : result.policy;
  console.log(
    JSON.stringify(
      {
        boundary:
          result.mode === "MODEL" ? "MODEL_TYPED_EVIDENCE" : result.mode,
        proofStatus: evidence.proofStatus,
        evidenceId: evidence.evidenceId,
        orderId: evidence.orderId,
        mode: result.mode,
        quote: signed?.quote ?? result.quote,
        policy: outputPolicy,
        signing: signed
          ? {
              status: "SIGNED",
              signer: signed.signer,
              signature: signed.signature,
              chainId: signed.chainId,
              verifyingContract: signed.verifyingContract,
              riskGuardQuote: {
                ...signed.riskGuardQuote,
                expiresAt: signed.riskGuardQuote.expiresAt.toString(),
                nonce: signed.riskGuardQuote.nonce.toString(),
              },
            }
          : {
              status: shouldSign ? "NOT_ELIGIBLE" : "NOT_REQUESTED",
              reason:
                result.quote.decision === "APPROVE"
                  ? "Pass --sign with CREDITCOIN_AGENT_PRIVATE_KEY and RISK_GUARD_ADDRESS to produce a RiskGuard payload."
                  : "Only an approved quote is eligible for RiskGuard signing.",
            },
      },
      null,
      2,
    ),
  );
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
