import { verifyMessage, getAddress } from "ethers";
import { cookies } from "next/headers";

import {
  AUTH_NONCE_TTL_SECONDS,
  AUTH_SESSION_COOKIE,
  AUTH_SESSION_TTL_SECONDS,
  type AuthRole,
  type AuthSession,
  getAuthStore,
} from "./auth-store";

export class AuthProtocolError extends Error {
  constructor(
    public readonly code:
      | "INVALID_ADDRESS"
      | "INVALID_CHAIN_ID"
      | "UNSUPPORTED_CHAIN"
      | "INVALID_ORIGIN"
      | "INVALID_CONFIGURATION"
      | "INVALID_SIGNATURE",
    message: string,
  ) {
    super(message);
    this.name = "AuthProtocolError";
  }
}

export interface PublicAuthSession {
  accountId: string;
  address: string;
  role: AuthRole;
  expiresAt: string;
}

export class AuthorizationError extends Error {
  constructor(
    public readonly code: "AUTH_REQUIRED" | "ROLE_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function normalizeAddress(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AuthProtocolError(
      "INVALID_ADDRESS",
      "A wallet address is required.",
    );
  }
  try {
    return getAddress(value).toLowerCase();
  } catch {
    throw new AuthProtocolError(
      "INVALID_ADDRESS",
      "The wallet address is not a valid EVM address.",
    );
  }
}

export function parseChainId(value: unknown): number {
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    (typeof value === "string" && !value.trim())
  ) {
    throw new AuthProtocolError(
      "INVALID_CHAIN_ID",
      "A wallet chain ID is required.",
    );
  }
  const normalized = typeof value === "string" ? value.trim() : value;
  const parsed =
    typeof normalized === "number"
      ? normalized
      : normalized.startsWith("0x")
        ? Number.parseInt(normalized, 16)
        : Number(normalized);
  if (typeof normalized === "string") {
    if (
      normalized.startsWith("0x")
        ? !/^0x[0-9a-fA-F]+$/.test(normalized)
        : !/^[0-9]+$/.test(normalized)
    ) {
      throw new AuthProtocolError(
        "INVALID_CHAIN_ID",
        "The wallet chain ID is invalid.",
      );
    }
  }
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new AuthProtocolError(
      "INVALID_CHAIN_ID",
      "The wallet chain ID is invalid.",
    );
  }
  return parsed;
}

export function configuredAuthChainId(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.AUTH_CHAIN_ID?.trim() || "11155111";
  return parseChainId(raw);
}

export function configuredNonceTtlSeconds(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return positiveSeconds(
    env.AUTH_NONCE_TTL_SECONDS,
    AUTH_NONCE_TTL_SECONDS,
    "AUTH_NONCE_TTL_SECONDS",
  );
}

export function configuredSessionTtlSeconds(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return positiveSeconds(
    env.AUTH_SESSION_TTL_SECONDS,
    AUTH_SESSION_TTL_SECONDS,
    "AUTH_SESSION_TTL_SECONDS",
  );
}

function positiveSeconds(
  raw: string | undefined,
  fallback: number,
  name: string,
): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 31_536_000) {
    throw new AuthProtocolError(
      "INVALID_CONFIGURATION",
      `${name} must be a positive number of seconds no larger than one year.`,
    );
  }
  return value;
}

type AuthOriginEnvironment = {
  AUTH_ORIGIN?: string;
  NEXT_PUBLIC_SITE_URL?: string;
};

function configuredOrigin(
  request: Request,
  env: AuthOriginEnvironment = process.env as AuthOriginEnvironment,
): string {
  const configuredAuthOrigin = env.AUTH_ORIGIN?.trim();
  const configuredSiteUrl = env.NEXT_PUBLIC_SITE_URL?.trim();
  const explicit = configuredAuthOrigin || configuredSiteUrl;
  if (explicit) {
    try {
      const url = new URL(explicit);
      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        (url.pathname !== "/" && url.pathname !== "") ||
        url.search ||
        url.hash
      )
        throw new Error();
      return url.origin;
    } catch {
      throw new AuthProtocolError(
        "INVALID_CONFIGURATION",
        `${configuredAuthOrigin ? "AUTH_ORIGIN" : "NEXT_PUBLIC_SITE_URL"} must be an http or https origin.`,
      );
    }
  }

  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const requestUrl = new URL(request.url);
  const protocol = forwardedProto || requestUrl.protocol.replace(":", "");
  const host = forwardedHost || request.headers.get("host") || requestUrl.host;
  return `${protocol}://${host}`;
}

export function requestAuthOrigin(
  request: Request,
  env: AuthOriginEnvironment = process.env as AuthOriginEnvironment,
): string {
  return configuredOrigin(request, env);
}

export function isTrustedAuthOrigin(
  request: Request,
  env: AuthOriginEnvironment = process.env as AuthOriginEnvironment,
): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === configuredOrigin(request, env);
}

export function buildSignInMessage(input: {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}): string {
  return `${input.domain} wants you to sign in with your Ethereum account:\n${input.address}\n\n${input.statement}\n\nURI: ${input.uri}\nVersion: 1\nChain ID: ${input.chainId}\nNonce: ${input.nonce}\nIssued At: ${input.issuedAt}\nExpiration Time: ${input.expirationTime}`;
}

export function authCookieOptions(request: Request, maxAge: number) {
  const secureOverride = process.env.AUTH_SECURE_COOKIE?.trim();
  const secure =
    secureOverride === "true"
      ? true
      : secureOverride === "false"
        ? false
        : configuredOrigin(request).startsWith("https://");
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function publicAuthSession(session: AuthSession): PublicAuthSession {
  return {
    accountId: session.accountId,
    address: session.address,
    role: session.role,
    expiresAt: session.expiresAt,
  };
}

export function roleForAddress(
  address: string,
  env: NodeJS.ProcessEnv = process.env,
): AuthRole {
  const operatorAddresses = (env.AUTH_OPERATOR_ADDRESSES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return normalizeAddress(value);
      } catch {
        return null;
      }
    })
    .filter((value): value is string => value !== null);
  return operatorAddresses.includes(address.toLowerCase())
    ? "operator"
    : "viewer";
}

export async function currentAuthSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  return token ? getAuthStore().getSession(token) : null;
}

export async function requirePrivilegedSession(
  action: string,
  requiredRole: AuthRole = "operator",
): Promise<AuthSession> {
  const session = await currentAuthSession();
  if (!session) {
    getAuthStore().recordAudit({
      eventType: "PRIVILEGED_ACTION",
      address: null,
      accountId: null,
      sessionIdHash: null,
      action,
      success: false,
      metadata: { code: "AUTH_REQUIRED", requiredRole },
    });
    throw new AuthorizationError(
      "AUTH_REQUIRED",
      "A verified server session is required for this action.",
    );
  }
  if (requiredRole === "operator" && session.role !== "operator") {
    auditPrivilegedAction(session, action, false, {
      code: "ROLE_REQUIRED",
      requiredRole,
    });
    throw new AuthorizationError(
      "ROLE_REQUIRED",
      "This action requires an operator role.",
    );
  }
  return session;
}

export function recoverSignedAddress(
  message: string,
  signature: string,
): string {
  try {
    return normalizeAddress(verifyMessage(message, signature));
  } catch {
    throw new AuthProtocolError(
      "INVALID_SIGNATURE",
      "The wallet signature could not be verified.",
    );
  }
}

export function auditPrivilegedAction(
  session: AuthSession,
  action: string,
  success: boolean,
  metadata?: Record<string, unknown>,
): void {
  const event = {
    eventType: "PRIVILEGED_ACTION",
    address: session.address,
    accountId: session.accountId,
    sessionIdHash: session.sessionIdHash,
    action,
    success,
  } as const;
  getAuthStore().recordAudit(
    metadata === undefined ? event : { ...event, metadata },
  );
}
