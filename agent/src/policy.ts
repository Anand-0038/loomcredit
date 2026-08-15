import {
  evaluateQuote,
  POLICY_VERSION,
  type FacilityQuote,
  type PolicyEvaluation,
  type EvidencePacket,
  type SignerApproval,
} from "@loomcredit/shared";

export function evaluateAgentQuote(
  packet: EvidencePacket,
  quote: FacilityQuote,
  now: number,
  signerApproved: SignerApproval,
): PolicyEvaluation {
  return evaluateQuote({
    orderValueMinor: packet.orderValueMinor,
    guaranteeAmountMinor: packet.guaranteeAmountMinor,
    deliveryDeadline: now + packet.tenorDays * 86_400,
    now,
    decision: quote.decision,
    advanceBps: quote.advanceBps,
    quoteExpiresAt: quote.expiresAt,
    buyerExposureMinor: packet.openBuyerExposureMinor,
    portfolioCapacityMinor: packet.vaultTotalLiquidityMinor,
    availableLiquidityMinor: packet.vaultAvailableLiquidityMinor,
    state: packet.facilityState,
    evidenceIds: quote.evidenceIds,
    requiredEvidenceIds: [packet.evidenceId],
    signerApproved,
    policyVersion:
      quote.policyVersion === POLICY_VERSION ? quote.policyVersion : "invalid",
  });
}
