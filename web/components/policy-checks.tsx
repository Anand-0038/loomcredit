import { Check, Minus, X } from "@phosphor-icons/react/dist/ssr";

import type { PolicyEvaluation } from "@loomcredit/shared";

export function PolicyChecks({ evaluation }: { evaluation: PolicyEvaluation }) {
  const passed = evaluation.checks.filter(
    (check) => check.status === "PASS",
  ).length;
  const notRequested = evaluation.checks.filter(
    (check) => check.status === "NOT_APPLICABLE",
  ).length;
  const applicable = evaluation.checks.length - notRequested;
  return (
    <div className="checks" aria-live="polite">
      <div className="checks-heading">
        <h3>RiskGuard policy checks</h3>
        <span>
          {passed}/{applicable} passed
          {notRequested > 0 ? ` · ${notRequested} not requested` : ""}
        </span>
      </div>
      {evaluation.checks.map((check) => {
        const pass = check.status === "PASS";
        const notApplicable = check.status === "NOT_APPLICABLE";
        return (
          <div
            className={`check-row${pass ? "" : notApplicable ? " not-applicable" : " fail"}`}
            key={check.id}
          >
            <span className="check-icon" aria-hidden="true">
              {pass ? (
                <Check size={14} weight="bold" aria-hidden="true" />
              ) : notApplicable ? (
                <Minus size={14} weight="bold" aria-hidden="true" />
              ) : (
                <X size={14} weight="bold" aria-hidden="true" />
              )}
            </span>
            <span className="check-label">{check.label}</span>
            <span className="check-detail">
              {check.actual} / {check.limit}
            </span>
          </div>
        );
      })}
    </div>
  );
}
