import liveEvidence from "../../docs/demo-evidence.json";

export const LIVE_EVIDENCE_BOUNDARY = "LIVE_EVIDENCE_STATUS_API" as const;

/**
 * Resolve the worker status URL on the server. The server-only variable is
 * preferred so browsers do not need to reach a private worker host directly.
 * The public variable remains a compatibility fallback for local setups.
 */
export function resolveLiveEvidenceApiUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const configuredUrl =
    env.LIVE_EVIDENCE_API_URL?.trim() ||
    env.NEXT_PUBLIC_LIVE_EVIDENCE_API_URL?.trim();
  if (!configuredUrl) return null;

  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.search = "";
    const normalizedPath = url.pathname
      .replace(/\/+$/, "")
      .replace(/(?:\/v1(?:\/orders)?)+$/, "");
    url.pathname = normalizedPath;
    if (!url.pathname) {
      url.pathname = "";
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export { liveEvidence };
