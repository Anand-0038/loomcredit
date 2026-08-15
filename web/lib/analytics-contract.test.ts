import { describe, expect, it } from "vitest";

import {
  analyticsSurface,
  isAnalyticsEnabled,
  readAnalyticsConsent,
} from "./analytics-contract";

describe("analytics contract", () => {
  it("maps dynamic evidence routes to bounded surfaces without retaining identifiers", () => {
    expect(
      analyticsSurface(
        "/proof/0xe1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1",
      ),
    ).toBe("proof");
    expect(
      analyticsSurface(
        "/orders/0x2424242424242424242424242424242424242424242424242424242424242424",
      ),
    ).toBe("order");
  });

  it("keeps consent fail-closed for unknown storage values", () => {
    expect(
      readAnalyticsConsent({ getItem: () => "something-else" }),
    ).toBeNull();
    expect(readAnalyticsConsent({ getItem: () => "granted" })).toBe("granted");
    expect(readAnalyticsConsent(undefined)).toBeNull();
  });

  it("requires an explicit enabled value", () => {
    expect(isAnalyticsEnabled(undefined)).toBe(false);
    expect(isAnalyticsEnabled("false")).toBe(false);
    expect(isAnalyticsEnabled("true")).toBe(true);
    expect(isAnalyticsEnabled("1")).toBe(true);
  });
});
