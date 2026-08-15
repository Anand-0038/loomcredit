import {
  DEMO_NOW,
  DEMO_SAFE_QUOTE,
  FacilityQuoteSchema,
  MODEL_VERSION,
  type EvidencePacket,
  type FacilityQuote,
} from "@loomcredit/shared";

import { hasVerifiedEvidence } from "./evidence.js";
import {
  ModelUnavailableError,
  type QuoteModelAdapter,
} from "./model-adapter.js";
import { evaluateAgentQuote } from "./policy.js";

export interface QuoteResult {
  quote: FacilityQuote;
  policy: ReturnType<typeof evaluateAgentQuote> | null;
  mode: "MODEL" | "REFER" | "LOCAL_FIXTURE";
}

export function assertQuoteCanBeSigned(result: QuoteResult): void {
  if (result.mode !== "MODEL" || result.policy?.decision !== "APPROVED") {
    throw new Error(
      "INPUT_INVALID: only a LIVE_VERIFIED model quote that passes deterministic policy may be signed",
    );
  }
}

function referQuote(
  packet: EvidencePacket,
  reason: "MODEL_UNAVAILABLE" | "EVIDENCE_MISSING",
  now: number,
): FacilityQuote {
  return {
    decision: "REFER",
    advanceBps: 0,
    feeBps: 0,
    expiresAt: now,
    riskTier: "REFER",
    reasonCodes: [reason],
    evidenceIds: [packet.evidenceId],
    policyVersion: packet.policyVersion,
    modelVersion: MODEL_VERSION,
  };
}

export function validateQuoteForEvidence(
  packet: EvidencePacket,
  input: unknown,
): FacilityQuote {
  const parsed = FacilityQuoteSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(`Quote rejected by schema: ${parsed.error.message}`);
  if (
    parsed.data.evidenceIds.length !== 1 ||
    parsed.data.evidenceIds[0]?.toLowerCase() !==
      packet.evidenceId.toLowerCase()
  ) {
    throw new Error(
      "Quote must reference exactly the registered evidence for this order",
    );
  }
  return parsed.data;
}

export async function generateQuote(
  packet: EvidencePacket,
  adapter: QuoteModelAdapter | null,
  now = Math.floor(Date.now() / 1000),
): Promise<QuoteResult> {
  if (!hasVerifiedEvidence(packet)) {
    return {
      quote: referQuote(packet, "EVIDENCE_MISSING", now),
      policy: null,
      mode: "REFER",
    };
  }
  if (!adapter) {
    return {
      quote: referQuote(packet, "MODEL_UNAVAILABLE", now),
      policy: null,
      mode: "REFER",
    };
  }

  try {
    const quote = validateQuoteForEvidence(
      packet,
      await adapter.generateQuote(packet, now),
    );
    // A model proposal is not yet signer-authorized. The CLI re-evaluates this
    // boundary after an actual signing step succeeds.
    const policy = evaluateAgentQuote(packet, quote, now, "NOT_REQUESTED");
    return { quote, policy, mode: "MODEL" };
  } catch (error) {
    if (error instanceof ModelUnavailableError) {
      return {
        quote: referQuote(packet, "MODEL_UNAVAILABLE", now),
        policy: null,
        mode: "REFER",
      };
    }
    throw error;
  }
}

export function localFixtureQuote(kind: "safe" | "unsafe"): QuoteResult {
  const quote: FacilityQuote =
    kind === "safe"
      ? DEMO_SAFE_QUOTE
      : {
          ...DEMO_SAFE_QUOTE,
          advanceBps: 8_000,
          reasonCodes: ["ADVANCE_LIMIT_EXCEEDED"],
        };
  return {
    quote,
    policy: evaluateAgentQuote(
      {
        evidenceId: quote.evidenceIds[0]!,
        orderId: `0x${"24".repeat(32)}`,
        buyerIdentityCommitment: `0x${"b1".repeat(32)}`,
        supplierIdentityCommitment: `0x${"a7".repeat(32)}`,
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
        policyVersion: quote.policyVersion,
        sourceChain: "Ethereum Sepolia",
        executionChain: "Creditcoin CC3 Testnet",
        proofStatus: "LOCAL_FIXTURE",
      },
      quote,
      DEMO_NOW,
      "NOT_REQUESTED",
    ),
    mode: "LOCAL_FIXTURE",
  };
}
