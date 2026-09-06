import liveEvidence from "../../docs/demo-evidence.json";

export const LIVE_EVIDENCE_BOUNDARY = "LIVE_EVIDENCE_STATUS_API" as const;

type LiveEvidenceManifest = typeof liveEvidence;

const TRANSACTION_HASH = /^0x[a-fA-F0-9]{64}$/;

function recordedApprovalReceipt(
  evidence: LiveEvidenceManifest,
): { explorer: string; transactionHash: string } | null {
  const submission = evidence.agent?.signing?.submission;
  if (
    evidence.agent?.status !== "RISKGUARD_APPROVED" ||
    submission?.status !== "APPROVED" ||
    typeof submission.transactionHash !== "string" ||
    !TRANSACTION_HASH.test(submission.transactionHash) ||
    typeof submission.explorer !== "string"
  ) {
    return null;
  }

  try {
    const explorer = new URL(submission.explorer);
    if (explorer.protocol !== "https:") return null;
  } catch {
    return null;
  }

  return {
    explorer: submission.explorer,
    transactionHash: submission.transactionHash,
  };
}

/**
 * The generated manifest may contain a model/signing summary in addition to
 * the source-to-USC packet. Keep this check in one place so the UI cannot
 * claim that RiskGuard is still pending after a recorded approval receipt has
 * been attached.
 */
export function hasRecordedRiskGuardApproval(
  evidence: LiveEvidenceManifest = liveEvidence,
): boolean {
  return recordedApprovalReceipt(evidence) !== null;
}

export function recordedRiskGuardReceipt(): {
  explorer: string;
  transactionHash: string;
} | null {
  return recordedApprovalReceipt(liveEvidence);
}

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
