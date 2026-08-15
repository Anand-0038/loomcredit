import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import {
  gitCommit,
  loadManifest,
  manifestAddress,
  optionalEnv,
  workspaceRoot,
} from "./deployment-utils.mjs";
import {
  readAgentArtifact,
  summarizeAgentArtifact,
} from "./agent-evidence.mjs";

const SOURCE_MANIFEST = "docs/deployments/source-order.json";
const CREDITCOIN_MANIFEST = "docs/deployments/creditcoin-deployment.json";
const OUTPUT_JSON = "docs/demo-evidence.json";
const OUTPUT_MARKDOWN = "docs/demo-evidence.md";

function agentQuotePath() {
  const argumentIndex = process.argv.indexOf("--agent-quote");
  if (argumentIndex >= 0) {
    const path = process.argv[argumentIndex + 1];
    if (!path || path.startsWith("--")) {
      throw new Error(
        "USAGE_ERROR: --agent-quote requires the JSON output from agent quote",
      );
    }
    return path;
  }
  return optionalEnv("AGENT_QUOTE_PATH");
}

function workerDatabasePath() {
  const configured = optionalEnv("WORKER_DATABASE_PATH") ?? "./data/worker.db";
  return isAbsolute(configured)
    ? configured
    : resolve(workspaceRoot, configured);
}

function readVerifiedWorkerEvent(sourceTxHash) {
  const databasePath = workerDatabasePath();
  if (!existsSync(databasePath)) {
    throw new Error(
      `EVIDENCE_INVALID: worker database is missing at ${databasePath}`,
    );
  }
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = database
      .prepare(
        `SELECT source_tx_hash, order_id, stage, retry_count, evidence_id,
                creditcoin_tx_hash, block_height, tx_index, log_index,
                stage_timestamps
           FROM cross_chain_events
          WHERE source_tx_hash = ?`,
      )
      .get(sourceTxHash);
    if (!row)
      throw new Error(
        `EVIDENCE_INVALID: worker has no row for ${sourceTxHash}`,
      );
    if (row.stage !== "VERIFIED" || typeof row.evidence_id !== "string") {
      throw new Error(
        `EVIDENCE_INVALID: worker row is ${String(row.stage)}; only VERIFIED rows can produce a manifest`,
      );
    }
    if (typeof row.creditcoin_tx_hash !== "string") {
      throw new Error(
        "EVIDENCE_INVALID: verified worker row has no Creditcoin transaction hash",
      );
    }
    let stageTimestamps;
    try {
      stageTimestamps = JSON.parse(String(row.stage_timestamps));
    } catch {
      throw new Error(
        "EVIDENCE_INVALID: worker stage timestamps are not valid JSON",
      );
    }
    return {
      sourceTxHash: String(row.source_tx_hash),
      orderId: String(row.order_id),
      retryCount: Number(row.retry_count),
      evidenceId: String(row.evidence_id),
      creditcoinTxHash: String(row.creditcoin_tx_hash),
      blockHeight: Number(row.block_height),
      txIndex: Number(row.tx_index),
      receiptLogIndex: Number(row.log_index),
      stageTimestamps,
    };
  } finally {
    database.close();
  }
}

function durationMs(start, end) {
  if (typeof start !== "string" || typeof end !== "string") return null;
  const duration = Date.parse(end) - Date.parse(start);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function readLivePacket() {
  const output = execFileSync(
    process.execPath,
    ["scripts/build-evidence-packet.mjs", "--packet-only"],
    { cwd: workspaceRoot, encoding: "utf8" },
  );
  return JSON.parse(output);
}

function validateSignedAgentArtifact(path, summary) {
  if (summary.signing.status !== "SIGNED") return summary;
  try {
    const output = execFileSync(
      process.execPath,
      ["scripts/submit-quote.mjs", path, "--dry-run"],
      {
        cwd: workspaceRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const validation = JSON.parse(output);
    if (
      validation.status !== "VALIDATED" ||
      validation.mutation !== "NONE" ||
      validation.orderId?.toLowerCase() !== summary.orderId.toLowerCase() ||
      validation.evidenceId?.toLowerCase() !==
        summary.evidenceId.toLowerCase() ||
      validation.signer?.toLowerCase() !== summary.signing.signer.toLowerCase()
    ) {
      throw new Error("dry-run output did not match the bound quote");
    }
  } catch {
    throw new Error(
      "EVIDENCE_INVALID: signed agent artifact failed the mutation-free EIP-712 dry-run",
    );
  }
  return {
    ...summary,
    status: "SIGNED_QUOTE_VERIFIED",
    boundary: "LIVE_SIGNED_QUOTE",
    signing: { ...summary.signing, validation: "EIP712_DRY_RUN" },
  };
}

function explorer(base, hash) {
  return `${base}/tx/${hash}`;
}

function markdown(manifest) {
  const source = manifest.source;
  const creditcoin = manifest.creditcoin;
  const timings = manifest.timings;
  const stageRows = Object.entries(manifest.worker.stageTimestamps)
    .map(([stage, timestamp]) => `| ${stage} | ${timestamp} |`)
    .join("\n");

  const agentStatus = manifest.agent.status;
  const agentBoundary =
    agentStatus === "SIGNED_QUOTE_VERIFIED"
      ? "A signed model quote artifact was validated against the same live evidence packet. No RiskGuard transaction is claimed until a separate submit command returns a receipt."
      : agentStatus === "MODEL_QUOTE_VERIFIED"
        ? "A real model response was validated against the same live evidence packet. It is an unsigned proposal; no signer or RiskGuard transaction is claimed."
        : "The real model quote path was not run for this evidence bundle. The bundle records source and USC verification only; no model quote, signature, or RiskGuard transaction is claimed here. Run the separate agent command against a fresh LIVE_VERIFIED packet when the dedicated signer boundary is configured.";

  return `# LoomCredit live demo evidence

Generated from the persisted worker row and independent CC3 state reads on ${manifest.generatedAt}.

This is a **testnet evidence bundle**, not proof of production lending, physical delivery, repayment capacity, or custody.

## Cross-chain result

| Boundary | Result |
| --- | --- |
| Source | [Sepolia OrderGuaranteed transaction](${source.explorer}) |
| Attestation/proof | Worker retrieved the proof for source block ${source.blockNumber}, transaction ${source.txIndex}, receipt log ${source.receiptLogIndex} |
| Creditcoin | [CC3 verification transaction](${creditcoin.verificationTransactionExplorer}) |
| Evidence ID | \`${creditcoin.evidenceId}\` |
| Facility state | \`${manifest.packet.facilityState}\` |
| Worker stage | \`${manifest.worker.stage}\` |

## Public deployment addresses

- TradeEvidenceUSC: [${creditcoin.tradeEvidenceAddress}](${creditcoin.tradeEvidenceExplorer})
- FacilityRegistry: [${creditcoin.facilityRegistryAddress}](${creditcoin.facilityRegistryExplorer})
- RiskGuard: [${creditcoin.riskGuardAddress}](${creditcoin.riskGuardExplorer})
- SandboxCapitalVault: [${creditcoin.vaultAddress}](${creditcoin.vaultExplorer})

## Recorded order

- Order ID: \`${source.orderId}\`
- Order value: ${manifest.packet.orderValueMinor} minor units
- Buyer guarantee: ${manifest.packet.guaranteeAmountMinor} minor units
- Source escrow: \`${source.escrowAddress}\`
- Source chain key: \`${manifest.attestcoin.sourceChainKey}\`
- Receipt-local log index used by USC: \`${source.receiptLogIndex}\`
- Block-wide explorer log index: \`${source.blockLogIndex}\`

## Worker timings

| Stage | Timestamp |
| --- | --- |
${stageRows}

| Measurement | Duration |
| --- | ---: |
| Attestation wait boundary | ${timings.attestationWaitMs ?? "not recorded"} ms |
| Proof generation | ${timings.proofGenerationMs ?? "not recorded"} ms |
| CC3 submission and mining | ${timings.creditcoinSubmissionMs ?? "not recorded"} ms |
| Final attempt from attestation wait to verification | ${timings.finalAttemptMs ?? "not recorded"} ms |
| Total observed worker run | ${timings.totalMs ?? "not recorded"} ms |

The worker retried ${manifest.worker.retryCount} time(s) before the final verified state; failed submissions are retained in its audit timestamps.

## AI boundary

${agentBoundary}

Generated at Git commit \`${manifest.gitCommit ?? "unknown"}\`.
`;
}

async function main() {
  const source = await loadManifest(SOURCE_MANIFEST);
  const creditcoin = await loadManifest(CREDITCOIN_MANIFEST);
  const packet = readLivePacket();
  const sourceTxHash = String(source.transactionHash);
  const worker = readVerifiedWorkerEvent(sourceTxHash);

  if (
    worker.orderId.toLowerCase() !== String(source.order.orderId).toLowerCase()
  ) {
    throw new Error(
      "EVIDENCE_INVALID: worker and source order IDs do not match",
    );
  }

  const agentPath = agentQuotePath();
  const agentSummary = agentPath
    ? validateSignedAgentArtifact(
        agentPath,
        summarizeAgentArtifact(readAgentArtifact(agentPath), packet),
      )
    : null;
  if (
    worker.evidenceId.toLowerCase() !== String(packet.evidenceId).toLowerCase()
  ) {
    throw new Error(
      "EVIDENCE_INVALID: packet and worker evidence IDs do not match",
    );
  }

  const stages = worker.stageTimestamps;
  const tradeEvidenceAddress = manifestAddress(
    creditcoin,
    "TradeEvidenceUSC",
    CREDITCOIN_MANIFEST,
  );
  const facilityRegistryAddress = manifestAddress(
    creditcoin,
    "FacilityRegistry",
    CREDITCOIN_MANIFEST,
  );
  const riskGuardAddress = manifestAddress(
    creditcoin,
    "RiskGuard",
    CREDITCOIN_MANIFEST,
  );
  const vaultAddress = manifestAddress(
    creditcoin,
    "SandboxCapitalVault",
    CREDITCOIN_MANIFEST,
  );
  const sourceExplorer = "https://sepolia.etherscan.io";
  const creditcoinExplorer = "https://creditcoin-testnet.blockscout.com";
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    gitCommit: gitCommit(),
    source: {
      network: "Sepolia",
      chainId: source.chainId,
      escrowAddress: source.sourceEscrow,
      transactionHash: sourceTxHash,
      explorer: source.explorer,
      blockNumber: source.blockNumber,
      txIndex: worker.txIndex,
      receiptLogIndex: worker.receiptLogIndex,
      blockLogIndex: source.blockLogIndex ?? null,
      orderId: source.order.orderId,
    },
    attestcoin: {
      sourceChainKey: creditcoin.source.chainKey,
      proofBuilder: optionalEnv("PROOF_BUILDER_URL") ?? null,
      proofRetrieved: true,
      proofReadyAt: stages.PROOF_READY ?? null,
      stageBoundary:
        "worker proof response; native verification is recorded below",
    },
    creditcoin: {
      network: "CC3",
      chainId: creditcoin.chainId,
      tradeEvidenceAddress,
      tradeEvidenceExplorer: `${creditcoinExplorer}/address/${tradeEvidenceAddress}`,
      facilityRegistryAddress,
      facilityRegistryExplorer: `${creditcoinExplorer}/address/${facilityRegistryAddress}`,
      riskGuardAddress,
      riskGuardExplorer: `${creditcoinExplorer}/address/${riskGuardAddress}`,
      vaultAddress,
      vaultExplorer: `${creditcoinExplorer}/address/${vaultAddress}`,
      verificationTransactionHash: worker.creditcoinTxHash,
      verificationTransactionExplorer: explorer(
        creditcoinExplorer,
        worker.creditcoinTxHash,
      ),
      evidenceId: worker.evidenceId,
      stateReadBack: packet.facilityState,
    },
    worker: {
      stage: "VERIFIED",
      retryCount: worker.retryCount,
      stageTimestamps: stages,
      sourceBlock: worker.blockHeight,
      sourceTxIndex: worker.txIndex,
      sourceReceiptLogIndex: worker.receiptLogIndex,
    },
    timings: {
      attestationWaitMs: durationMs(
        stages.WAITING_FOR_ATTESTATION,
        stages.PROOF_REQUESTED,
      ),
      proofGenerationMs: durationMs(stages.PROOF_REQUESTED, stages.PROOF_READY),
      creditcoinSubmissionMs: durationMs(
        stages.PROOF_READY,
        stages.CREDITCOIN_SUBMITTED,
      ),
      verificationMs: durationMs(stages.CREDITCOIN_SUBMITTED, stages.VERIFIED),
      finalAttemptMs: durationMs(
        stages.WAITING_FOR_ATTESTATION,
        stages.VERIFIED,
      ),
      totalMs: durationMs(stages.DETECTED, stages.VERIFIED),
    },
    packet,
    agent: agentSummary
      ? {
          ...agentSummary,
          provider: optionalEnv("MODEL_BASE_URL") ?? null,
          model: optionalEnv("MODEL_NAME") ?? null,
        }
      : {
          status: "NOT_RUN",
          provider: optionalEnv("MODEL_BASE_URL") ?? null,
          model: optionalEnv("MODEL_NAME") ?? null,
          modelVersion: null,
          policyVersion: packet.policyVersion,
          decision: "REFER",
          advanceBps: 0,
        },
  };

  mkdirSync(resolve(workspaceRoot, "docs"), { recursive: true });
  writeFileSync(
    resolve(workspaceRoot, OUTPUT_JSON),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    resolve(workspaceRoot, OUTPUT_MARKDOWN),
    markdown(manifest),
    "utf8",
  );
  console.log(JSON.stringify(manifest, null, 2));
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
