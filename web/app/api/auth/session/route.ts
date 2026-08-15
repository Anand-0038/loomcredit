import { NextResponse } from "next/server";

import { currentAuthSession, publicAuthSession } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await currentAuthSession();
  return NextResponse.json(
    session
      ? {
          boundary: "AUTHENTICATION",
          authenticated: true,
          user: publicAuthSession(session),
        }
      : { boundary: "AUTHENTICATION", authenticated: false, user: null },
    { headers: { "cache-control": "no-store" } },
  );
}
