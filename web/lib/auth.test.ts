import { describe, expect, it } from "vitest";

import {
  AuthProtocolError,
  parseChainId,
  isTrustedAuthOrigin,
  requestAuthOrigin,
  roleForAddress,
} from "./auth";

type AuthTestEnvironment = {
  AUTH_ORIGIN?: string;
  NEXT_PUBLIC_SITE_URL?: string;
};

describe("authentication origin boundary", () => {
  it("prefers the explicit auth origin over proxy headers", () => {
    const request = new Request("https://internal.example/api/auth/nonce", {
      headers: {
        origin: "https://app.example",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "http",
      },
    });
    const env: AuthTestEnvironment = {
      AUTH_ORIGIN: "https://app.example",
      NEXT_PUBLIC_SITE_URL: "https://public.example",
    };

    expect(requestAuthOrigin(request, env)).toBe("https://app.example");
    expect(isTrustedAuthOrigin(request, env)).toBe(true);
    expect(
      isTrustedAuthOrigin(
        new Request(request, {
          headers: { origin: "https://attacker.example" },
        }),
        env,
      ),
    ).toBe(false);
  });

  it("uses NEXT_PUBLIC_SITE_URL when AUTH_ORIGIN is absent", () => {
    const request = new Request("https://internal.example/api/auth/nonce", {
      headers: {
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "http",
      },
    });

    expect(
      requestAuthOrigin(request, {
        NEXT_PUBLIC_SITE_URL: "https://app.example/",
      }),
    ).toBe("https://app.example");
  });

  it("retains the forwarded-header fallback for unconfigured local development", () => {
    const request = new Request("http://localhost:3000/api/auth/nonce", {
      headers: {
        host: "localhost:3000",
        "x-forwarded-host": "localhost:3000",
        "x-forwarded-proto": "http",
      },
    });

    expect(requestAuthOrigin(request, {})).toBe("http://localhost:3000");
  });

  it("rejects an explicit path instead of silently deriving an origin", () => {
    try {
      requestAuthOrigin(new Request("http://localhost:3000"), {
        AUTH_ORIGIN: "https://app.example/access",
      });
      throw new Error("Expected invalid auth origin configuration");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthProtocolError);
      expect((error as AuthProtocolError).code).toBe("INVALID_CONFIGURATION");
    }
  });
});

describe("role resolution", () => {
  it("treats malformed operator entries as non-blocking and still resolves valid operators", () => {
    const env: AuthTestEnvironment & { AUTH_OPERATOR_ADDRESSES?: string } = {
      AUTH_OPERATOR_ADDRESSES:
        "0x52908400098527886E0F7030069857D2E4169EE7,not-an-address,0x27b1fdb04752bbc536007a920d24acb045561c26",
      AUTH_ORIGIN: "https://app.example",
    };

    expect(
      roleForAddress(
        "0x52908400098527886E0F7030069857D2E4169EE7",
        env as NodeJS.ProcessEnv,
      ),
    ).toBe("operator");
    expect(
      roleForAddress(
        "0x27b1fdb04752bbc536007a920d24acb045561c26",
        env as NodeJS.ProcessEnv,
      ),
    ).toBe("operator");
    expect(
      roleForAddress(
        "0x1234567890abcdef1234567890abcdef12345678",
        env as NodeJS.ProcessEnv,
      ),
    ).toBe("viewer");
  });

  it("parses decimal and hex chain IDs", () => {
    expect(parseChainId(11155111)).toBe(11155111);
    expect(parseChainId("11155111")).toBe(11155111);
    expect(parseChainId("0xaa36a7")).toBe(11155111);
    expect(parseChainId(" 0xaa36a7 ")).toBe(11155111);
    expect(() => {
      parseChainId("0xA A36A7");
    }).toThrow(AuthProtocolError);
    expect(() => {
      parseChainId("1115.5111");
    }).toThrow(AuthProtocolError);
  });
});
