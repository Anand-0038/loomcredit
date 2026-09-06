import { describe, expect, it } from "vitest";

import {
  DEMO_EVIDENCE_PACKET,
  DEMO_SAFE_QUOTE,
  EvidencePacketSchema,
  FacilityQuoteSchema,
} from "../src/index.js";

describe("shared financial schemas", () => {
  it("accepts the bounded demo packet and quote", () => {
    expect(EvidencePacketSchema.safeParse(DEMO_EVIDENCE_PACKET).success).toBe(
      true,
    );
    expect(FacilityQuoteSchema.safeParse(DEMO_SAFE_QUOTE).success).toBe(true);
  });

  it("rejects unsafe minor-unit values instead of allowing rounded money", () => {
    const result = EvidencePacketSchema.safeParse({
      ...DEMO_EVIDENCE_PACKET,
      orderValueMinor: Number.MAX_SAFE_INTEGER + 2,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["orderValueMinor"]);
    }
  });

  it("requires the exact source delivery deadline", () => {
    const { deliveryDeadline: _deliveryDeadline, ...withoutDeadline } =
      DEMO_EVIDENCE_PACKET;

    expect(EvidencePacketSchema.safeParse(withoutDeadline).success).toBe(false);
  });

  it("rejects unsafe quote timestamps and nonces", () => {
    expect(
      FacilityQuoteSchema.safeParse({
        ...DEMO_SAFE_QUOTE,
        expiresAt: Number.MAX_SAFE_INTEGER + 2,
      }).success,
    ).toBe(false);
    expect(
      FacilityQuoteSchema.safeParse({
        ...DEMO_SAFE_QUOTE,
        nonce: Number.MAX_SAFE_INTEGER + 2,
      }).success,
    ).toBe(false);
  });

  it("rejects impossible financial relationships and extra fields", () => {
    expect(
      EvidencePacketSchema.safeParse({
        ...DEMO_EVIDENCE_PACKET,
        guaranteeAmountMinor: DEMO_EVIDENCE_PACKET.orderValueMinor + 1,
      }).success,
    ).toBe(false);
    expect(
      EvidencePacketSchema.safeParse({
        ...DEMO_EVIDENCE_PACKET,
        vaultAvailableLiquidityMinor:
          DEMO_EVIDENCE_PACKET.vaultTotalLiquidityMinor + 1,
      }).success,
    ).toBe(false);
    expect(
      FacilityQuoteSchema.safeParse({
        ...DEMO_SAFE_QUOTE,
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      FacilityQuoteSchema.safeParse({
        ...DEMO_SAFE_QUOTE,
        advanceBps: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects zero identity commitments", () => {
    expect(
      EvidencePacketSchema.safeParse({
        ...DEMO_EVIDENCE_PACKET,
        buyerIdentityCommitment: `0x${"00".repeat(32)}`,
      }).success,
    ).toBe(false);
  });
});
