"use client";

import { useState } from "react";

import { DEMO_SAFE_QUOTE } from "@loomcredit/shared";
import type { FacilityQuote, PolicyEvaluation } from "@loomcredit/shared";

import { demoEvaluation } from "../lib/demo-data";
import { captureAnalytics } from "../lib/analytics-client";

import { QuoteCard } from "./quote-card";

type DemoMode = "safe" | "unsafe" | "cancelled";

const DEMO_REQUEST_TIMEOUT_MS = 5_000;

interface DemoResponse {
  boundary: string;
  quote: FacilityQuote;
  policy: PolicyEvaluation;
}

export function DemoLab() {
  const [mode, setMode] = useState<DemoMode>("safe");
  const [result, setResult] = useState<DemoResponse>({
    boundary: "LOCAL_FIXTURE_ONLY",
    quote: DEMO_SAFE_QUOTE,
    policy: demoEvaluation,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function evaluate(nextMode: DemoMode) {
    setMode(nextMode);
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      DEMO_REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await fetch("/api/demo/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
        signal: controller.signal,
      });
      const body: unknown = await response.json();
      if (!response.ok || !isDemoResponse(body)) {
        throw new Error(
          "The local evaluation endpoint did not return a valid result.",
        );
      }
      setResult(body);
      captureAnalytics({
        name: "loomcredit_demo_scenario_run",
        properties: {
          mode: nextMode,
          outcome: demoOutcome(body.policy.decision),
          boundary: "local_fixture_only",
        },
      });
    } catch (caught) {
      captureAnalytics({
        name: "loomcredit_demo_scenario_run",
        properties: {
          mode: nextMode,
          outcome: "error",
          boundary: "local_fixture_only",
        },
      });
      setError(
        caught instanceof DOMException && caught.name === "AbortError"
          ? "Local evaluation timed out. Try the scenario again."
          : caught instanceof Error
            ? caught.message
            : "Local evaluation failed.",
      );
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }

  return (
    <div className="demo-lab">
      <aside className="demo-controls" aria-labelledby="demo-controls-title">
        <div className="demo-section-label">
          <span className="eyebrow">Local policy lab</span>
          <code className="boundary-code">LOCAL_FIXTURE</code>
        </div>
        <h2 id="demo-controls-title">Pressure-test the policy boundary.</h2>
        <p>
          Each scenario uses the same evidence packet and changes one input. The
          unsafe proposal crosses the advance cap; the cancelled order fails the
          lifecycle check.
        </p>
        <div
          className="mode-switch"
          role="group"
          aria-label="Choose local quote scenario"
        >
          <button
            className="mode-button"
            type="button"
            aria-pressed={mode === "safe"}
            onClick={() => void evaluate("safe")}
            disabled={loading}
          >
            Safe proposal
            <small>30% requested advance</small>
          </button>
          <button
            className="mode-button"
            type="button"
            aria-pressed={mode === "unsafe"}
            onClick={() => void evaluate("unsafe")}
            disabled={loading}
          >
            Unsafe proposal
            <small>80% requested advance</small>
          </button>
          <button
            className="mode-button"
            type="button"
            aria-pressed={mode === "cancelled"}
            onClick={() => void evaluate("cancelled")}
            disabled={loading}
          >
            Cancelled order
            <small>lifecycle invalidation</small>
          </button>
        </div>
        <div className="boundary-note" role="note" aria-live="polite">
          <span className="boundary-note-marker" aria-hidden="true">
            ◆
          </span>
          <span>
            <strong>
              {loading ? "Evaluating locally…" : "Execution boundary"}
            </strong>
            <small>
              {loading
                ? "The policy engine is checking the selected quote."
                : "One same-origin policy API call; no wallet, model provider, proof builder, or blockchain transaction is used."}
            </small>
          </span>
        </div>
        {error ? (
          <div className="demo-error" role="alert">
            <p>{error}</p>
            <button
              className="button button-secondary button-small demo-retry"
              type="button"
              onClick={() => void evaluate(mode)}
              disabled={loading}
            >
              Try again
            </button>
          </div>
        ) : null}
      </aside>
      <QuoteCard
        quote={result.quote}
        evaluation={result.policy}
        boundary={result.boundary}
      />
    </div>
  );
}

function demoOutcome(
  decision: PolicyEvaluation["decision"],
): "approved" | "rejected" | "refer" {
  if (decision === "APPROVED") return "approved";
  if (decision === "REJECTED") return "rejected";
  return "refer";
}

function isDemoResponse(value: unknown): value is DemoResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DemoResponse>;
  return (
    typeof candidate.boundary === "string" &&
    Boolean(candidate.quote) &&
    Boolean(candidate.policy)
  );
}
