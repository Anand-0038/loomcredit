import { NextResponse } from "next/server";

import {
  AuthProtocolError,
  authCookieOptions,
  requestAuthOrigin,
  isTrustedAuthOrigin,
} from "../../../../lib/auth";
import { AUTH_SESSION_COOKIE, getAuthStore } from "../../../../lib/auth-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    // Validate runtime configuration early, even when the request omits Origin.
    requestAuthOrigin(request);
    if (!isTrustedAuthOrigin(request)) {
      return NextResponse.json(
        {
          boundary: "AUTHENTICATION",
          code: "ORIGIN_REJECTED",
          error:
            "This authentication request did not come from the configured application origin.",
        },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }
  } catch (error) {
    if (error instanceof AuthProtocolError) {
      return NextResponse.json(
        {
          boundary: "AUTHENTICATION",
          code: "AUTH_CONFIGURATION",
          error: error.message,
        },
        { status: 500, headers: { "cache-control": "no-store" } },
      );
    }
    throw error;
  }

  const response = NextResponse.json(
    { boundary: "AUTHENTICATION", authenticated: false },
    { headers: { "cache-control": "no-store" } },
  );
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_SESSION_COOKIE}=`))
    ?.slice(AUTH_SESSION_COOKIE.length + 1);
  if (token) {
    const session = getAuthStore().revokeSession(token);
    if (session) {
      getAuthStore().recordAudit({
        eventType: "AUTH_SIGN_OUT",
        address: session.address,
        accountId: session.accountId,
        sessionIdHash: session.sessionIdHash,
        action: "auth.sign_out",
        success: true,
      });
    }
  }
  response.cookies.set({
    name: AUTH_SESSION_COOKIE,
    value: "",
    ...authCookieOptions(request, 0),
  });
  return response;
}
