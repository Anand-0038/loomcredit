"use client";

import { useSyncExternalStore } from "react";

import {
  analyticsConsentSnapshot,
  captureAnalytics,
  initializeAnalytics,
  isAnalyticsConfigured,
  saveBrowserAnalyticsConsent,
  stopAnalytics,
  subscribeToAnalyticsConsent,
} from "../lib/analytics-client";

export function AnalyticsPreferences() {
  const configured = isAnalyticsConfigured();
  const consent = useSyncExternalStore(
    subscribeToAnalyticsConsent,
    analyticsConsentSnapshot,
    () => "pending" as const,
  );

  if (!configured || consent === "pending") return null;

  const enabled = consent === "granted";

  function changePreference() {
    if (enabled) {
      saveBrowserAnalyticsConsent("denied");
      stopAnalytics();
      return;
    }

    saveBrowserAnalyticsConsent("granted");
    if (initializeAnalytics()) {
      captureAnalytics({
        name: "loomcredit_analytics_consent_granted",
        properties: { source: "privacy" },
      });
    }
  }

  return (
    <div className="analytics-preferences">
      <strong>Optional product analytics</strong>
      <p>
        Current status: <b>{enabled ? "enabled" : "disabled"}</b>. This
        preference controls the allow-listed, anonymous PostHog events described
        above.
      </p>
      <button
        className="button button-secondary button-small"
        type="button"
        onClick={changePreference}
      >
        {enabled ? "Disable optional analytics" : "Enable optional analytics"}
      </button>
    </div>
  );
}
