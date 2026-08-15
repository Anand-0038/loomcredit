import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { loadEnvFile } from "node:process";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { configureRpcTransport } from "./network.js";

const AddressSchema = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/, "must be a 20-byte EVM address");
const UrlSchema = z.string().trim().url();
const PrivateKeySchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return /^[a-fA-F0-9]{64}$/.test(trimmed) ? `0x${trimmed}` : trimmed;
  },
  z.string().regex(/^0x[a-fA-F0-9]{64}$/, "must be a 32-byte hex private key"),
);
const OptionalStringSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);
const OptionalAddressSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  AddressSchema.optional(),
);
const NonNegativeIntegerSchema = z.coerce.number().int().nonnegative();
const PollIntervalSchema = z.coerce.number().int().min(1_000).max(300_000);
const OptionalNonNegativeIntegerSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  NonNegativeIntegerSchema.optional(),
);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

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

configureRpcTransport();

const EnvironmentSchema = z.object({
  SOURCE_CHAIN_RPC_URL: UrlSchema,
  CREDITCOIN_RPC_URL: UrlSchema,
  PROOF_BUILDER_URL: UrlSchema,
  SOURCE_CHAIN_KEY: z.coerce.number().int().positive(),
  SOURCE_ESCROW_ADDRESS: OptionalAddressSchema,
  TRADE_EVIDENCE_USC_ADDRESS: OptionalAddressSchema,
  CREDITCOIN_WALLET_PRIVATE_KEY: PrivateKeySchema,
  SOURCE_DEPLOYMENT_MANIFEST: OptionalStringSchema.default(
    "./docs/deployments/source-deployment.json",
  ),
  CREDITCOIN_DEPLOYMENT_MANIFEST: OptionalStringSchema.default(
    "./docs/deployments/creditcoin-deployment.json",
  ),
  CREDITCOIN_START_BLOCK: OptionalNonNegativeIntegerSchema,
  WORKER_DATABASE_PATH: z.string().trim().min(1).optional(),
  WORKER_START_BLOCK: OptionalNonNegativeIntegerSchema,
  WORKER_CONFIRMATIONS: NonNegativeIntegerSchema.optional().default(2),
  WORKER_POLL_INTERVAL_MS: PollIntervalSchema.optional().default(15_000),
});

export interface WorkerConfig {
  sourceChainRpcUrl: string;
  creditcoinRpcUrl: string;
  proofBuilderUrl: string;
  sourceChainKey: number;
  sourceEscrowAddress: string;
  tradeEvidenceUscAddress: string;
  creditcoinWalletPrivateKey: string;
  workerDatabasePath: string;
  creditcoinStartBlock: number | null;
  workerStartBlock: number | null;
  workerConfirmations: number;
  workerPollIntervalMs: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function defaultWorkerDatabasePath(
  env: { WORKER_DATABASE_PATH?: string | undefined } = process.env,
): string {
  const configured = env.WORKER_DATABASE_PATH?.trim();
  if (!configured) return resolve(homedir(), ".loomcredit", "worker.sqlite");
  return isAbsolute(configured)
    ? configured
    : resolve(workspaceRoot, configured);
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map(
      (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
    )
    .join("; ");
}

function resolveDeploymentAddress(
  explicitAddress: string | undefined,
  manifestPath: string,
  contractName: string,
  environmentName: string,
): string {
  if (explicitAddress) return explicitAddress;

  let manifest: unknown;
  const manifestCandidates = isAbsolute(manifestPath)
    ? [manifestPath]
    : [
        resolve(process.cwd(), manifestPath),
        resolve(workspaceRoot, manifestPath),
      ];
  for (const candidate of manifestCandidates) {
    try {
      manifest = JSON.parse(readFileSync(candidate, "utf8"));
      break;
    } catch {
      // Try the workspace-root fallback when package managers change cwd.
    }
  }
  if (!manifest) {
    throw new ConfigError(
      `${environmentName} is missing; provide ${environmentName} or a readable ${manifestPath}`,
    );
  }

  const address = (
    manifest as { contracts?: Record<string, { address?: unknown }> }
  ).contracts?.[contractName]?.address;
  const parsed = AddressSchema.safeParse(address);
  if (!parsed.success) {
    throw new ConfigError(
      `${manifestPath} does not contain a valid contracts.${contractName}.address`,
    );
  }
  return parsed.data;
}

function resolveDeploymentStartBlock(manifestPath: string): number | null {
  const manifestCandidates = isAbsolute(manifestPath)
    ? [manifestPath]
    : [
        resolve(process.cwd(), manifestPath),
        resolve(workspaceRoot, manifestPath),
      ];
  for (const candidate of manifestCandidates) {
    try {
      const manifest = JSON.parse(readFileSync(candidate, "utf8")) as {
        contracts?: Record<string, { deploymentBlock?: unknown }>;
      };
      const blocks = Object.values(manifest.contracts ?? {})
        .map((contract) => contract.deploymentBlock)
        .filter(
          (block): block is number =>
            typeof block === "number" &&
            Number.isSafeInteger(block) &&
            block >= 0,
        );
      return blocks.length > 0 ? Math.min(...blocks) : null;
    } catch {
      // Try the workspace-root fallback when package managers change cwd.
    }
  }
  return null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = EnvironmentSchema.safeParse(env);
  if (!parsed.success) throw new ConfigError(formatIssues(parsed.error));

  const sourceEscrowAddress = resolveDeploymentAddress(
    parsed.data.SOURCE_ESCROW_ADDRESS,
    parsed.data.SOURCE_DEPLOYMENT_MANIFEST,
    "OrderGuaranteeEscrow",
    "SOURCE_ESCROW_ADDRESS",
  );
  const tradeEvidenceUscAddress = resolveDeploymentAddress(
    parsed.data.TRADE_EVIDENCE_USC_ADDRESS,
    parsed.data.CREDITCOIN_DEPLOYMENT_MANIFEST,
    "TradeEvidenceUSC",
    "TRADE_EVIDENCE_USC_ADDRESS",
  );
  const creditcoinStartBlock =
    parsed.data.CREDITCOIN_START_BLOCK ??
    resolveDeploymentStartBlock(parsed.data.CREDITCOIN_DEPLOYMENT_MANIFEST);

  return {
    sourceChainRpcUrl: parsed.data.SOURCE_CHAIN_RPC_URL,
    creditcoinRpcUrl: parsed.data.CREDITCOIN_RPC_URL,
    proofBuilderUrl: parsed.data.PROOF_BUILDER_URL,
    sourceChainKey: parsed.data.SOURCE_CHAIN_KEY,
    sourceEscrowAddress,
    tradeEvidenceUscAddress,
    creditcoinWalletPrivateKey: parsed.data.CREDITCOIN_WALLET_PRIVATE_KEY,
    workerDatabasePath: defaultWorkerDatabasePath(parsed.data),
    creditcoinStartBlock,
    workerStartBlock: parsed.data.WORKER_START_BLOCK ?? null,
    workerConfirmations: parsed.data.WORKER_CONFIRMATIONS,
    workerPollIntervalMs: parsed.data.WORKER_POLL_INTERVAL_MS,
  };
}

export function publicConfig(
  config: WorkerConfig,
): Record<string, string | number | boolean> {
  return {
    sourceChainRpcUrl: config.sourceChainRpcUrl,
    creditcoinRpcUrl: config.creditcoinRpcUrl,
    proofBuilderUrl: config.proofBuilderUrl,
    sourceChainKey: config.sourceChainKey,
    sourceEscrowAddress: config.sourceEscrowAddress,
    tradeEvidenceUscAddress: config.tradeEvidenceUscAddress,
    walletConfigured: true,
    workerDatabasePath: config.workerDatabasePath,
    creditcoinStartBlock: config.creditcoinStartBlock ?? "unset",
    workerStartBlock: config.workerStartBlock ?? "unset",
    workerConfirmations: config.workerConfirmations,
    workerPollIntervalMs: config.workerPollIntervalMs,
  };
}
