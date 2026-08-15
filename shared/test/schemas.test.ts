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
});
