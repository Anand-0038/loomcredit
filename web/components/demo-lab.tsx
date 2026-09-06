"use client";

import { startTransition, useEffect, useState } from "react";

import { DEMO_SAFE_QUOTE } from "@loomcredit/shared";
import type { FacilityQuote, PolicyEvaluation } from "@loomcredit/shared";

import { demoEvaluation } from "../lib/demo-data";
import { captureAnalytics } from "../lib/analytics-client";
import type { DemoTrace } from "../lib/demo-trace";

import { QuoteCard } from "./quote-card";

type DemoMode = "safe" | "unsafe" | "cancelled" | "custom";

interface CustomProposal {
  advanceBps: number;
  deliveryDays: number;
}

const DEMO_REQUEST_TIMEOUT_MS = 5_000;

interface DemoResponse {
  boundary: string;
  quote: FacilityQuote;
  policy: PolicyEvaluation;
  trace: DemoTrace | null;
}

export function DemoLab() {
  const [mode, setMode] = useState<DemoMode>("safe");
  const [customAdvancePercent, setCustomAdvancePercent] = useState("30");
  const [customDeliveryDays, setCustomDeliveryDays] = useState("45");
  const [result, setResult] = useState<DemoResponse>({
    boundary: "LOCAL_FIXTURE_ONLY",
    quote: DEMO_SAFE_QUOTE,
    policy: demoEvaluation,
    trace: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const advance = Number(params.get("advance"));
    const days = Number(params.get("days"));
    startTransition(() => {
      if (Number.isInteger(advance) && advance >= 0 && advance <= 100) {
        setCustomAdvancePercent(String(advance));
      }
      if (Number.isInteger(days) && days >= 0 && days <= 365) {
        setCustomDeliveryDays(String(days));
      }
    });
  }, []);

  async function evaluate(nextMode: DemoMode, customProposal?: CustomProposal) {
    setMode(nextMode);
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      DEMO_REQUEST_TIMEOUT_MS,
    );
    try {
      const requestPayload =
        nextMode === "custom"
          ? {
              mode: nextMode,
              advanceBps:
                customProposal?.advanceBps ??
                Math.round(Number(customAdvancePercent) * 100),
              deliveryDays:
                customProposal?.deliveryDays ?? Number(customDeliveryDays),
            }
          : { mode: nextMode };
      const response = await fetch("/api/demo/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });
      const responseBody: unknown = await response.json();
      if (!response.ok || !isDemoResponse(responseBody)) {
        throw new Error(
          "The local evaluation endpoint did not return a valid result.",
        );
      }
      setResult(responseBody);
      captureAnalytics({
        name: "loomcredit_demo_scenario_run",
        properties: {
          mode: nextMode,
          outcome: demoOutcome(responseBody.policy.decision),
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
        <form
          className="demo-custom-form"
          onSubmit={(event) => {
            event.preventDefault();
            const advance = Number(customAdvancePercent);
            const days = Number(customDeliveryDays);
            if (
              !Number.isInteger(advance) ||
              advance < 0 ||
              advance > 100 ||
              !Number.isInteger(days) ||
              days < 0 ||
              days > 365
            ) {
              setMode("custom");
              setError(
                "Use an advance from 0–100% and delivery from 0–365 days.",
              );
              return;
            }
            void evaluate("custom", {
              advanceBps: advance * 100,
              deliveryDays: days,
            });
          }}
        >
          <div className="demo-custom-heading">
            <span>Try your own proposal</span>
            <code className="boundary-code">FIXTURE INPUT</code>
          </div>
          <div className="demo-custom-grid">
            <label>
              <span>Requested advance</span>
              <div className="demo-custom-input-suffix">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={customAdvancePercent}
                  onChange={(event) =>
                    setCustomAdvancePercent(event.target.value)
                  }
                  aria-label="Custom requested advance percentage"
                />
                <span>%</span>
              </div>
            </label>
            <label>
              <span>Delivery tenor</span>
              <div className="demo-custom-input-suffix">
                <input
                  type="number"
                  min="0"
                  max="365"
                  step="1"
                  value={customDeliveryDays}
                  onChange={(event) =>
                    setCustomDeliveryDays(event.target.value)
                  }
                  aria-label="Custom delivery tenor in days"
                />
                <span>days</span>
              </div>
            </label>
          </div>
          <button
            className="button button-secondary demo-custom-submit"
            type="submit"
            disabled={loading}
          >
            Evaluate this proposal
          </button>
          <p>
            This uses the recorded fixture packet and the local policy engine;
            it is not a live underwriting quote or a capital request.
          </p>
        </form>
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
        trace={result.trace}
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
    Boolean(candidate.policy) &&
    isDemoTrace(candidate.trace)
  );
}

function isDemoTrace(value: unknown): value is DemoTrace {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DemoTrace>;
  return (
    typeof candidate.requestId === "string" &&
    typeof candidate.evaluatedAt === "string" &&
    typeof candidate.evaluationDurationMs === "number" &&
    typeof candidate.inputHash === "string" &&
    candidate.schemaVersion === "fixture-evaluation-v1" &&
    candidate.origin === "FIXTURE" &&
    candidate.boundary === "LOCAL_FIXTURE_ONLY" &&
    typeof candidate.policyVersion === "string"
  );
}
