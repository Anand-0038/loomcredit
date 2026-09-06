import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import {
  DEMO_EVIDENCE_PACKET,
  DEMO_CANCELLED_QUOTE,
  DEMO_SAFE_QUOTE,
  DEMO_UNSAFE_QUOTE,
  DEMO_NOW,
  POLICY,
  evaluateQuote,
} from "@loomcredit/shared";
import { readJsonBody, RequestBodyError } from "../../../../lib/request-body";
import { DEMO_TRACE_SCHEMA_VERSION } from "../../../../lib/demo-trace";

const InputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("safe") }),
  z.object({ mode: z.literal("unsafe") }),
  z.object({ mode: z.literal("cancelled") }),
  z.object({
    mode: z.literal("custom"),
    advanceBps: z.number().int().min(0).max(10_000),
    deliveryDays: z.number().int().min(0).max(365),
  }),
]);

export async function POST(request: Request) {
  const requestId = randomUUID();
  const startedAt = Date.now();
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
      {
        error:
          "mode must be safe, unsafe, cancelled, or custom with advanceBps and deliveryDays",
      },
      { status: 400 },
    );

  const customInput = input.data.mode === "custom" ? input.data : null;
  const isCustom = customInput !== null;
  const isCancelled = input.data.mode === "cancelled";
  const deliveryDeadline = isCustom
    ? DEMO_NOW + customInput.deliveryDays * 86_400
    : DEMO_EVIDENCE_PACKET.deliveryDeadline;
  const quote = isCustom
    ? {
        ...DEMO_SAFE_QUOTE,
        advanceBps: customInput.advanceBps,
        reasonCodes:
          customInput.advanceBps > POLICY.maxAdvanceBps
            ? (["ADVANCE_LIMIT_EXCEEDED"] as const)
            : DEMO_SAFE_QUOTE.reasonCodes,
      }
    : input.data.mode === "safe"
      ? DEMO_SAFE_QUOTE
      : input.data.mode === "unsafe"
        ? DEMO_UNSAFE_QUOTE
        : DEMO_CANCELLED_QUOTE;
  const policy = evaluateQuote({
    orderValueMinor: DEMO_EVIDENCE_PACKET.orderValueMinor,
    guaranteeAmountMinor: DEMO_EVIDENCE_PACKET.guaranteeAmountMinor,
    deliveryDeadline,
    now: DEMO_NOW,
    decision: quote.decision,
    advanceBps: quote.advanceBps,
    feeBps: quote.feeBps,
    quoteExpiresAt: quote.expiresAt,
    buyerExposureMinor: DEMO_EVIDENCE_PACKET.openBuyerExposureMinor,
    portfolioCapacityMinor: DEMO_EVIDENCE_PACKET.vaultTotalLiquidityMinor,
    availableLiquidityMinor: DEMO_EVIDENCE_PACKET.vaultAvailableLiquidityMinor,
    state: isCancelled ? "CANCELLED" : DEMO_EVIDENCE_PACKET.facilityState,
    evidenceIds: quote.evidenceIds,
    requiredEvidenceIds: [DEMO_EVIDENCE_PACKET.evidenceId],
    signerApproved: "NOT_REQUESTED",
    policyVersion: quote.policyVersion,
  });

  const inputHash = createHash("sha256")
    .update(
      JSON.stringify({
        mode: input.data.mode,
        evidenceId: DEMO_EVIDENCE_PACKET.evidenceId,
        orderId: DEMO_EVIDENCE_PACKET.orderId,
        orderValueMinor: DEMO_EVIDENCE_PACKET.orderValueMinor,
        guaranteeAmountMinor: DEMO_EVIDENCE_PACKET.guaranteeAmountMinor,
        deliveryDeadline,
        facilityState: isCancelled
          ? "CANCELLED"
          : DEMO_EVIDENCE_PACKET.facilityState,
        decision: quote.decision,
        advanceBps: quote.advanceBps,
        quoteExpiresAt: quote.expiresAt,
        policyVersion: quote.policyVersion,
      }),
    )
    .digest("hex");

  return NextResponse.json({
    boundary: "LOCAL_FIXTURE_ONLY",
    mode: input.data.mode,
    quote,
    policy,
    trace: {
      requestId,
      evaluatedAt: new Date().toISOString(),
      evaluationDurationMs: Math.max(0, Date.now() - startedAt),
      inputHash,
      schemaVersion: DEMO_TRACE_SCHEMA_VERSION,
      origin: "FIXTURE",
      boundary: "LOCAL_FIXTURE_ONLY",
      policyVersion: quote.policyVersion,
    },
  });
}
