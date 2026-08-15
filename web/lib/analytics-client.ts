"use client";

import posthog, { type CaptureResult } from "posthog-js";

import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  isAnalyticsEnabled,
  readAnalyticsConsent,
  type AnalyticsConsent,
  type AnalyticsEvent,
} from "./analytics-contract";

let initialized = false;
let consentSnapshot: AnalyticsConsent | null | "pending" = "pending";
let consentHydrated = false;
const consentListeners = new Set<() => void>();

const EVENT_PROPERTY_KEYS: Record<AnalyticsEvent["name"], readonly string[]> = {
  loomcredit_page_viewed: ["surface"],
  loomcredit_demo_scenario_run: ["mode", "outcome", "boundary"],
  loomcredit_feed_status_viewed: ["status"],
  loomcredit_feed_refreshed: ["status"],
  loomcredit_wallet_flow: ["stage", "outcome"],
  loomcredit_analytics_consent_granted: ["source"],
};

export function isAnalyticsConfigured(): boolean {
  return (
    isAnalyticsEnabled(process.env.NEXT_PUBLIC_ANALYTICS_ENABLED) &&
    Boolean(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim())
  );
}

export function browserAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === "undefined") return null;

  try {
    return readAnalyticsConsent(window.localStorage);
  } catch {
    return null;
  }
}

export function analyticsConsentSnapshot():
  AnalyticsConsent | null | "pending" {
  return consentSnapshot;
}

export function subscribeToAnalyticsConsent(listener: () => void): () => void {
  if (!consentHydrated && typeof window !== "undefined") {
    consentHydrated = true;
    consentSnapshot = browserAnalyticsConsent();
  }

  consentListeners.add(listener);
  return () => consentListeners.delete(listener);
}

export function saveBrowserAnalyticsConsent(consent: AnalyticsConsent): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, consent);
    consentSnapshot = consent;
    for (const listener of consentListeners) listener();
  } catch {
    // A blocked storage API should fail closed; analytics remains disabled.
  }
}

export function initializeAnalytics(): boolean {
  if (
    initialized ||
    !isAnalyticsConfigured() ||
    browserAnalyticsConsent() !== "granted"
  ) {
    return initialized;
  }

  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
  if (!token) return false;

  posthog.init(token, {
    api_host:
      process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ||
      "https://eu.i.posthog.com",
    defaults: "2026-05-30",
    autocapture: false,
    rageclick: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    disable_external_dependency_loading: true,
    disable_persistence: true,
    persistence: "memory",
    person_profiles: "never",
    ip: false,
    capture_performance: false,
    opt_out_capturing_by_default: true,
    opt_out_persistence_by_default: true,
    before_send: sanitizePostHogEvent,
  });
  posthog.opt_in_capturing({ captureEventName: false });
  initialized = true;
  return true;
}

export function stopAnalytics(): void {
  if (!initialized) return;
  posthog.opt_out_capturing();
  initialized = false;
}

export function captureAnalytics(event: AnalyticsEvent): void {
  if (!initialized || browserAnalyticsConsent() !== "granted") return;
  posthog.capture(event.name, event.properties);
}

export function sanitizePostHogEvent(
  event: CaptureResult | null,
): CaptureResult | null {
  if (!event) return null;

  const eventName = event.event as AnalyticsEvent["name"];
  const allowedKeys = EVENT_PROPERTY_KEYS[eventName];
  if (!allowedKeys) return null;

  const allowed = new Set(allowedKeys);
  const properties: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(event.properties)) {
    if (
      allowed.has(key) &&
      (typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean")
    ) {
      properties[key] = value;
    }
  }

  const {
    $set: _set,
    $set_once: _setOnce,
    $unset: _unset,
    ...eventWithoutPersonProperties
  } = event;

  return { ...eventWithoutPersonProperties, properties };
}
