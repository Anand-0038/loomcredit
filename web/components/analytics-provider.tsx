"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

import {
  analyticsSurface,
  type AnalyticsConsent,
} from "../lib/analytics-contract";
import {
  captureAnalytics,
  initializeAnalytics,
  isAnalyticsConfigured,
  saveBrowserAnalyticsConsent,
  analyticsConsentSnapshot,
  subscribeToAnalyticsConsent,
} from "../lib/analytics-client";

export function AnalyticsProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const configured = isAnalyticsConfigured();
  const consentSnapshot = useSyncExternalStore(
    subscribeToAnalyticsConsent,
    analyticsConsentSnapshot,
    () => "pending" as const,
  );
  const consent: AnalyticsConsent | null =
    consentSnapshot === "pending" ? null : consentSnapshot;
  const consentLoaded = consentSnapshot !== "pending";

  useEffect(() => {
    if (consent === "granted") initializeAnalytics();
  }, [consent]);

  useEffect(() => {
    if (consent !== "granted") return;
    if (!initializeAnalytics()) return;

    captureAnalytics({
      name: "loomcredit_page_viewed",
      properties: { surface: analyticsSurface(pathname || "/") },
    });
  }, [consent, pathname]);

  function chooseConsent(nextConsent: AnalyticsConsent) {
    saveBrowserAnalyticsConsent(nextConsent);

    if (nextConsent === "granted" && initializeAnalytics()) {
      captureAnalytics({
        name: "loomcredit_analytics_consent_granted",
        properties: { source: "banner" },
      });
    }
  }

  return (
    <>
      {children}
      {configured && consentLoaded && consent === null ? (
        <aside className="analytics-consent" aria-label="Optional analytics">
          <div>
            <strong>Help improve the prototype?</strong>
            <p>
              Optional anonymous analytics can show which product surfaces and
              bounded demo paths are useful. It does not record wallet
              addresses, order or evidence IDs, raw inputs, or session replays.
            </p>
          </div>
          <div className="analytics-consent-actions">
            <button
              className="button button-primary button-small"
              type="button"
              onClick={() => chooseConsent("granted")}
            >
              Allow analytics
            </button>
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => chooseConsent("denied")}
            >
              No thanks
            </button>
          </div>
        </aside>
      ) : null}
    </>
  );
}
