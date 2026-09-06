import { describe, expect, it } from "vitest";

import { normalizeOrderReference, resolveReviewCase } from "./review-case";

const recordedOrderId =
  "0x2a3f897f0f2a4daae050a72cac472a0afbb20d041f69d83de72ff0ba825043f1";

describe("review case resolution", () => {
  it("normalizes whitespace and casing", () => {
    expect(normalizeOrderReference("  0xABC  ")).toBe("0xabc");
  });

  it("opens the recorded case for an exact order reference", () => {
    expect(
      resolveReviewCase(recordedOrderId.toUpperCase(), recordedOrderId),
    ).toBe("recorded");
  });

  it("opens the recorded case for its evidence reference", () => {
    expect(
      resolveReviewCase(
        "0x" + "33".repeat(32),
        recordedOrderId,
        "0x" + "33".repeat(32),
      ),
    ).toBe("recorded");
  });

  it("fails closed for empty or unknown references", () => {
    expect(resolveReviewCase("", recordedOrderId)).toBe("not_found");
    expect(resolveReviewCase("0x1234", recordedOrderId)).toBe("not_found");
  });
});
