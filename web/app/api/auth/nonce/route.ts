import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  buildSignInMessage,
  configuredAuthChainId,
  configuredNonceTtlSeconds,
  AuthProtocolError,
  isTrustedAuthOrigin,
  normalizeAddress,
  parseChainId,
  requestAuthOrigin,
} from "../../../../lib/auth";
import { getAuthStore } from "../../../../lib/auth-store";
import { readJsonBody, RequestBodyError } from "../../../../lib/request-body";
import { consumeRateLimit } from "../../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InputSchema = z.object({
  address: z.string().min(1).max(128),
  chainId: z.union([z.string(), z.number()]),
});

function errorResponse(
  code: string,
  error: string,
  status: 400 | 403 | 413 | 429 | 500,
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
      "address and chainId are required.",
      400,
    );
  }

  try {
    const address = normalizeAddress(input.data.address);
    const chainId = parseChainId(input.data.chainId);
    const rateLimit = consumeRateLimit(`nonce:${address}`, {
      maxRequests: 5,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      return errorResponse(
        "RATE_LIMITED",
        "Too many sign-in nonce requests. Try again later.",
        429,
        rateLimit.retryAfterSeconds,
      );
    }
    const configuredChainId = configuredAuthChainId();
    if (chainId !== configuredChainId) {
      return errorResponse(
        "UNSUPPORTED_CHAIN",
        `Switch the wallet to chain ${configuredChainId} before signing in.`,
        400,
      );
    }

    const issuedAt = new Date();
    const expiresAt = new Date(
      issuedAt.getTime() + configuredNonceTtlSeconds() * 1_000,
    );
    const origin = requestAuthOrigin(request);
    const nonce = randomBytes(16).toString("hex");
    const message = buildSignInMessage({
      domain: new URL(origin).host,
      address,
      statement:
        "Sign in to LoomCredit to inspect governed underwriting evidence.",
      uri: `${origin}/access`,
      chainId,
      nonce,
      issuedAt: issuedAt.toISOString(),
      expirationTime: expiresAt.toISOString(),
    });
    const authStore = getAuthStore();
    authStore.pruneExpiredNonces(issuedAt);
    authStore.createNonce({
      nonce,
      address,
      chainId,
      message,
      issuedAt,
      expiresAt,
    });
    authStore.recordAudit({
      eventType: "AUTH_NONCE_ISSUED",
      address,
      accountId: null,
      sessionIdHash: null,
      action: "auth.nonce.issue",
      success: true,
      metadata: { chainId },
    });

    return NextResponse.json(
      {
        boundary: "AUTHENTICATION",
        nonce,
        message,
        chainId,
        expiresAt: expiresAt.toISOString(),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Authentication configuration is invalid.";
    return errorResponse("AUTH_CONFIGURATION", message, 500);
  }
}
