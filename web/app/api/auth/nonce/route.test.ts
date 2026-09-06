import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProtocolError } from "../../../../lib/auth";
import { POST } from "./route";

const {
  isTrustedAuthOrigin,
  createNonce,
  pruneExpiredNonces,
  recordAudit,
  consumeRateLimit,
} = vi.hoisted(() => ({
  isTrustedAuthOrigin: vi.fn(),
  createNonce: vi.fn(),
  pruneExpiredNonces: vi.fn(),
  recordAudit: vi.fn(),
  consumeRateLimit: vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 })),
}));

vi.mock("../../../../lib/auth", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/auth")>(
    "../../../../lib/auth",
  );
  return {
    ...actual,
    isTrustedAuthOrigin,
    configuredAuthChainId: vi.fn(() => 11155111),
  };
});

vi.mock("../../../../lib/auth-store", () => ({
  getAuthStore: vi.fn(() => ({
    pruneExpiredNonces,
    createNonce,
    recordAudit,
  })),
  AUTH_NONCE_TTL_SECONDS: 300,
}));

vi.mock("../../../../lib/rate-limit", () => ({
  consumeRateLimit,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("api /api/auth/nonce", () => {
  it("rejects a cross-origin nonce request before touching auth state", async () => {
    isTrustedAuthOrigin.mockReturnValue(false);

    const response = await POST(
      new Request("https://app.example/api/auth/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: `0x${"11".repeat(20)}`,
          chainId: 11155111,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      boundary: "AUTHENTICATION",
      code: "ORIGIN_REJECTED",
      error:
        "This authentication request did not come from the configured application origin.",
    });
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(createNonce).not.toHaveBeenCalled();
  });

  it("returns AUTH_CONFIGURATION when auth origin environment is invalid", async () => {
    isTrustedAuthOrigin.mockImplementation(() => {
      throw new AuthProtocolError(
        "INVALID_CONFIGURATION",
        "Invalid auth origin.",
      );
    });

    const response = await POST(
      new Request("https://app.example/api/auth/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: `0x${"11".repeat(20)}`,
          chainId: 11155111,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      boundary: "AUTHENTICATION",
      code: "AUTH_CONFIGURATION",
      error: "Invalid auth origin.",
    });
  });

  it("accepts wallet hex chain IDs and issues a nonce for the configured chain", async () => {
    isTrustedAuthOrigin.mockReturnValue(true);
    const response = await POST(
      new Request("https://app.example/api/auth/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: `0x${"11".repeat(20)}`,
          chainId: "0xaa36a7",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.chainId).toBe(11155111);
    expect(createNonce).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 11155111,
        address: "0x1111111111111111111111111111111111111111",
      }),
    );
    expect(pruneExpiredNonces).toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "AUTH_NONCE_ISSUED",
        address: "0x1111111111111111111111111111111111111111",
        action: "auth.nonce.issue",
        success: true,
      }),
    );
  });

  it("rejects an unsupported chain before consuming the nonce rate limit", async () => {
    isTrustedAuthOrigin.mockReturnValue(true);

    const response = await POST(
      new Request("https://app.example/api/auth/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: `0x${"22".repeat(20)}`,
          chainId: 102031,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      boundary: "AUTHENTICATION",
      code: "UNSUPPORTED_CHAIN",
      error: "Switch the wallet to chain 11155111 before signing in.",
    });
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(createNonce).not.toHaveBeenCalled();
  });
});
