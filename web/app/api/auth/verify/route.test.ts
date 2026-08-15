import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProtocolError } from "../../../../lib/auth";
import { POST } from "./route";

const {
  isTrustedAuthOrigin,
  configuredAuthChainId,
  configuredSessionTtlSeconds,
} = vi.hoisted(() => ({
  isTrustedAuthOrigin: vi.fn(),
  configuredAuthChainId: vi.fn(() => 11155111),
  configuredSessionTtlSeconds: vi.fn(() => 3600),
}));

vi.mock("../../../../lib/auth", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/auth")>(
    "../../../../lib/auth",
  );
  return {
    ...actual,
    isTrustedAuthOrigin,
    configuredAuthChainId,
    configuredSessionTtlSeconds,
  };
});

const requestBodyError = {
  address: `0x${"11".repeat(20)}`,
  chainId: 11155111,
  nonce: "0".repeat(32),
  message: "msg",
  signature: "0x0",
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("api /api/auth/verify", () => {
  it("returns AUTH_CONFIGURATION when auth origin environment is invalid", async () => {
    isTrustedAuthOrigin.mockImplementation(() => {
      throw new AuthProtocolError(
        "INVALID_CONFIGURATION",
        "Invalid auth origin.",
      );
    });

    const response = await POST(
      new Request("https://app.example/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBodyError),
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
});
