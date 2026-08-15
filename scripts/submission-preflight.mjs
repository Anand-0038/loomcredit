import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Contract, JsonRpcProvider, Wallet } from "ethers";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

try {
  loadEnvFile(resolve(root, ".env"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const checks = [];

function add(id, status, message) {
  checks.push({ id, status, message });
}

function readJson(relativePath) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    add(relativePath, "BLOCKED", "file exists but is not valid JSON");
    return null;
  }
}

function isPdf(relativePath) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) return false;
  try {
    return readFileSync(path).subarray(0, 5).toString() === "%PDF-";
  } catch {
    return false;
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function hasAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function hasHash(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
}

function positiveBigInt(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed > 0n ? parsed : null;
}

function sameHex(left, right) {
  return (
    typeof left === "string" &&
    typeof right === "string" &&
    left.toLowerCase() === right.toLowerCase()
  );
}

function envPresent(name) {
  return Boolean(process.env[name]?.trim());
}

function normalizedSecret(name) {
  const value = process.env[name]?.trim();
  if (!value) return null;
  return value.replace(/^0x/i, "").toLowerCase();
}

function derivedAddress(name) {
  const secret = normalizedSecret(name);
  if (!secret) return null;
  try {
    return new Wallet(`0x${secret}`).address.toLowerCase();
  } catch {
    return null;
  }
}

function hasGitRemote() {
  try {
    return Boolean(
      execFileSync("git", ["config", "--get", "remote.origin.url"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
  } catch {
    return false;
  }
}

const sourceDeployment = readJson("docs/deployments/source-deployment.json");
const sourceOrder = readJson("docs/deployments/source-order.json");
const sourceContracts = sourceDeployment?.contracts;
if (
  isRecord(sourceContracts) &&
  hasAddress(sourceContracts.MockUSDC?.address) &&
  hasAddress(sourceContracts.OrderGuaranteeEscrow?.address) &&
  hasHash(sourceContracts.OrderGuaranteeEscrow?.deploymentTx)
) {
  add(
    "source-testnet",
    "PASS",
    "Sepolia deployment manifest has mined contract records",
  );
} else {
  add(
    "source-testnet",
    "BLOCKED",
    "Sepolia deployment manifest is missing or incomplete",
  );
}

if (
  isRecord(sourceOrder) &&
  sourceOrder.network === "sepolia" &&
  sourceOrder.chainId === 11155111 &&
  hasHash(sourceOrder.transactionHash) &&
  Number.isInteger(sourceOrder.blockNumber) &&
  Number.isInteger(sourceOrder.logIndex) &&
  hasAddress(sourceOrder.sourceEscrow) &&
  hasHash(sourceOrder.order?.orderId)
) {
  add(
    "source-event",
    "PASS",
    "Recorded OrderGuaranteed receipt has block, log, and decoded order data",
  );
} else {
  add(
    "source-event",
    "BLOCKED",
    "Recorded Sepolia OrderGuaranteed evidence is missing or incomplete",
  );
}

for (const name of [
  "SOURCE_CHAIN_RPC_URL",
  "CREDITCOIN_RPC_URL",
  "PROOF_BUILDER_URL",
  "SOURCE_CHAIN_KEY",
]) {
  if (!envPresent(name)) {
    add("worker-config", "BLOCKED", `${name} is not configured`);
    break;
  }
}
if (!checks.some((check) => check.id === "worker-config")) {
  add(
    "worker-config",
    "PASS",
    "Source RPC, CC3 RPC, proof builder, and chain key are configured",
  );
}

const creditcoinDeployment = readJson(
  "docs/deployments/creditcoin-deployment.json",
);
const requiredContracts = [
  "TradeEvidenceUSC",
  "FacilityRegistry",
  "RiskGuard",
  "SandboxCapitalVault",
];
if (
  requiredContracts.every((name) =>
    hasAddress(creditcoinDeployment?.contracts?.[name]?.address),
  )
) {
  add(
    "cc3-deployment",
    "PASS",
    "CC3 deployment manifest has all required contract addresses",
  );
} else {
  add(
    "cc3-deployment",
    "BLOCKED",
    "CC3 deployment manifest is absent or missing required contracts",
  );
}

const manifestRiskGuardAddress =
  creditcoinDeployment?.contracts?.RiskGuard?.address;
const configuredRiskGuardAddress =
  process.env.RISK_GUARD_ADDRESS?.trim() || manifestRiskGuardAddress;
const agentSignerAddress =
  process.env.CREDITCOIN_AGENT_SIGNER_ADDRESS?.trim() ||
  creditcoinDeployment?.agentSigner;
if (!hasAddress(manifestRiskGuardAddress)) {
  add(
    "riskguard-target",
    "BLOCKED",
    "The deployment manifest does not contain a valid RiskGuard contract address",
  );
  add(
    "agent-allowlist",
    "BLOCKED",
    "The RiskGuard target is invalid; the agent allowlist cannot be checked",
  );
} else if (!sameHex(configuredRiskGuardAddress, manifestRiskGuardAddress)) {
  add(
    "riskguard-target",
    "BLOCKED",
    "RISK_GUARD_ADDRESS does not match the deployed RiskGuard manifest address",
  );
  add(
    "agent-allowlist",
    "BLOCKED",
    "The configured RiskGuard target does not match the deployed contract",
  );
} else if (!envPresent("CREDITCOIN_RPC_URL")) {
  add(
    "riskguard-target",
    "BLOCKED",
    "CREDITCOIN_RPC_URL is required to verify the deployed RiskGuard bytecode",
  );
  add(
    "agent-allowlist",
    "BLOCKED",
    "CREDITCOIN_RPC_URL is required to verify the on-chain agent allowlist",
  );
} else {
  try {
    const provider = new JsonRpcProvider(process.env.CREDITCOIN_RPC_URL);
    const bytecode = await provider.getCode(configuredRiskGuardAddress);
    if (bytecode === "0x") {
      add(
        "riskguard-target",
        "BLOCKED",
        "Configured RiskGuard address has no deployed contract bytecode",
      );
      add(
        "agent-allowlist",
        "BLOCKED",
        "The agent allowlist cannot be checked because RiskGuard has no bytecode",
      );
    } else {
      add(
        "riskguard-target",
        "PASS",
        "Configured RiskGuard address matches the manifest and has deployed bytecode",
      );
      if (!hasAddress(agentSignerAddress)) {
        add(
          "agent-allowlist",
          "BLOCKED",
          "A valid agent signer address is required for the on-chain allowlist check",
        );
      } else {
        try {
          const riskGuard = new Contract(
            configuredRiskGuardAddress,
            ["function approvedSigners(address) view returns (bool)"],
            provider,
          );
          const approved = await riskGuard.approvedSigners(agentSignerAddress);
          add(
            "agent-allowlist",
            approved ? "PASS" : "BLOCKED",
            approved
              ? "The configured agent signer is allowlisted by RiskGuard"
              : "The configured agent signer is not allowlisted by RiskGuard",
          );
        } catch {
          add(
            "agent-allowlist",
            "BLOCKED",
            "Unable to read the RiskGuard agent allowlist from CC3",
          );
        }
      }
    }
  } catch {
    add(
      "riskguard-target",
      "BLOCKED",
      "Unable to verify RiskGuard bytecode from the configured CC3 RPC",
    );
    add(
      "agent-allowlist",
      "BLOCKED",
      "Unable to verify the RiskGuard agent allowlist from the configured CC3 RPC",
    );
  }
}

const orderValueMinor = positiveBigInt(sourceOrder?.order?.orderValue);
const sandboxLiquidityMinor = positiveBigInt(
  creditcoinDeployment?.sandboxLiquidityMinor,
);
if (orderValueMinor && sandboxLiquidityMinor) {
  const maxAdvanceBps = 4_000n;
  const maxBuyerConcentrationBps = 2_500n;
  const minimumLiquidity =
    (orderValueMinor * maxAdvanceBps + maxBuyerConcentrationBps - 1n) /
    maxBuyerConcentrationBps;
  if (sandboxLiquidityMinor >= minimumLiquidity) {
    add(
      "riskguard-capacity",
      "PASS",
      "Recorded sandbox liquidity supports the policy maximum for the demo order",
    );
  } else {
    add(
      "riskguard-capacity",
      "BLOCKED",
      `Recorded sandbox liquidity is below the ${minimumLiquidity.toString()} minor units required by the maximum advance and buyer concentration policy`,
    );
  }
} else {
  add(
    "riskguard-capacity",
    "BLOCKED",
    "Recorded order value and positive sandbox liquidity are required for the RiskGuard approval path",
  );
}

const evidence = readJson("docs/demo-evidence.json");
const evidenceStateIsValid =
  evidence?.creditcoin?.stateReadBack === "EVIDENCE_VERIFIED" ||
  (evidence?.creditcoin?.stateReadBack === "RESERVED" &&
    evidence?.agent?.status === "RISKGUARD_APPROVED" &&
    evidence?.agent?.signing?.submission?.status === "APPROVED");
if (
  isRecord(evidence) &&
  evidence.schemaVersion === 1 &&
  evidence.source?.chainId === 11155111 &&
  evidence.creditcoin?.chainId === 102031 &&
  evidence.source?.transactionHash === sourceOrder?.transactionHash &&
  sameHex(evidence.source?.escrowAddress, sourceOrder?.sourceEscrow) &&
  sameHex(evidence.source?.orderId, sourceOrder?.order?.orderId) &&
  sameHex(
    evidence.source?.escrowAddress,
    sourceDeployment?.contracts?.OrderGuaranteeEscrow?.address,
  ) &&
  sameHex(
    evidence.creditcoin?.tradeEvidenceAddress,
    creditcoinDeployment?.contracts?.TradeEvidenceUSC?.address,
  ) &&
  sameHex(
    evidence.creditcoin?.facilityRegistryAddress,
    creditcoinDeployment?.contracts?.FacilityRegistry?.address,
  ) &&
  sameHex(
    evidence.creditcoin?.riskGuardAddress,
    creditcoinDeployment?.contracts?.RiskGuard?.address,
  ) &&
  sameHex(
    evidence.creditcoin?.vaultAddress,
    creditcoinDeployment?.contracts?.SandboxCapitalVault?.address,
  ) &&
  hasHash(evidence.source?.transactionHash) &&
  hasHash(evidence.creditcoin?.verificationTransactionHash) &&
  hasHash(evidence.creditcoin?.evidenceId) &&
  evidenceStateIsValid &&
  evidence.worker?.stage === "VERIFIED" &&
  evidence.packet?.proofStatus === "LIVE_VERIFIED" &&
  sameHex(evidence.packet?.evidenceId, evidence.creditcoin?.evidenceId) &&
  sameHex(evidence.packet?.orderId, evidence.source?.orderId)
) {
  add(
    "live-evidence",
    "PASS",
    "Live evidence manifest contains source and CC3 receipts",
  );
} else {
  add(
    "live-evidence",
    "BLOCKED",
    "No independently generated CC3 verification manifest is present",
  );
}

try {
  const generatedAtCommit = evidence?.gitCommit;
  const currentCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  const worktreeIsDirty = Boolean(
    execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim(),
  );
  if (
    generatedAtCommit &&
    currentCommit &&
    generatedAtCommit !== currentCommit
  ) {
    add(
      "evidence-provenance",
      "WARN",
      `Recorded evidence was generated at ${generatedAtCommit.slice(0, 12)}; regenerate after the final release commit`,
    );
  } else if (worktreeIsDirty) {
    add(
      "evidence-provenance",
      "WARN",
      "Recorded evidence matches HEAD, but the worktree has uncommitted changes; regenerate after the final release commit",
    );
  } else {
    add(
      "evidence-provenance",
      "PASS",
      "Recorded evidence manifest matches the current Git commit",
    );
  }
} catch {
  add(
    "evidence-provenance",
    "WARN",
    "Unable to compare the evidence manifest with the current Git commit",
  );
}

const modelFields = ["MODEL_BASE_URL", "MODEL_NAME", "MODEL_API_KEY"];
const recordedAgentStatuses = new Set([
  "MODEL_QUOTE_VERIFIED",
  "SIGNED_QUOTE_VERIFIED",
  "RISKGUARD_APPROVED",
]);
if (recordedAgentStatuses.has(evidence?.agent?.status)) {
  add(
    "model",
    "PASS",
    `Recorded ${evidence.agent.status} artifact is bound to the LIVE_VERIFIED packet`,
  );
} else if (modelFields.every(envPresent)) {
  add(
    "model",
    "WARN",
    "Model provider configuration is present, but no model response artifact is recorded",
  );
} else {
  add(
    "model",
    "BLOCKED",
    "MODEL_BASE_URL, MODEL_NAME, and MODEL_API_KEY are required for a real quote",
  );
}

if (!envPresent("CREDITCOIN_AGENT_PRIVATE_KEY")) {
  add(
    "agent-signer",
    "BLOCKED",
    "CREDITCOIN_AGENT_PRIVATE_KEY is required for a separate signed quote path",
  );
} else {
  const privateKey = process.env.CREDITCOIN_AGENT_PRIVATE_KEY.trim();
  let derivedAgentSigner;
  try {
    const normalizedPrivateKey = /^0x/i.test(privateKey)
      ? privateKey
      : `0x${privateKey}`;
    derivedAgentSigner = new Wallet(normalizedPrivateKey).address;
  } catch {
    add(
      "agent-signer",
      "BLOCKED",
      "CREDITCOIN_AGENT_PRIVATE_KEY is not a valid 32-byte EVM private key",
    );
  }

  const configuredAgentSigner = process.env.CREDITCOIN_AGENT_SIGNER_ADDRESS;
  const manifestAgentSigner = creditcoinDeployment?.agentSigner;
  const expectedAgentSigner = configuredAgentSigner || manifestAgentSigner;
  if (!checks.some((check) => check.id === "agent-signer")) {
    if (!hasAddress(expectedAgentSigner)) {
      add(
        "agent-signer",
        "BLOCKED",
        "CREDITCOIN_AGENT_SIGNER_ADDRESS or the deployment manifest agentSigner is required",
      );
    } else if (
      derivedAgentSigner.toLowerCase() !== expectedAgentSigner.toLowerCase()
    ) {
      add(
        "agent-signer",
        "BLOCKED",
        "CREDITCOIN_AGENT_PRIVATE_KEY does not derive the configured allowlisted agent signer",
      );
    } else if (
      envPresent("CREDITCOIN_WALLET_PRIVATE_KEY") &&
      privateKey.replace(/^0x/i, "").toLowerCase() ===
        process.env.CREDITCOIN_WALLET_PRIVATE_KEY.replace(
          /^0x/i,
          "",
        ).toLowerCase()
    ) {
      add(
        "agent-signer",
        "WARN",
        "Agent and worker keys are identical; use a separate signer before a serious deployment",
      );
    } else {
      add(
        "agent-signer",
        "PASS",
        "A separate allowlisted agent signer is configured",
      );
    }
  }
}

const roleKeyNames = [
  "SOURCE_OPERATOR_PRIVATE_KEY",
  "CREDITCOIN_DEPLOYER_PRIVATE_KEY",
  "CREDITCOIN_WALLET_PRIVATE_KEY",
  "CREDITCOIN_AGENT_PRIVATE_KEY",
];
const configuredRoleAddresses = roleKeyNames
  .map((name) => ({ name, address: derivedAddress(name) }))
  .filter((entry) => entry.address !== null);
const duplicateRoleIdentities = [];
for (let index = 0; index < configuredRoleAddresses.length; index += 1) {
  for (let next = index + 1; next < configuredRoleAddresses.length; next += 1) {
    if (
      configuredRoleAddresses[index].address ===
      configuredRoleAddresses[next].address
    ) {
      duplicateRoleIdentities.push(
        configuredRoleAddresses[index].name +
          "=" +
          configuredRoleAddresses[next].name,
      );
    }
  }
}
if (duplicateRoleIdentities.length > 0) {
  add(
    "key-separation",
    "BLOCKED",
    "Configured testnet roles resolve to duplicate identities (" +
      duplicateRoleIdentities.join(", ") +
      "); use distinct source, deployer, worker, and agent identities before a serious deployment",
  );
} else if (configuredRoleAddresses.length === roleKeyNames.length) {
  add(
    "key-separation",
    "PASS",
    "Source, deployer, worker, and agent identities are configured distinctly",
  );
} else {
  add(
    "key-separation",
    "WARN",
    "The four-role key separation check is incomplete; configure distinct source, deployer, worker, and agent identities before a serious deployment",
  );
}

if (isPdf("docs/whitepaper.pdf")) {
  add("whitepaper-pdf", "PASS", "Whitepaper PDF exists in the repository");
} else {
  add(
    "whitepaper-pdf",
    "BLOCKED",
    "Generate docs/whitepaper.pdf before publishing the submission",
  );
}

for (const relativePath of [
  "README.md",
  "docs/whitepaper.md",
  "docs/environment-verification.md",
  "docs/ai-underwriting-boundary.md",
  "docs/live-deployment.md",
  "docs/demo-runbook.md",
]) {
  if (!existsSync(resolve(root, relativePath))) {
    add("technical-docs", "BLOCKED", `${relativePath} is missing`);
  }
}
if (!checks.some((check) => check.id === "technical-docs")) {
  add(
    "technical-docs",
    "PASS",
    "README, whitepaper, environment, AI, and deployment docs exist",
  );
}

const legalPages = [
  "web/app/legal/page.tsx",
  "web/app/privacy/page.tsx",
  "web/app/terms/page.tsx",
  "web/app/cookies/page.tsx",
  "docs/legal-readiness.md",
];
const missingLegalPages = legalPages.filter(
  (relativePath) => !existsSync(resolve(root, relativePath)),
);
if (missingLegalPages.length > 0) {
  add(
    "legal-pages",
    "BLOCKED",
    `Required legal pages are missing: ${missingLegalPages.join(", ")}`,
  );
} else {
  add(
    "legal-pages",
    "PASS",
    "Legal center, privacy, terms, cookie, and readiness pages exist",
  );
}

const legalContact = process.env.LEGAL_CONTACT_EMAIL?.trim() ?? "";
const legalEffectiveDate = process.env.LEGAL_EFFECTIVE_DATE?.trim() ?? "";
const legalDateIsValid = (() => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(legalEffectiveDate)) return false;
  const parsed = new Date(`${legalEffectiveDate}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === legalEffectiveDate
  );
})();
const missingLegalConfig = [
  "LEGAL_ENTITY_NAME",
  "LEGAL_CONTACT_EMAIL",
  "LEGAL_ENTITY_ADDRESS",
  "LEGAL_GOVERNING_LAW",
].filter((name) => !envPresent(name));
if (legalContact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(legalContact)) {
  missingLegalConfig.push("LEGAL_CONTACT_EMAIL (valid email)");
}
if (!legalDateIsValid) {
  missingLegalConfig.push("LEGAL_EFFECTIVE_DATE (YYYY-MM-DD)");
}
if (missingLegalConfig.length > 0) {
  add(
    "legal-config",
    "BLOCKED",
    `Public legal metadata is incomplete: ${missingLegalConfig.join(", ")}`,
  );
} else {
  add(
    "legal-config",
    "PASS",
    "Legal entity, contact, address, governing law, and effective date are configured",
  );
}

if (hasGitRemote()) {
  add("github", "PASS", "Git has an origin remote configured");
} else {
  add("github", "BLOCKED", "No public GitHub origin is configured");
}

const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "";
const hasPublicSiteUrl = (() => {
  try {
    const parsed = new URL(configuredSiteUrl);
    return (
      parsed.protocol === "https:" &&
      !["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname) &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
})();
if (hasPublicSiteUrl) {
  add("demo-url", "PASS", "A non-local demo URL is configured");
} else {
  add(
    "demo-url",
    "BLOCKED",
    "Configure and verify a public HTTPS demo URL before submission",
  );
}

if (envPresent("DEMO_VIDEO_URL")) {
  add("video", "PASS", "A demo video URL is configured");
} else {
  add("video", "BLOCKED", "Record and publish the prototype demo video");
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ checks }, null, 2));
} else {
  console.log("LoomCredit submission preflight");
  console.log("===============================");
  for (const check of checks) {
    console.log(`[${check.status}] ${check.id}: ${check.message}`);
  }
  const blocked = checks.filter((check) => check.status === "BLOCKED").length;
  const warnings = checks.filter((check) => check.status === "WARN").length;
  console.log(
    `\n${checks.length} checks: ${blocked} blocked, ${warnings} warnings`,
  );
  console.log(
    blocked === 0
      ? "Local submission gates are clear; verify all public links and live receipts manually."
      : "Submission is not complete. Resolve the blocked external gates; do not relabel local fixtures as live evidence.",
  );
}

process.exitCode = checks.some((check) => check.status === "BLOCKED") ? 1 : 0;
