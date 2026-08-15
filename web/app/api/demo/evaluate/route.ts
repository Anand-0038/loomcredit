import { NextResponse } from "next/server";
import { z } from "zod";

import {
  DEMO_EVIDENCE_PACKET,
  DEMO_CANCELLED_QUOTE,
  DEMO_SAFE_QUOTE,
  DEMO_UNSAFE_QUOTE,
  DEMO_NOW,
  evaluateQuote,
} from "@loomcredit/shared";
import { readJsonBody, RequestBodyError } from "../../../../lib/request-body";

const InputSchema = z.object({ mode: z.enum(["safe", "unsafe", "cancelled"]) });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await readJsonBody(request, 4_096);
  } catch (error) {
    if (error instanceof RequestBodyError && error.code === "TOO_LARGE") {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json(
      { error: "Expected a JSON body." },
      { status: 400 },
    );
  }
  const input = InputSchema.safeParse(body);
  if (!input.success)
    return NextResponse.json(
      { error: "mode must be safe, unsafe, or cancelled" },
      { status: 400 },
    );

  const quote =
    input.data.mode === "safe"
      ? DEMO_SAFE_QUOTE
      : input.data.mode === "unsafe"
        ? DEMO_UNSAFE_QUOTE
        : DEMO_CANCELLED_QUOTE;
  const policy = evaluateQuote({
    orderValueMinor: DEMO_EVIDENCE_PACKET.orderValueMinor,
    guaranteeAmountMinor: DEMO_EVIDENCE_PACKET.guaranteeAmountMinor,
    deliveryDeadline: DEMO_NOW + DEMO_EVIDENCE_PACKET.tenorDays * 86_400,
    now: DEMO_NOW,
    decision: quote.decision,
    advanceBps: quote.advanceBps,
    quoteExpiresAt: quote.expiresAt,
    buyerExposureMinor: DEMO_EVIDENCE_PACKET.openBuyerExposureMinor,
    portfolioCapacityMinor: DEMO_EVIDENCE_PACKET.vaultTotalLiquidityMinor,
    availableLiquidityMinor: DEMO_EVIDENCE_PACKET.vaultAvailableLiquidityMinor,
    state:
      input.data.mode === "cancelled"
        ? "CANCELLED"
        : DEMO_EVIDENCE_PACKET.facilityState,
    evidenceIds: quote.evidenceIds,
    requiredEvidenceIds: [DEMO_EVIDENCE_PACKET.evidenceId],
    signerApproved: "NOT_REQUESTED",
    policyVersion: quote.policyVersion,
  });

  return NextResponse.json({
    boundary: "LOCAL_FIXTURE_ONLY",
    mode: input.data.mode,
    quote,
    policy,
  });
}
