import { NextResponse } from "next/server";
import { z } from "zod";

import {
  authCookieOptions,
  AuthProtocolError,
  configuredAuthChainId,
  configuredSessionTtlSeconds,
  isTrustedAuthOrigin,
  normalizeAddress,
  parseChainId,
  publicAuthSession,
  recoverSignedAddress,
  roleForAddress,
} from "../../../../lib/auth";
import {
  AUTH_SESSION_COOKIE,
  AuthStoreError,
  getAuthStore,
} from "../../../../lib/auth-store";
import { readJsonBody, RequestBodyError } from "../../../../lib/request-body";
import { consumeRateLimit } from "../../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InputSchema = z.object({
  address: z.string().min(1).max(128),
  chainId: z.union([z.string(), z.number()]),
  nonce: z.string().regex(/^[a-f0-9]{32}$/i),
  message: z.string().min(1).max(4_096),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

function errorResponse(
  code: string,
  error: string,
  status: 400 | 401 | 403 | 409 | 413 | 429 | 500,
  retryAfterSeconds?: number,
) {
  return NextResponse.json(
    { boundary: "AUTHENTICATION", code, error },
    {
      status,
      headers: {
        "cache-control": "no-store",
        ...(retryAfterSeconds
          ? { "retry-after": String(retryAfterSeconds) }
          : {}),
      },
    },
  );
}

export async function POST(request: Request) {
  try {
    if (!isTrustedAuthOrigin(request)) {
      return errorResponse(
        "ORIGIN_REJECTED",
        "This authentication request did not come from the configured application origin.",
        403,
      );
    }
  } catch (error) {
    if (error instanceof AuthProtocolError) {
      return errorResponse("AUTH_CONFIGURATION", error.message, 500);
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    if (error instanceof RequestBodyError && error.code === "TOO_LARGE") {
      return errorResponse("REQUEST_TOO_LARGE", error.message, 413);
    }
    return errorResponse("INVALID_REQUEST", "Expected a JSON body.", 400);
  }
  const input = InputSchema.safeParse(body);
  if (!input.success) {
    return errorResponse(
      "INVALID_REQUEST",
      "address, chainId, nonce, message, and signature are required.",
      400,
    );
  }

  const store = getAuthStore();
  let address: string;
  let chainId: number;
  try {
    address = normalizeAddress(input.data.address);
    chainId = parseChainId(input.data.chainId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid wallet data.";
    return errorResponse("INVALID_REQUEST", message, 400);
  }

  if (chainId !== configuredAuthChainId()) {
    return errorResponse(
      "UNSUPPORTED_CHAIN",
      `Switch the wallet to chain ${configuredAuthChainId()} before signing in.`,
      400,
    );
  }

  const rateLimit = consumeRateLimit(`verify:${address}`, {
    maxRequests: 8,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return errorResponse(
      "RATE_LIMITED",
      "Too many sign-in verification attempts. Try again later.",
      429,
      rateLimit.retryAfterSeconds,
    );
  }

  let claimedNonce;
  try {
    claimedNonce = store.claimNonce(
      input.data.nonce,
      address,
      input.data.message,
    );
  } catch (error) {
    const authError = error instanceof AuthStoreError ? error : null;
    const status =
      authError?.code === "NONCE_USED" || authError?.code === "NONCE_CLAIMED"
        ? 409
        : 401;
    store.recordAudit({
      eventType: "AUTH_SIGN_IN_FAILED",
      address,
      accountId: null,
      sessionIdHash: null,
      action: "auth.sign_in.verify_nonce",
      success: false,
      metadata: { code: authError?.code ?? "NONCE_INVALID", chainId },
    });
    return errorResponse(
      authError?.code ?? "NONCE_INVALID",
      authError?.message ?? "The sign-in nonce is invalid.",
      status,
    );
  }

  let recoveredAddress: string;
  try {
    recoveredAddress = recoverSignedAddress(
      claimedNonce.message,
      input.data.signature,
    );
  } catch (error) {
    store.recordAudit({
      eventType: "AUTH_SIGN_IN_FAILED",
      address,
      accountId: null,
      sessionIdHash: null,
      action: "auth.sign_in.verify_signature",
      success: false,
      metadata: { code: "INVALID_SIGNATURE", chainId },
    });
    return errorResponse(
      "INVALID_SIGNATURE",
      error instanceof Error
        ? error.message
        : "The wallet signature is invalid.",
      401,
    );
  }

  if (recoveredAddress !== address) {
    store.recordAudit({
      eventType: "AUTH_SIGN_IN_FAILED",
      address,
      accountId: null,
      sessionIdHash: null,
      action: "auth.sign_in.address_match",
      success: false,
      metadata: { code: "ADDRESS_MISMATCH", chainId },
    });
    return errorResponse(
      "ADDRESS_MISMATCH",
      "The signature was created by a different wallet address.",
      401,
    );
  }

  if (!store.markNonceUsed(input.data.nonce)) {
    store.recordAudit({
      eventType: "AUTH_SIGN_IN_FAILED",
      address,
      accountId: null,
      sessionIdHash: null,
      action: "auth.sign_in.replay_check",
      success: false,
      metadata: { code: "NONCE_REPLAY", chainId },
    });
    return errorResponse(
      "NONCE_REPLAY",
      "This sign-in nonce has already been used.",
      409,
    );
  }

  try {
    const account = store.findOrCreateAccount(address, roleForAddress(address));
    const { token, session } = store.createSession(
      account,
      configuredSessionTtlSeconds(),
    );
    store.recordAudit({
      eventType: "AUTH_SIGN_IN_SUCCEEDED",
      address,
      accountId: account.accountId,
      sessionIdHash: session.sessionIdHash,
      action: "auth.sign_in",
      success: true,
      metadata: { chainId, role: account.role },
    });

    const response = NextResponse.json(
      {
        boundary: "AUTHENTICATION",
        authenticated: true,
        user: publicAuthSession(session),
      },
      { headers: { "cache-control": "no-store" } },
    );
    response.cookies.set({
      name: AUTH_SESSION_COOKIE,
      value: token,
      ...authCookieOptions(request, configuredSessionTtlSeconds()),
    });
    return response;
  } catch (error) {
    store.recordAudit({
      eventType: "AUTH_SIGN_IN_FAILED",
      address,
      accountId: null,
      sessionIdHash: null,
      action: "auth.sign_in.session_create",
      success: false,
      metadata: { code: "SESSION_CREATE_FAILED", chainId },
    });
    return errorResponse(
      "SESSION_CREATE_FAILED",
      error instanceof Error
        ? error.message
        : "The server could not create a session.",
      500,
    );
  }
}
