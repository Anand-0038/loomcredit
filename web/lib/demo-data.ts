import {
  DEMO_DELIVERY_DEADLINE,
  DEMO_EVIDENCE_PACKET,
  DEMO_SAFE_QUOTE,
  LOCAL_EVIDENCE_ID,
  LOCAL_ORDER_ID,
  POLICY_VERSION,
  evaluateQuote,
} from "@loomcredit/shared";

export const demoOrder = {
  orderId: LOCAL_ORDER_ID,
  evidenceId: LOCAL_EVIDENCE_ID,
  status: "EVIDENCE_VERIFIED" as const,
  proofStatus: "LOCAL_FIXTURE" as const,
  sourceChain: DEMO_EVIDENCE_PACKET.sourceChain,
  executionChain: DEMO_EVIDENCE_PACKET.executionChain,
  orderValue: DEMO_EVIDENCE_PACKET.orderValueMinor,
  guaranteeAmount: DEMO_EVIDENCE_PACKET.guaranteeAmountMinor,
  currency: DEMO_EVIDENCE_PACKET.currency,
  tenorDays: DEMO_EVIDENCE_PACKET.tenorDays,
  deliveryDeadline: DEMO_DELIVERY_DEADLINE,
  buyerSettlementCount: DEMO_EVIDENCE_PACKET.buyerSettlementCount,
  buyerDisputeCount: DEMO_EVIDENCE_PACKET.buyerDisputeCount,
  supplierSettlementCount: DEMO_EVIDENCE_PACKET.supplierSettlementCount,
  sourceTransaction: null,
  creditcoinTransaction: null,
  policyVersion: POLICY_VERSION,
};

export const demoLifecycle = [
  {
    title: "Order observed",
    description: "Source-chain order event enters the worker inbox.",
    status: "Fixture boundary",
  },
  {
    title: "Proof assembled",
    description: "USC proof fields are shaped for native verification.",
    status: "Fixture boundary",
  },
  {
    title: "Evidence registered",
    description: "Registry binds the event to order terms and commitments.",
    status: "Fixture boundary",
  },
  {
    title: "Quote evaluated",
    description: "The proposal meets the deterministic policy checks.",
    status: "Local policy",
  },
];

export const demoEvaluation = evaluateQuote({
  orderValueMinor: DEMO_EVIDENCE_PACKET.orderValueMinor,
  guaranteeAmountMinor: DEMO_EVIDENCE_PACKET.guaranteeAmountMinor,
  deliveryDeadline: DEMO_DELIVERY_DEADLINE,
  now: 1_786_200_000,
  decision: DEMO_SAFE_QUOTE.decision,
  advanceBps: DEMO_SAFE_QUOTE.advanceBps,
  quoteExpiresAt: DEMO_SAFE_QUOTE.expiresAt,
  buyerExposureMinor: DEMO_EVIDENCE_PACKET.openBuyerExposureMinor,
  portfolioCapacityMinor: DEMO_EVIDENCE_PACKET.vaultTotalLiquidityMinor,
  availableLiquidityMinor: DEMO_EVIDENCE_PACKET.vaultAvailableLiquidityMinor,
  state: DEMO_EVIDENCE_PACKET.facilityState,
  evidenceIds: DEMO_SAFE_QUOTE.evidenceIds,
  requiredEvidenceIds: [DEMO_EVIDENCE_PACKET.evidenceId],
  signerApproved: "NOT_REQUESTED",
  policyVersion: DEMO_SAFE_QUOTE.policyVersion,
});

export const demoStages = [
  {
    title: "Source event",
    description: "OrderGuaranteed shape",
    status: "fixture" as const,
  },
  {
    title: "USC proof",
    description: "Fixture-shaped inclusion + continuity",
    status: "fixture" as const,
  },
  {
    title: "Facility registry",
    description: "Fixture-bound terms and identities",
    status: "fixture" as const,
  },
  {
    title: "RiskGuard",
    description: "Local policy evaluation only",
    status: "fixture" as const,
  },
];

export const formatMinorUnits = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value / 100);

export function shortenId(value: string, start = 10, end = 8): string {
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}
