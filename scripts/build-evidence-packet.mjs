import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { Contract, Interface } from "ethers";

import {
  closeProvider,
  createProvider,
  loadManifest,
  manifestAddress,
  optionalEnv,
  workspaceRoot,
} from "./deployment-utils.mjs";

const CREDITCOIN_CHAIN_ID = 102031;
const STATE_NAMES = [
  "NONE",
  "EVIDENCE_VERIFIED",
  "QUOTED",
  "RESERVED",
  "CANCELLED",
  "DISPUTED",
  "SETTLED",
  "EXPIRED",
  "REJECTED",
];
const REGISTRY_ABI = [
  "function getEvidence(bytes32 orderId) view returns (bytes32 evidenceId,bytes32 orderId,bytes32 orderFingerprint,address buyer,address supplier,address settlementToken,uint128 orderValue,uint128 guaranteeAmount,uint64 deliveryDeadline,bytes32 termsCommitment,bytes32 buyerIdentityCommitment,bytes32 supplierIdentityCommitment,bytes32 sourceQueryKey,uint64 verifiedAt,uint8 state)",
  "function buyerReservedExposure(address buyer) view returns (uint256)",
  "function supplierReservedExposure(address supplier) view returns (uint256)",
];
const EVIDENCE_ABI = [
  "event OrderEvidenceVerified(bytes32 indexed evidenceId,bytes32 indexed orderId,bytes32 queryKey)",
];
const evidenceInterface = new Interface(EVIDENCE_ABI);
const VAULT_ABI = [
  "function totalLiquidity() view returns (uint256)",
  "function availableLiquidity() view returns (uint256)",
];

function workerDatabasePath() {
  const configured = optionalEnv("WORKER_DATABASE_PATH") ?? "./data/worker.db";
  return resolve(workspaceRoot, configured);
}

function requireSafeNumber(value, field) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(
      `EVIDENCE_INVALID: ${field} exceeds the packet number range`,
    );
  }
  return number;
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
        "SELECT source_tx_hash, order_id, stage, evidence_id, creditcoin_tx_hash, block_height FROM cross_chain_events WHERE source_tx_hash = ?",
      )
      .get(sourceTxHash);
    if (!row)
      throw new Error(
        `EVIDENCE_INVALID: worker has no row for ${sourceTxHash}`,
      );
    if (row.stage !== "VERIFIED" || typeof row.evidence_id !== "string") {
      throw new Error(
        `EVIDENCE_INVALID: worker row is ${String(row.stage)}; only VERIFIED rows can produce a packet`,
      );
    }
    if (typeof row.creditcoin_tx_hash !== "string") {
      throw new Error(
        "EVIDENCE_INVALID: verified row has no Creditcoin transaction hash",
      );
    }
    return {
      sourceTxHash: String(row.source_tx_hash),
      orderId: String(row.order_id),
      evidenceId: String(row.evidence_id),
      creditcoinTxHash: String(row.creditcoin_tx_hash),
    };
  } finally {
    database.close();
  }
}

async function main() {
  const packetOnly = process.argv.includes("--packet-only");
  const sourceManifest = await loadManifest(
    "docs/deployments/source-order.json",
  );
  const creditcoinManifest = await loadManifest(
    "docs/deployments/creditcoin-deployment.json",
  );
  const sourceTxHash = sourceManifest.transactionHash;
  if (typeof sourceTxHash !== "string") {
    throw new Error(
      "EVIDENCE_INVALID: source order manifest has no transaction hash",
    );
  }
  const workerEvent = readVerifiedWorkerEvent(sourceTxHash);
  if (
    workerEvent.orderId.toLowerCase() !==
    sourceManifest.order.orderId.toLowerCase()
  ) {
    throw new Error(
      "EVIDENCE_INVALID: worker order ID does not match source manifest",
    );
  }
  const registryAddress = manifestAddress(
    creditcoinManifest,
    "FacilityRegistry",
    "docs/deployments/creditcoin-deployment.json",
  );
  const vaultAddress = manifestAddress(
    creditcoinManifest,
    "SandboxCapitalVault",
    "docs/deployments/creditcoin-deployment.json",
  );
  const tradeEvidenceAddress = manifestAddress(
    creditcoinManifest,
    "TradeEvidenceUSC",
    "docs/deployments/creditcoin-deployment.json",
  );
  const provider = await createProvider(
    "CREDITCOIN_RPC_URL",
    CREDITCOIN_CHAIN_ID,
    "Creditcoin CC3 testnet",
  );
  try {
    const registry = new Contract(registryAddress, REGISTRY_ABI, provider);
    const vault = new Contract(vaultAddress, VAULT_ABI, provider);
    const verificationReceipt = await provider.getTransactionReceipt(
      workerEvent.creditcoinTxHash,
    );
    if (!verificationReceipt || verificationReceipt.status !== 1) {
      throw new Error(
        "EVIDENCE_INVALID: worker transaction hash has no successful Creditcoin receipt",
      );
    }
    if (
      !verificationReceipt.to ||
      verificationReceipt.to.toLowerCase() !==
        tradeEvidenceAddress.toLowerCase()
    ) {
      throw new Error(
        "EVIDENCE_INVALID: worker transaction was not sent to TradeEvidenceUSC",
      );
    }
    const evidenceLog = verificationReceipt.logs
      .filter(
        (log) =>
          log.address.toLowerCase() === tradeEvidenceAddress.toLowerCase(),
      )
      .map((log) => {
        try {
          return evidenceInterface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "OrderEvidenceVerified");
    if (
      !evidenceLog ||
      String(evidenceLog.args[0]).toLowerCase() !==
        workerEvent.evidenceId.toLowerCase() ||
      String(evidenceLog.args[1]).toLowerCase() !==
        sourceManifest.order.orderId.toLowerCase()
    ) {
      throw new Error(
        "EVIDENCE_INVALID: Creditcoin receipt does not contain the expected evidence event",
      );
    }
    const evidence = await registry.getEvidence(sourceManifest.order.orderId);
    if (
      String(evidence.evidenceId).toLowerCase() !==
      workerEvent.evidenceId.toLowerCase()
    ) {
      throw new Error(
        "EVIDENCE_INVALID: worker evidence ID does not match registry state",
      );
    }
    if (
      String(evidence.orderId).toLowerCase() !==
      sourceManifest.order.orderId.toLowerCase()
    ) {
      throw new Error(
        "EVIDENCE_INVALID: registry order ID does not match source manifest",
      );
    }
    const state = STATE_NAMES[Number(evidence.state)];
    if (!state || state === "NONE") {
      throw new Error(
        "EVIDENCE_INVALID: registry returned an unknown facility state",
      );
    }
    const now = Math.floor(Date.now() / 1000);
    const deliveryDeadline = requireSafeNumber(
      evidence.deliveryDeadline,
      "deliveryDeadline",
    );
    const packet = {
      evidenceId: String(evidence.evidenceId),
      orderId: String(evidence.orderId),
      buyerIdentityCommitment: String(evidence.buyerIdentityCommitment),
      supplierIdentityCommitment: String(evidence.supplierIdentityCommitment),
      orderValueMinor: requireSafeNumber(evidence.orderValue, "orderValue"),
      guaranteeAmountMinor: requireSafeNumber(
        evidence.guaranteeAmount,
        "guaranteeAmount",
      ),
      currency: "TEST_USD",
      tenorDays: Math.max(0, Math.ceil((deliveryDeadline - now) / 86_400)),
      facilityState: state,
      buyerSettlementCount: 0,
      buyerDisputeCount: 0,
      supplierSettlementCount: 0,
      supplierCancellationCount: 0,
      openBuyerExposureMinor: requireSafeNumber(
        await registry.buyerReservedExposure(evidence.buyer),
        "buyerReservedExposure",
      ),
      openSupplierExposureMinor: requireSafeNumber(
        await registry.supplierReservedExposure(evidence.supplier),
        "supplierReservedExposure",
      ),
      vaultTotalLiquidityMinor: requireSafeNumber(
        await vault.totalLiquidity(),
        "totalLiquidity",
      ),
      vaultAvailableLiquidityMinor: requireSafeNumber(
        await vault.availableLiquidity(),
        "availableLiquidity",
      ),
      policyVersion: "2026-08-demo-v1",
      sourceChain: "Ethereum Sepolia",
      executionChain: "Creditcoin CC3 Testnet",
      proofStatus: "LIVE_VERIFIED",
    };

    console.log(
      JSON.stringify(
        packetOnly
          ? packet
          : {
              boundary: "LIVE_EVIDENCE_PACKET",
              packet,
              source: {
                transactionHash: sourceTxHash,
                blockNumber: sourceManifest.blockNumber,
                logIndex: sourceManifest.logIndex,
                escrow: sourceManifest.sourceEscrow,
              },
              creditcoin: {
                verificationTransactionHash: workerEvent.creditcoinTxHash,
                registry: registryAddress,
                vault: vaultAddress,
                tradeEvidence: tradeEvidenceAddress,
                evidenceId: workerEvent.evidenceId,
              },
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
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
