import {
  ArrowUpRight,
  CheckCircle,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import type { FacilityQuote, PolicyEvaluation } from "@loomcredit/shared";

import { formatMinorUnits } from "../lib/demo-data";

import { DecisionTrace } from "./decision-trace";
import { PolicyChecks } from "./policy-checks";

export function QuoteCard({
  quote,
  evaluation,
  boundary = "LOCAL_FIXTURE_ONLY",
}: {
  quote: FacilityQuote;
  evaluation: PolicyEvaluation;
  boundary?: string;
}) {
  const approved = evaluation.decision === "APPROVED";
  const referred = evaluation.decision === "REFER";
  return (
    <div className="demo-output">
      <div className="demo-output-header">
        <div>
          <span className="card-kicker" style={{ color: "var(--teal-dark)" }}>
            Deterministic quote input
          </span>
          <h2 className="quote-card-title">
            Policy decides what moves forward.
          </h2>
        </div>
        <span
          className={`status-pill${approved ? "" : referred ? " refer" : " fail"}`}
        >
          {approved ? (
            <CheckCircle size={14} weight="bold" aria-hidden="true" />
          ) : (
            <WarningCircle size={14} weight="bold" aria-hidden="true" />
          )}
          {approved
            ? "Policy approved"
            : referred
              ? "Human review required"
              : "Policy rejected"}
        </span>
      </div>
      <div className="demo-output-body">
        <div
          className={`decision-banner${approved ? "" : referred ? " referred" : " rejected"}`}
        >
          <div>
            <div className="decision-label">Decision</div>
            <div className="decision-value">
              {approved ? "APPROVE" : referred ? "REFER" : "REJECT"}
            </div>
          </div>
          <div className="quote-amount">
            {formatMinorUnits(evaluation.approvedAdvanceMinor)}
            <small>
              {approved ? "approved advance" : "no capital released"}
            </small>
          </div>
        </div>
        <dl className="data-grid">
          <div className="data-item">
            <dt>Requested advance</dt>
            <dd>{formatMinorUnits(evaluation.requestedAdvanceMinor)}</dd>
          </div>
          <div className="data-item">
            <dt>Fee</dt>
            <dd>{(quote.feeBps / 100).toFixed(2)}%</dd>
          </div>
          <div className="data-item">
            <dt>Risk tier</dt>
            <dd>{quote.riskTier}</dd>
          </div>
          <div className="data-item">
            <dt>Boundary</dt>
            <dd>
              <span>Local fixture</span>
              <code className="boundary-code">{boundary}</code>
            </dd>
          </div>
        </dl>
        <DecisionTrace
          quote={quote}
          evaluation={evaluation}
          boundary={boundary}
        />
        <PolicyChecks evaluation={evaluation} />
        <Link className="text-link quote-card-link" href="/security">
          Read the control boundary{" "}
          <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
