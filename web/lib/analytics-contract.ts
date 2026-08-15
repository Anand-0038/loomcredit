export const ANALYTICS_CONSENT_STORAGE_KEY = "loomcredit_analytics_consent";

export type AnalyticsConsent = "granted" | "denied";

export type AnalyticsSurface =
  | "home"
  | "demo"
  | "security"
  | "docs"
  | "whitepaper"
  | "access"
  | "order"
  | "proof"
  | "legal"
  | "privacy"
  | "terms"
  | "cookies"
  | "other";

export type DemoMode = "safe" | "unsafe" | "cancelled";
export type DemoOutcome = "approved" | "rejected" | "refer" | "error";
export type FeedStatus =
  "connected" | "not_configured" | "unavailable" | "empty";
export type WalletFlowOutcome =
  "started" | "connected" | "signed_in" | "rejected" | "failed";

export type AnalyticsEvent =
  | {
      name: "loomcredit_page_viewed";
      properties: { surface: AnalyticsSurface };
    }
  | {
      name: "loomcredit_demo_scenario_run";
      properties: {
        mode: DemoMode;
        outcome: DemoOutcome;
        boundary: "local_fixture_only";
      };
    }
  | {
      name: "loomcredit_feed_status_viewed";
      properties: { status: FeedStatus };
    }
  | {
      name: "loomcredit_feed_refreshed";
      properties: { status: FeedStatus };
    }
  | {
      name: "loomcredit_wallet_flow";
      properties: {
        stage: "connection" | "sign_in";
        outcome: WalletFlowOutcome;
      };
    }
  | {
      name: "loomcredit_analytics_consent_granted";
      properties: { source: "banner" | "privacy" };
    };

const SURFACES: Array<[string, AnalyticsSurface]> = [
  ["/", "home"],
  ["/demo", "demo"],
  ["/security", "security"],
  ["/docs", "docs"],
  ["/whitepaper", "whitepaper"],
  ["/access", "access"],
  ["/legal", "legal"],
  ["/privacy", "privacy"],
  ["/terms", "terms"],
  ["/cookies", "cookies"],
];

export function analyticsSurface(pathname: string): AnalyticsSurface {
  const normalized = pathname.split("?", 1)[0] || "/";
  const exact = SURFACES.find(([path]) => path === normalized);
  if (exact) return exact[1];
  if (normalized.startsWith("/orders/")) return "order";
  if (normalized.startsWith("/proof/")) return "proof";
  if (normalized.startsWith("/docs/")) return "docs";
  return "other";
}

export function readAnalyticsConsent(
  storage: Pick<Storage, "getItem"> | undefined,
): AnalyticsConsent | null {
  if (!storage) return null;
  const value = storage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
  return value === "granted" || value === "denied" ? value : null;
}

export function isAnalyticsEnabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}
