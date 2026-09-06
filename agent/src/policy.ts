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
    // Preserve the exact source-chain deadline. Reconstructing it from the
    // packet's rounded tenor would let a recently expired order look fresh.
    deliveryDeadline: packet.deliveryDeadline,
    now,
    decision: quote.decision,
    advanceBps: quote.advanceBps,
    feeBps: quote.feeBps,
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
