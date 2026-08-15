import sourceDeployment from "../../docs/deployments/source-deployment.json";
import sourceOrder from "../../docs/deployments/source-order.json";

const sourceEscrow = sourceDeployment.contracts.OrderGuaranteeEscrow;

const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * JSON deployment manifests store uint values as decimal strings. Convert only
 * exact, non-negative integers that remain representable in JavaScript; a
 * rounded amount must stop the page rather than silently become false evidence.
 */
export function parseSafeMinorUnits(value: unknown, field: string): number {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "bigint"
  ) {
    throw new Error(`SOURCE_EVIDENCE_INVALID: ${field} is not an integer`);
  }

  const raw = String(value);
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `SOURCE_EVIDENCE_INVALID: ${field} is not a non-negative integer`,
    );
  }

  const parsed = BigInt(raw);
  if (parsed > MAX_SAFE_INTEGER) {
    throw new Error(
      `SOURCE_EVIDENCE_INVALID: ${field} exceeds JavaScript safe integer precision`,
    );
  }

  return Number(parsed);
}

/**
 * Public source-side evidence recorded by the deployment scripts. This is
 * intentionally separate from the worker feed: it proves that the source
 * receipt exists, not that CC3 has accepted a USC proof.
 */
export const sourceTestnetEvidence = {
  network: "Ethereum Sepolia",
  chainId: sourceOrder.chainId,
  escrowAddress: sourceEscrow.address,
  escrowExplorer: sourceEscrow.explorer,
  transactionHash: sourceOrder.transactionHash,
  transactionExplorer: sourceOrder.explorer,
  blockNumber: sourceOrder.blockNumber,
  logIndex: sourceOrder.logIndex,
  orderId: sourceOrder.order.orderId,
  orderValueMinor: parseSafeMinorUnits(
    sourceOrder.order.orderValue,
    "orderValue",
  ),
  guaranteeAmountMinor: parseSafeMinorUnits(
    sourceOrder.order.guaranteeAmount,
    "guaranteeAmount",
  ),
  verifiedAt: sourceOrder.generatedAt.slice(0, 10),
};

export function formatSourceMinorUnits(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value / 1_000_000);
}
