import type { EvidencePacket, FacilityQuote } from "./schemas";
import { MODEL_VERSION, POLICY_VERSION } from "./policy";

export const LOCAL_ORDER_ID = `0x${"24".repeat(32)}`;
export const LOCAL_EVIDENCE_ID = `0x${"e1".repeat(32)}`;
export const LOCAL_BUYER_COMMITMENT = `0x${"b1".repeat(32)}`;
export const LOCAL_SUPPLIER_COMMITMENT = `0x${"a7".repeat(32)}`;

export const DEMO_NOW = 1_786_200_000;
export const DEMO_DELIVERY_DEADLINE = DEMO_NOW + 45 * 86_400;

export const DEMO_EVIDENCE_PACKET: EvidencePacket = {
  evidenceId: LOCAL_EVIDENCE_ID,
  orderId: LOCAL_ORDER_ID,
  buyerIdentityCommitment: LOCAL_BUYER_COMMITMENT,
  supplierIdentityCommitment: LOCAL_SUPPLIER_COMMITMENT,
  orderValueMinor: 1_000_000,
  guaranteeAmountMinor: 200_000,
  currency: "TEST_USD",
  tenorDays: 45,
  facilityState: "EVIDENCE_VERIFIED",
  buyerSettlementCount: 8,
  buyerDisputeCount: 1,
  supplierSettlementCount: 3,
  supplierCancellationCount: 0,
  openBuyerExposureMinor: 0,
  openSupplierExposureMinor: 0,
  vaultTotalLiquidityMinor: 10_000_000,
  vaultAvailableLiquidityMinor: 5_000_000,
  policyVersion: POLICY_VERSION,
  sourceChain: "Ethereum Sepolia",
  executionChain: "Creditcoin CC3 Testnet",
  proofStatus: "LOCAL_FIXTURE",
};

export const DEMO_SAFE_QUOTE: FacilityQuote = {
  decision: "APPROVE",
  advanceBps: 3_000,
  feeBps: 250,
  expiresAt: DEMO_NOW + 600,
  riskTier: "B",
  reasonCodes: [
    "BUYER_GUARANTEE_VERIFIED",
    "POSITIVE_SETTLEMENT_HISTORY",
    "TENOR_WITHIN_POLICY",
    "CONCENTRATION_WITHIN_POLICY",
    "LIQUIDITY_AVAILABLE",
  ],
  evidenceIds: [LOCAL_EVIDENCE_ID],
  policyVersion: POLICY_VERSION,
  modelVersion: MODEL_VERSION,
};

export const DEMO_UNSAFE_QUOTE: FacilityQuote = {
  ...DEMO_SAFE_QUOTE,
  advanceBps: 8_000,
  reasonCodes: ["ADVANCE_LIMIT_EXCEEDED"],
};

export const DEMO_CANCELLED_QUOTE: FacilityQuote = {
  ...DEMO_SAFE_QUOTE,
  decision: "REJECT",
  riskTier: "REFER",
  reasonCodes: ["ORDER_CANCELLED"],
};
