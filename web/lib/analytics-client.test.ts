import { describe, expect, it } from "vitest";

import { sanitizePostHogEvent } from "./analytics-client";

describe("analytics client boundary", () => {
  it("keeps only the allow-listed event fields", () => {
    const sanitized = sanitizePostHogEvent({
      uuid: "00000000-0000-4000-8000-000000000000",
      event: "loomcredit_page_viewed",
      properties: {
        surface: "proof",
        $current_url: "https://example.test/proof/0xprivate-id",
        orderId: "0xprivate-order-id",
      },
      $set: { email: "private@example.test" },
    });

    expect(sanitized?.properties).toEqual({ surface: "proof" });
    expect(sanitized).not.toHaveProperty("$set");
  });

  it("drops events outside the LoomCredit contract", () => {
    expect(
      sanitizePostHogEvent({
        uuid: "00000000-0000-4000-8000-000000000000",
        event: "$pageview",
        properties: {},
      }),
    ).toBeNull();
  });
});
