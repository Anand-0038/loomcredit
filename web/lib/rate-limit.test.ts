import { afterEach, describe, expect, it } from "vitest";

import { clearRateLimitsForTests, consumeRateLimit } from "./rate-limit";

afterEach(() => clearRateLimitsForTests());

describe("application rate limit", () => {
  it("allows the configured burst and returns a retry window after exhaustion", () => {
    const options = { maxRequests: 2, windowMs: 10_000 };

    expect(consumeRateLimit("wallet-a", options, 1_000)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
    expect(consumeRateLimit("wallet-a", options, 2_000).allowed).toBe(true);
    expect(consumeRateLimit("wallet-a", options, 3_000)).toEqual({
      allowed: false,
      retryAfterSeconds: 8,
    });
  });

  it("starts a fresh window and isolates keys", () => {
    const options = { maxRequests: 1, windowMs: 1_000 };

    expect(consumeRateLimit("wallet-a", options, 1_000).allowed).toBe(true);
    expect(consumeRateLimit("wallet-b", options, 1_000).allowed).toBe(true);
    expect(consumeRateLimit("wallet-a", options, 2_000).allowed).toBe(true);
  });

  it("rejects invalid limiter configuration", () => {
    expect(() =>
      consumeRateLimit("wallet-a", { maxRequests: 0, windowMs: 1_000 }),
    ).toThrow("Rate-limit options are invalid.");
  });
});
