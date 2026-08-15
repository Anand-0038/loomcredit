import { describe, expect, it } from "vitest";

import { parseSafeMinorUnits } from "./source-evidence";

describe("source evidence numeric boundary", () => {
  it("converts exact decimal minor units", () => {
    expect(parseSafeMinorUnits("10000000000", "orderValue")).toBe(
      10_000_000_000,
    );
  });

  it("rejects values that JavaScript would round", () => {
    expect(() => parseSafeMinorUnits("9007199254740992", "orderValue")).toThrow(
      "safe integer precision",
    );
  });

  it("rejects non-integer source values", () => {
    expect(() => parseSafeMinorUnits("100.5", "orderValue")).toThrow(
      "non-negative integer",
    );
  });
});
