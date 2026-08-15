import { z } from "zod";

import { MODEL_VERSION, POLICY_VERSION, REASON_CODES } from "./policy";

export const Bytes32Schema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

const safeInteger = (field: string) =>
  z
    .number()
    .int()
    .refine(Number.isSafeInteger, {
      message: `${field} must be a JavaScript safe integer`,
    });

const positiveSafeInteger = (field: string) => safeInteger(field).positive();

const nonNegativeSafeInteger = (field: string) =>
  safeInteger(field).nonnegative();

export const EvidencePacketSchema = z.object({
  evidenceId: Bytes32Schema,
  orderId: Bytes32Schema,
  buyerIdentityCommitment: Bytes32Schema,
  supplierIdentityCommitment: Bytes32Schema,
  orderValueMinor: positiveSafeInteger("orderValueMinor"),
  guaranteeAmountMinor: positiveSafeInteger("guaranteeAmountMinor"),
  currency: z.string().min(1),
  tenorDays: nonNegativeSafeInteger("tenorDays"),
  facilityState: z.enum([
    "EVIDENCE_VERIFIED",
    "QUOTED",
    "RESERVED",
    "CANCELLED",
    "DISPUTED",
    "SETTLED",
    "EXPIRED",
    "REJECTED",
  ]),
  buyerSettlementCount: nonNegativeSafeInteger("buyerSettlementCount"),
  buyerDisputeCount: nonNegativeSafeInteger("buyerDisputeCount"),
  supplierSettlementCount: nonNegativeSafeInteger("supplierSettlementCount"),
  supplierCancellationCount: nonNegativeSafeInteger(
    "supplierCancellationCount",
  ),
  openBuyerExposureMinor: nonNegativeSafeInteger("openBuyerExposureMinor"),
  openSupplierExposureMinor: nonNegativeSafeInteger(
    "openSupplierExposureMinor",
  ),
  vaultTotalLiquidityMinor: nonNegativeSafeInteger("vaultTotalLiquidityMinor"),
  vaultAvailableLiquidityMinor: nonNegativeSafeInteger(
    "vaultAvailableLiquidityMinor",
  ),
  policyVersion: z.literal(POLICY_VERSION),
  sourceChain: z.literal("Ethereum Sepolia"),
  executionChain: z.literal("Creditcoin CC3 Testnet"),
  proofStatus: z.enum(["LIVE_VERIFIED", "LOCAL_FIXTURE", "PENDING", "FAILED"]),
});

export const FacilityQuoteSchema = z.object({
  decision: z.enum(["APPROVE", "REFER", "REJECT"]),
  advanceBps: safeInteger("advanceBps").min(0).max(10_000),
  feeBps: safeInteger("feeBps").min(0).max(10_000),
  expiresAt: positiveSafeInteger("expiresAt"),
  riskTier: z.enum(["A", "B", "C", "REFER"]),
  reasonCodes: z.array(z.enum(REASON_CODES)).min(1),
  evidenceIds: z.array(Bytes32Schema).min(1),
  policyVersion: z.literal(POLICY_VERSION),
  modelVersion: z.literal(MODEL_VERSION),
  signer: Bytes32Schema.optional(),
  nonce: nonNegativeSafeInteger("nonce").optional(),
});

export type EvidencePacket = z.infer<typeof EvidencePacketSchema>;
export type FacilityQuote = z.infer<typeof FacilityQuoteSchema>;
