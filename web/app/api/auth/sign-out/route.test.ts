import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProtocolError } from "../../../../lib/auth";
import { POST } from "./route";

const { isTrustedAuthOrigin, requestAuthOrigin, revokeSession, recordAudit } =
  vi.hoisted(() => ({
    isTrustedAuthOrigin: vi.fn(),
    requestAuthOrigin: vi.fn(),
    revokeSession: vi.fn(),
    recordAudit: vi.fn(),
  }));

vi.mock("../../../../lib/auth", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/auth")>(
    "../../../../lib/auth",
  );
  return {
    ...actual,
    isTrustedAuthOrigin,
    requestAuthOrigin,
  };
});

vi.mock("../../../../lib/auth-store", () => ({
  getAuthStore: vi.fn(() => ({
    revokeSession,
    recordAudit,
  })),
  AUTH_SESSION_COOKIE: "loomcredit_session",
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("api /api/auth/sign-out", () => {
  it("returns AUTH_CONFIGURATION when auth origin environment is invalid", async () => {
    isTrustedAuthOrigin.mockImplementation(() => {
      throw new AuthProtocolError(
        "INVALID_CONFIGURATION",
        "Invalid auth origin.",
      );
    });

    const response = await POST(
      new Request("https://app.example/api/auth/sign-out", { method: "POST" }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      boundary: "AUTHENTICATION",
      code: "AUTH_CONFIGURATION",
      error: "Invalid auth origin.",
    });
  });

  it("returns AUTH_CONFIGURATION when origin cannot be derived due invalid auth config", async () => {
    isTrustedAuthOrigin.mockReturnValue(true);
    requestAuthOrigin.mockImplementation(() => {
      throw new AuthProtocolError(
        "INVALID_CONFIGURATION",
        "Invalid auth origin.",
      );
    });

    const response = await POST(
      new Request("https://app.example/api/auth/sign-out", { method: "POST" }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      boundary: "AUTHENTICATION",
      code: "AUTH_CONFIGURATION",
      error: "Invalid auth origin.",
    });
  });

  it("clears the session cookie and records an audit event when a token is present", async () => {
    isTrustedAuthOrigin.mockReturnValue(true);
    requestAuthOrigin.mockReturnValue("https://app.example");
    revokeSession.mockReturnValue({
      accountId: "account-1",
      address: "0x52908400098527886E0F7030069857D2E4169EE7",
      sessionIdHash: "token-hash",
    });

    const response = await POST(
      new Request("https://app.example/api/auth/sign-out", {
        method: "POST",
        headers: {
          cookie: "other=1; loomcredit_session=abc-session-token; theme=dark",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      boundary: "AUTHENTICATION",
      authenticated: false,
    });
    expect(revokeSession).toHaveBeenCalledWith("abc-session-token");
    expect(recordAudit).toHaveBeenCalledWith({
      eventType: "AUTH_SIGN_OUT",
      address: "0x52908400098527886E0F7030069857D2E4169EE7",
      accountId: "account-1",
      sessionIdHash: "token-hash",
      action: "auth.sign_out",
      success: true,
    });
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("loomcredit_session=");
  });

  it("returns success without session data if no session cookie is present", async () => {
    isTrustedAuthOrigin.mockReturnValue(true);
    requestAuthOrigin.mockReturnValue("https://app.example");

    const response = await POST(
      new Request("https://app.example/api/auth/sign-out", { method: "POST" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      boundary: "AUTHENTICATION",
      authenticated: false,
    });
    expect(revokeSession).not.toHaveBeenCalled();
  });
});
