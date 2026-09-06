import { z } from "zod";

import { MODEL_VERSION, POLICY, POLICY_VERSION, REASON_CODES } from "./policy";

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

export const EvidencePacketSchema = z
  .object({
    evidenceId: Bytes32Schema,
    orderId: Bytes32Schema,
    buyerIdentityCommitment: Bytes32Schema,
    supplierIdentityCommitment: Bytes32Schema,
    orderValueMinor: positiveSafeInteger("orderValueMinor"),
    guaranteeAmountMinor: positiveSafeInteger("guaranteeAmountMinor"),
    currency: z.string().min(1),
    deliveryDeadline: positiveSafeInteger("deliveryDeadline"),
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
    vaultTotalLiquidityMinor: nonNegativeSafeInteger(
      "vaultTotalLiquidityMinor",
    ),
    vaultAvailableLiquidityMinor: nonNegativeSafeInteger(
      "vaultAvailableLiquidityMinor",
    ),
    policyVersion: z.literal(POLICY_VERSION),
    sourceChain: z.literal("Ethereum Sepolia"),
    executionChain: z.literal("Creditcoin CC3 Testnet"),
    proofStatus: z.enum([
      "LIVE_VERIFIED",
      "LOCAL_FIXTURE",
      "PENDING",
      "FAILED",
    ]),
  })
  .strict()
  .superRefine((packet, context) => {
    if (packet.guaranteeAmountMinor > packet.orderValueMinor) {
      context.addIssue({
        code: "custom",
        path: ["guaranteeAmountMinor"],
        message: "guaranteeAmountMinor must not exceed orderValueMinor",
      });
    }
    if (packet.vaultAvailableLiquidityMinor > packet.vaultTotalLiquidityMinor) {
      context.addIssue({
        code: "custom",
        path: ["vaultAvailableLiquidityMinor"],
        message:
          "vaultAvailableLiquidityMinor must not exceed vaultTotalLiquidityMinor",
      });
    }
    if (/^0x0{64}$/i.test(packet.buyerIdentityCommitment)) {
      context.addIssue({
        code: "custom",
        path: ["buyerIdentityCommitment"],
        message: "buyerIdentityCommitment must be non-zero",
      });
    }
    if (/^0x0{64}$/i.test(packet.supplierIdentityCommitment)) {
      context.addIssue({
        code: "custom",
        path: ["supplierIdentityCommitment"],
        message: "supplierIdentityCommitment must be non-zero",
      });
    }
  });

export const FacilityQuoteSchema = z
  .object({
    decision: z.enum(["APPROVE", "REFER", "REJECT"]),
    advanceBps: safeInteger("advanceBps").min(0).max(10_000),
    feeBps: safeInteger("feeBps").min(0).max(POLICY.maxFeeBps),
    expiresAt: positiveSafeInteger("expiresAt"),
    riskTier: z.enum(["A", "B", "C", "REFER"]),
    reasonCodes: z.array(z.enum(REASON_CODES)).min(1),
    evidenceIds: z.array(Bytes32Schema).min(1),
    policyVersion: z.literal(POLICY_VERSION),
    modelVersion: z.literal(MODEL_VERSION),
    signer: Bytes32Schema.optional(),
    nonce: nonNegativeSafeInteger("nonce").optional(),
  })
  .strict()
  .superRefine((quote, context) => {
    if (quote.decision === "APPROVE" && quote.advanceBps === 0) {
      context.addIssue({
        code: "custom",
        path: ["advanceBps"],
        message: "APPROVE quotes must request a positive advance",
      });
    }
  });

export type EvidencePacket = z.infer<typeof EvidencePacketSchema>;
export type FacilityQuote = z.infer<typeof FacilityQuoteSchema>;
