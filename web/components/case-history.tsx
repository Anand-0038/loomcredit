"use client";

import Link from "next/link";
import {
  ArrowClockwise,
  ArrowRight,
  CheckCircle,
  CircleNotch,
  FolderOpen,
  LockKey,
  MagnifyingGlass,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  parsePublicCaseListResponse,
  type PublicCaseListResponse,
} from "../lib/case-status";

const AUTH_CHANGE_EVENT = "loomcredit:auth-change";

type CaseListItem = PublicCaseListResponse["cases"][number];

export function CaseHistory() {
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [reviewFilter, setReviewFilter] = useState("ALL");

  const filteredCases = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return cases.filter((financeCase) => {
      const matchesQuery =
        !normalizedQuery ||
        financeCase.caseId.toLowerCase().includes(normalizedQuery) ||
        financeCase.sourceTxHash.toLowerCase().includes(normalizedQuery);
      const stage = caseStage(financeCase);
      const matchesStage = stageFilter === "ALL" || stage === stageFilter;
      const matchesReview =
        reviewFilter === "ALL" ||
        (reviewFilter === "UNREVIEWED"
          ? financeCase.latestReview === null
          : financeCase.latestReview?.decision === reviewFilter);
      return matchesQuery && matchesStage && matchesReview;
    });
  }, [cases, query, reviewFilter, stageFilter]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/cases", { cache: "no-store" });
      const payload: unknown = await response.json();
      if (response.status === 401 || response.status === 403) {
        setCases([]);
        setSignedOut(true);
        setLoaded(true);
        return;
      }
      const parsed = parsePublicCaseListResponse(payload);
      if (!response.ok || !parsed) {
        throw new Error(readError(payload));
      }
      setCases(parsed.cases);
      setSignedOut(false);
      setLoaded(true);
    } catch (caught) {
      setLoaded(true);
      setError(
        caught instanceof Error
          ? caught.message
          : "The case inbox could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const handleAuthChange = () => void refresh();
    const handleFocus = () => void refresh();
    window.addEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refresh]);

  return (
    <section className="case-inbox" aria-labelledby="case-inbox-title">
      <div className="case-inbox-heading">
        <div>
          <span className="eyebrow">Your case inbox</span>
          <h2 id="case-inbox-title">Continue where you left off.</h2>
          <p>
            Completed proof, retryable failures, and saved proposals stay
            attached to your operator account. Open a case to inspect its latest
            server-owned state.
          </p>
        </div>
        <button
          className="button button-secondary button-small"
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <ArrowClockwise
            size={15}
            weight="bold"
            aria-hidden="true"
            className={loading ? "spin" : undefined}
          />
          {loading ? "Refreshing…" : "Refresh cases"}
        </button>
      </div>

      {loading && !loaded ? (
        <div className="case-inbox-state" aria-busy="true">
          <CircleNotch
            className="spin"
            size={20}
            weight="bold"
            aria-hidden="true"
          />
          <strong>Reading your cases…</strong>
        </div>
      ) : signedOut ? (
        <div className="case-inbox-state case-inbox-state-locked">
          <LockKey size={22} weight="bold" aria-hidden="true" />
          <div>
            <strong>Sign in as an operator to see your cases.</strong>
            <p>
              Cases are private to the wallet account that created them. No case
              data is exposed before server-verified access.
            </p>
          </div>
          <Link className="text-link" href="/access">
            Open wallet access{" "}
            <ArrowRight size={15} weight="bold" aria-hidden="true" />
          </Link>
        </div>
      ) : error ? (
        <div className="case-inbox-state case-inbox-state-error" role="alert">
          <WarningCircle size={22} weight="bold" aria-hidden="true" />
          <div>
            <strong>Case inbox unavailable.</strong>
            <p>{error}</p>
          </div>
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() => void refresh()}
          >
            Try again
          </button>
        </div>
      ) : cases.length === 0 ? (
        <div className="case-inbox-state case-inbox-state-empty">
          <FolderOpen size={22} weight="bold" aria-hidden="true" />
          <div>
            <strong>No live cases yet.</strong>
            <p>
              Start with a source transaction to create your first durable case.
              It will appear here as soon as the server accepts the request.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="case-queue-controls" aria-label="Case queue filters">
            <label className="case-queue-search">
              <span>Search cases</span>
              <div>
                <MagnifyingGlass size={17} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Case ID or source transaction"
                />
              </div>
            </label>
            <label>
              <span>Workflow stage</span>
              <select
                value={stageFilter}
                onChange={(event) => setStageFilter(event.target.value)}
              >
                <option value="ALL">All stages</option>
                <option value="NEEDS_ATTENTION">Needs attention</option>
                <option value="VERIFYING">Verifying evidence</option>
                <option value="NEEDS_PROPOSAL">Needs proposal</option>
                <option value="NEEDS_REVIEW">Needs human review</option>
                <option value="REVIEWED">Reviewed</option>
              </select>
            </label>
            <label>
              <span>Human review</span>
              <select
                value={reviewFilter}
                onChange={(event) => setReviewFilter(event.target.value)}
              >
                <option value="ALL">All outcomes</option>
                <option value="UNREVIEWED">Unreviewed</option>
                <option value="ACCEPT_RECOMMENDATION">
                  Accepted recommendation
                </option>
                <option value="REFER_FOR_INFORMATION">Referred</option>
                <option value="DECLINE_CASE">Declined</option>
              </select>
            </label>
          </div>
          <div className="case-queue-summary" role="status">
            Showing <strong>{filteredCases.length}</strong> of {cases.length}{" "}
            cases
          </div>
          {filteredCases.length ? (
            <div className="case-list">
              {filteredCases.map((financeCase) => (
                <CaseListRow
                  key={financeCase.caseId}
                  financeCase={financeCase}
                />
              ))}
            </div>
          ) : (
            <div className="case-inbox-state case-inbox-state-empty">
              <FolderOpen size={22} weight="bold" aria-hidden="true" />
              <div>
                <strong>No cases match these filters.</strong>
                <p>
                  Clear or change the filters to return to the full operator
                  queue.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function CaseListRow({ financeCase }: { financeCase: CaseListItem }) {
  const status = statusCopy(financeCase.status);
  return (
    <article className="case-list-row">
      <div className="case-list-row-main">
        <div className="case-list-row-title">
          <span className={`status-dot ${status.tone}`} aria-hidden="true" />
          <strong>{status.label}</strong>
          <span className="case-list-role">{formatRole(financeCase.role)}</span>
        </div>
        <code className="case-list-source">
          {shortenHash(financeCase.sourceTxHash)}
        </code>
      </div>
      <dl className="case-list-facts">
        <div>
          <dt>Request</dt>
          <dd>{financeCase.requestedAdvanceBps / 100}% advance</dd>
        </div>
        <div>
          <dt>Tenor</dt>
          <dd>{financeCase.deliveryDays} days</dd>
        </div>
        <div>
          <dt>Next action</dt>
          <dd>{nextAction(financeCase)}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{formatTimestamp(financeCase.updatedAt)}</dd>
        </div>
      </dl>
      <Link
        className="case-list-open"
        href={`/cases/${encodeURIComponent(financeCase.caseId)}`}
      >
        Open case <ArrowRight size={15} weight="bold" aria-hidden="true" />
      </Link>
    </article>
  );
}

function caseStage(financeCase: CaseListItem): string {
  if (
    financeCase.status === "FAILED_RETRYABLE" ||
    financeCase.status === "FAILED_TERMINAL" ||
    financeCase.status === "WORKER_UNAVAILABLE"
  )
    return "NEEDS_ATTENTION";
  if (financeCase.status !== "COMPLETED") return "VERIFYING";
  if (!financeCase.proposalAvailable) return "NEEDS_PROPOSAL";
  if (!financeCase.latestReview) return "NEEDS_REVIEW";
  return "REVIEWED";
}

function nextAction(financeCase: CaseListItem): string {
  const stage = caseStage(financeCase);
  if (stage === "NEEDS_ATTENTION") return "Resolve evidence";
  if (stage === "VERIFYING") return "Monitor proof";
  if (stage === "NEEDS_PROPOSAL") return "Generate proposal";
  if (stage === "NEEDS_REVIEW") return "Record review";
  if (financeCase.latestReview?.decision === "ACCEPT_RECOMMENDATION") {
    return "Recommendation accepted";
  }
  if (financeCase.latestReview?.decision === "REFER_FOR_INFORMATION") {
    return "Await information";
  }
  return "Case declined";
}

function statusCopy(status: CaseListItem["status"]): {
  label: string;
  tone: "live" | "pending" | "warning";
} {
  if (status === "COMPLETED")
    return { label: "Evidence verified", tone: "live" };
  if (status === "FAILED_TERMINAL") {
    return { label: "Intake stopped", tone: "warning" };
  }
  if (status === "FAILED_RETRYABLE") {
    return { label: "Retry available", tone: "warning" };
  }
  if (status === "WORKER_UNAVAILABLE") {
    return { label: "Worker unavailable", tone: "warning" };
  }
  return { label: "Processing", tone: "pending" };
}

function readError(value: unknown): string {
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = value.error;
    if (typeof error === "string" && error.length < 240) return error;
  }
  return "The case inbox returned an invalid response.";
}

function shortenHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function formatRole(role: CaseListItem["role"]): string {
  if (role === "marketplace") return "Marketplace";
  if (role === "supplier") return "Supplier";
  return "Lender";
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
