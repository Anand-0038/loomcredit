export const POLICY_VERSION = "2026-08-demo-v1" as const;
export const MODEL_VERSION = "structured-agent-v1" as const;

export const POLICY = {
  maxAdvanceBps: 4_000,
  maxFeeBps: 1_000,
  minGuaranteeBps: 1_000,
  maxTenorDays: 90,
  maxBuyerConcentrationBps: 2_500,
  minQuoteTtlSeconds: 60,
  quoteTtlSeconds: 300,
} as const;

export const REASON_CODES = [
  "BUYER_GUARANTEE_VERIFIED",
  "POSITIVE_SETTLEMENT_HISTORY",
  "TENOR_WITHIN_POLICY",
  "CONCENTRATION_WITHIN_POLICY",
  "LIQUIDITY_AVAILABLE",
  "ADVANCE_LIMIT_EXCEEDED",
  "ORDER_CANCELLED",
  "ORDER_DISPUTED",
  "QUOTE_EXPIRED",
  "MODEL_UNAVAILABLE",
  "EVIDENCE_MISSING",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export type FacilityState =
  | "EVIDENCE_VERIFIED"
  | "QUOTED"
  | "RESERVED"
  | "CANCELLED"
  | "DISPUTED"
  | "SETTLED"
  | "EXPIRED"
  | "REJECTED";

export type PolicyFailureCode =
  | "INVALID_INPUT"
  | "NON_APPROVAL_DECISION"
  | "ZERO_ADVANCE"
  | "ADVANCE_LIMIT"
  | "FEE_LIMIT"
  | "GUARANTEE_TOO_LOW"
  | "TENOR_LIMIT"
  | "BUYER_CONCENTRATION"
  | "QUOTE_EXPIRED"
  | "UNKNOWN_SIGNER"
  | "POLICY_VERSION"
  | "INVALID_STATE"
  | "INSUFFICIENT_LIQUIDITY"
  | "EVIDENCE_MISMATCH";

export type PolicyCheckStatus = "PASS" | "FAIL" | "NOT_APPLICABLE";

export type SignerApproval = boolean | "NOT_REQUESTED";

export interface PolicyCheck {
  id: string;
  label: string;
  status: PolicyCheckStatus;
  actual: string;
  limit: string;
  failureCode?: PolicyFailureCode;
}

export interface QuoteEvaluationInput {
  orderValueMinor: number;
  guaranteeAmountMinor: number;
  deliveryDeadline: number;
  now: number;
  decision: "APPROVE" | "REFER" | "REJECT";
  advanceBps: number;
  feeBps: number;
  quoteExpiresAt: number;
  buyerExposureMinor: number;
  portfolioCapacityMinor: number;
  availableLiquidityMinor: number;
  state: FacilityState;
  evidenceIds: readonly string[];
  requiredEvidenceIds: readonly string[];
  signerApproved: SignerApproval;
  policyVersion: string;
}

export interface PolicyEvaluation {
  decision: "APPROVED" | "REJECTED" | "REFER";
  failureCode?: PolicyFailureCode;
  requestedAdvanceMinor: number;
  approvedAdvanceMinor: number;
  checks: PolicyCheck[];
}

function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(0)}%`;
}

function formatBigIntBps(bps: bigint): string {
  return `${(bps + 50n) / 100n}%`;
}

function parseMinorUnits(value: number, field: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `INVALID_INPUT: ${field} must be a non-negative safe integer`,
    );
  }
  return BigInt(value);
}

function parseBasisPoints(value: number, field: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
    throw new Error(`INVALID_INPUT: ${field} must be between 0 and 10000`);
  }
  return BigInt(value);
}

function toSafeNumber(value: bigint, field: string): number {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (value < 0n || value > max) {
    throw new Error(`INVALID_INPUT: ${field} exceeds safe integer precision`);
  }
  return Number(value);
}

function hasExactEvidence(
  evidenceIds: readonly string[],
  requiredEvidenceIds: readonly string[],
): boolean {
  return (
    evidenceIds.length === requiredEvidenceIds.length &&
    evidenceIds.every(
      (id, index) =>
        id.toLowerCase() === requiredEvidenceIds[index]?.toLowerCase(),
    )
  );
}

export function evaluateQuote(input: QuoteEvaluationInput): PolicyEvaluation {
  const orderValueMinor = parseMinorUnits(
    input.orderValueMinor,
    "orderValueMinor",
  );
  const guaranteeAmountMinor = parseMinorUnits(
    input.guaranteeAmountMinor,
    "guaranteeAmountMinor",
  );
  const buyerExposureMinor = parseMinorUnits(
    input.buyerExposureMinor,
    "buyerExposureMinor",
  );
  const portfolioCapacityMinor = parseMinorUnits(
    input.portfolioCapacityMinor,
    "portfolioCapacityMinor",
  );
  const availableLiquidityMinor = parseMinorUnits(
    input.availableLiquidityMinor,
    "availableLiquidityMinor",
  );
  const advanceBps = parseBasisPoints(input.advanceBps, "advanceBps");
  const feeBps = parseBasisPoints(input.feeBps, "feeBps");
  const requestedAdvanceMinorBig = (orderValueMinor * advanceBps) / 10_000n;
  const requestedAdvanceMinor = toSafeNumber(
    requestedAdvanceMinorBig,
    "requestedAdvanceMinor",
  );
  const deadlineDeltaSeconds = input.deliveryDeadline - input.now;
  // Math.ceil(-1 / 86400) is 0, which would incorrectly pass a deadline
  // that expired less than a day ago. Keep any past deadline negative so the
  // off-chain check matches RiskGuard's strict `deadline < block.timestamp`
  // rejection.
  const tenorDays =
    deadlineDeltaSeconds < 0 ? -1 : Math.ceil(deadlineDeltaSeconds / 86_400);
  const buyerLimitMinorBig =
    (portfolioCapacityMinor * BigInt(POLICY.maxBuyerConcentrationBps)) /
    10_000n;
  const buyerLimitMinor = toSafeNumber(buyerLimitMinorBig, "buyerLimitMinor");
  const buyerExposureWithRequestMinor =
    buyerExposureMinor + requestedAdvanceMinorBig;
  const guaranteeRatioBps =
    orderValueMinor > 0n
      ? (guaranteeAmountMinor * 10_000n) / orderValueMinor
      : 0n;
  const checks: PolicyCheck[] = [
    {
      id: "positive-advance",
      label: "Positive advance",
      status:
        input.decision !== "APPROVE" || input.advanceBps > 0 ? "PASS" : "FAIL",
      actual: formatBps(input.advanceBps),
      limit: ">0% for approval",
      failureCode: "ZERO_ADVANCE",
    },
    {
      id: "advance-cap",
      label: "Advance cap",
      status: input.advanceBps <= POLICY.maxAdvanceBps ? "PASS" : "FAIL",
      actual: formatBps(input.advanceBps),
      limit: formatBps(POLICY.maxAdvanceBps),
      failureCode: "ADVANCE_LIMIT",
    },
    {
      id: "fee-cap",
      label: "Fee cap",
      status: feeBps <= BigInt(POLICY.maxFeeBps) ? "PASS" : "FAIL",
      actual: formatBps(input.feeBps),
      limit: formatBps(POLICY.maxFeeBps),
      failureCode: "FEE_LIMIT",
    },
    {
      id: "guarantee-ratio",
      label: "Buyer guarantee",
      status:
        orderValueMinor > 0n &&
        guaranteeAmountMinor * 10_000n >=
          orderValueMinor * BigInt(POLICY.minGuaranteeBps)
          ? "PASS"
          : "FAIL",
      actual:
        orderValueMinor > 0n ? formatBigIntBps(guaranteeRatioBps) : "invalid",
      limit: formatBps(POLICY.minGuaranteeBps),
      failureCode: "GUARANTEE_TOO_LOW",
    },
    {
      id: "tenor",
      label: "Delivery tenor",
      status:
        tenorDays >= 0 && tenorDays <= POLICY.maxTenorDays ? "PASS" : "FAIL",
      actual: `${tenorDays} days`,
      limit: `${POLICY.maxTenorDays} days`,
      failureCode: "TENOR_LIMIT",
    },
    {
      id: "buyer-concentration",
      label: "Buyer concentration",
      status:
        buyerExposureWithRequestMinor <= buyerLimitMinorBig ? "PASS" : "FAIL",
      actual: `${buyerExposureWithRequestMinor} minor units`,
      limit: `${buyerLimitMinor} minor units`,
      failureCode: "BUYER_CONCENTRATION",
    },
    {
      id: "quote-ttl",
      label: "Quote expiry",
      status:
        input.quoteExpiresAt >= input.now + POLICY.minQuoteTtlSeconds &&
        input.quoteExpiresAt <= input.now + POLICY.quoteTtlSeconds
          ? "PASS"
          : "FAIL",
      actual: `${Math.max(0, input.quoteExpiresAt - input.now)} seconds`,
      limit: `${POLICY.minQuoteTtlSeconds}-${POLICY.quoteTtlSeconds} seconds`,
      failureCode: "QUOTE_EXPIRED",
    },
    {
      id: "signer",
      label: "Agent signer",
      status:
        input.signerApproved === "NOT_REQUESTED"
          ? "NOT_APPLICABLE"
          : input.signerApproved
            ? "PASS"
            : "FAIL",
      actual:
        input.signerApproved === "NOT_REQUESTED"
          ? "not requested"
          : input.signerApproved
            ? "allowlisted"
            : "unknown",
      limit: "allowlisted signer",
      ...(input.signerApproved === "NOT_REQUESTED"
        ? {}
        : { failureCode: "UNKNOWN_SIGNER" as const }),
    },
    {
      id: "policy-version",
      label: "Policy version",
      status: input.policyVersion === POLICY_VERSION ? "PASS" : "FAIL",
      actual: input.policyVersion,
      limit: POLICY_VERSION,
      failureCode: "POLICY_VERSION",
    },
    {
      id: "facility-state",
      label: "Facility state",
      status: input.state === "EVIDENCE_VERIFIED" ? "PASS" : "FAIL",
      actual: input.state,
      limit: "evidence verified before quote submission",
      failureCode: "INVALID_STATE",
    },
    {
      id: "evidence",
      label: "Evidence binding",
      status: hasExactEvidence(input.evidenceIds, input.requiredEvidenceIds)
        ? "PASS"
        : "FAIL",
      actual: `${input.evidenceIds.length} supplied`,
      limit: `${input.requiredEvidenceIds.length} registered in order`,
      failureCode: "EVIDENCE_MISMATCH",
    },
    {
      id: "liquidity",
      label: "Sandbox liquidity",
      status:
        requestedAdvanceMinorBig <= availableLiquidityMinor ? "PASS" : "FAIL",
      actual: `${requestedAdvanceMinor} requested`,
      limit: `${input.availableLiquidityMinor} available`,
      failureCode: "INSUFFICIENT_LIQUIDITY",
    },
  ];

  const failedCheck = checks.find((check) => check.status === "FAIL");
  if (failedCheck) {
    const failureCode = failedCheck.failureCode;
    return {
      decision: "REJECTED",
      requestedAdvanceMinor,
      approvedAdvanceMinor: 0,
      checks,
      ...(failureCode ? { failureCode } : {}),
    };
  }

  if (input.decision !== "APPROVE") {
    return {
      decision: input.decision === "REFER" ? "REFER" : "REJECTED",
      failureCode: "NON_APPROVAL_DECISION",
      requestedAdvanceMinor,
      approvedAdvanceMinor: 0,
      checks,
    };
  }

  return {
    decision: "APPROVED",
    requestedAdvanceMinor,
    approvedAdvanceMinor: requestedAdvanceMinor,
    checks,
  };
}
