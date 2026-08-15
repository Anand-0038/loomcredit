import type { FacilityQuote, PolicyEvaluation } from "@loomcredit/shared";

import { shortenId } from "../lib/demo-data";

export function DecisionTrace({
  quote,
  evaluation,
  boundary,
}: {
  quote: FacilityQuote;
  evaluation: PolicyEvaluation;
  boundary: string;
}) {
  const fixture = boundary.startsWith("LOCAL_");
  const passed = evaluation.checks.filter(
    (check) => check.status === "PASS",
  ).length;
  const notRequested = evaluation.checks.filter(
    (check) => check.status === "NOT_APPLICABLE",
  ).length;
  const applicable = evaluation.checks.length - notRequested;
  const evidenceId = quote.evidenceIds[0];
  const decisionPass = evaluation.decision === "APPROVED";

  return (
    <section className="decision-trace" aria-labelledby="decision-trace-title">
      <div className="decision-trace-header">
        <div>
          <span className="eyebrow">Judge-readable handoff</span>
          <h3 id="decision-trace-title">Decision trace</h3>
        </div>
        <code className="boundary-code">{boundary}</code>
      </div>
      <p className="decision-trace-intro">
        Follow the proposal from its evidence binding to the action gate. Every
        step is labeled so a local result cannot be mistaken for a provider
        response or an on-chain receipt.
      </p>
      <ol className="decision-trace-list">
        <li className="decision-trace-item">
          <span className="decision-trace-index" aria-hidden="true">
            01
          </span>
          <div>
            <span className="decision-trace-label">Evidence input</span>
            <strong>
              {fixture ? "Fixture packet" : "Registered evidence"}
            </strong>
            <small>
              {evidenceId
                ? `Bound ID ${shortenId(evidenceId)}`
                : "No evidence ID"}
              {fixture ? " · no browser USC call" : " · provider boundary"}
            </small>
          </div>
          <span
            className={`decision-trace-status ${fixture ? "fixture" : "live"}`}
          >
            {fixture ? "FIXTURE" : "LIVE"}
          </span>
        </li>
        <li className="decision-trace-item">
          <span className="decision-trace-index" aria-hidden="true">
            02
          </span>
          <div>
            <span className="decision-trace-label">Structured proposal</span>
            <strong>
              {quote.decision} · tier {quote.riskTier}
            </strong>
            <small>
              Contract {quote.modelVersion} · {quote.advanceBps / 100}% advance
              · {quote.feeBps / 100}% fee
            </small>
          </div>
          <span
            className={`decision-trace-status ${fixture ? "fixture" : "live"}`}
          >
            {fixture ? "FIXTURE" : "DECLARED"}
          </span>
        </li>
        <li className="decision-trace-item">
          <span className="decision-trace-index" aria-hidden="true">
            03
          </span>
          <div>
            <span className="decision-trace-label">Deterministic policy</span>
            <strong>
              {passed}/{applicable} checks pass
              {notRequested > 0 ? ` · ${notRequested} not requested` : ""}
            </strong>
            <small>
              Policy {quote.policyVersion} · {quote.reasonCodes.join(" · ")}
            </small>
          </div>
          <span
            className={`decision-trace-status ${decisionPass ? "pass" : "next"}`}
          >
            {decisionPass ? "PASS" : evaluation.decision}
          </span>
        </li>
        <li className="decision-trace-item">
          <span className="decision-trace-index" aria-hidden="true">
            04
          </span>
          <div>
            <span className="decision-trace-label">Execution gate</span>
            <strong>
              {fixture ? "Signature not requested" : "Signed quote required"}
            </strong>
            <small>
              {fixture
                ? "No wallet, model provider, or RiskGuard transaction is used by this lab."
                : "Recover the allowlisted signer before a RiskGuard call."}
            </small>
          </div>
          <span className="decision-trace-status next">
            {fixture ? "NOT_REQUESTED" : "NEXT_GATE"}
          </span>
        </li>
      </ol>
    </section>
  );
}
