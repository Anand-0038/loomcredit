import { parseLiveOrdersResponse } from "./live-evidence-schema";

const HEALTH_TIMEOUT_MS = 2_000;

export type LiveEvidenceUpstreamStatus =
  "reachable" | "unavailable" | "invalid";

export interface LiveEvidenceHealth {
  upstream: LiveEvidenceUpstreamStatus;
  latestVerifiedOrder: string | null;
}

export async function readLiveEvidenceHealth(
  upstreamUrl: string,
): Promise<LiveEvidenceHealth> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(`${upstreamUrl}/v1/orders`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return { upstream: "unavailable", latestVerifiedOrder: null };
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { upstream: "invalid", latestVerifiedOrder: null };
    }
    const parsed = parseLiveOrdersResponse(payload);
    if (!parsed) {
      return { upstream: "invalid", latestVerifiedOrder: null };
    }
    let latestVerifiedOrder: string | null = null;
    let latestUpdatedAt: string | null = null;
    for (const order of parsed.orders) {
      if (order.proofStatus !== "LIVE_VERIFIED") continue;
      if (latestUpdatedAt === null || order.updatedAt > latestUpdatedAt) {
        latestUpdatedAt = order.updatedAt;
        latestVerifiedOrder = order.orderId;
      }
    }
    return {
      upstream: "reachable",
      latestVerifiedOrder,
    };
  } catch {
    return { upstream: "unavailable", latestVerifiedOrder: null };
  } finally {
    clearTimeout(timeout);
  }
}
