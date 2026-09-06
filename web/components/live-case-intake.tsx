"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  CircleNotch,
  WarningCircle,
} from "@phosphor-icons/react";

import {
  parsePublicCaseResponse,
  type PublicCaseResponse,
  type PublicIntakeStatus,
} from "../lib/case-status";

const POLL_INTERVAL_MS = 3_000;
const TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "FAILED_RETRYABLE",
  "FAILED_TERMINAL",
]);

interface LiveCaseIntakeProps {
  recordedSourceTxHash: string;
}

export function LiveCaseIntake({ recordedSourceTxHash }: LiveCaseIntakeProps) {
  const [sourceTxHash, setSourceTxHash] = useState("");
  const [requestedAdvance, setRequestedAdvance] = useState("30");
  const [deliveryDays, setDeliveryDays] = useState("30");
  const [role, setRole] = useState<"lender" | "marketplace" | "supplier">(
    "lender",
  );
  const [submission, setSubmission] = useState<PublicCaseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessRequired, setAccessRequired] = useState(false);
  const caseId = submission?.case.caseId;
  const intakeStatus = submission?.intake?.status;

  useEffect(() => {
    if (!caseId) return;
    if (
      (intakeStatus && TERMINAL_STATUSES.has(intakeStatus)) ||
      submission?.case.status === "WORKER_UNAVAILABLE"
    ) {
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch(
          `/api/cases/${encodeURIComponent(caseId)}`,
          { cache: "no-store" },
        );
        const payload: unknown = await response.json();
        if (!response.ok) return;
        const parsed = parsePublicCaseResponse(payload);
        if (!cancelled && parsed) setSubmission(parsed);
      } catch {
        // The visible case state remains the last verified response. A later
        // interval can recover from a transient network failure.
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [caseId, intakeStatus, submission?.case.status]);

  async function sendCase(sourceHash = sourceTxHash): Promise<boolean> {
    setError(null);
    setAccessRequired(false);
    const advance = Number(requestedAdvance);
    const days = Number(deliveryDays);
    if (
      !/^0x[a-fA-F0-9]{64}$/.test(sourceHash.trim()) ||
      !Number.isInteger(advance) ||
      advance < 0 ||
      advance > 100 ||
      !Number.isInteger(days) ||
      days < 0 ||
      days > 365
    ) {
      setError(
        "Enter a 32-byte source transaction hash, an advance from 0–100%, and delivery from 0–365 days.",
      );
      setLoading(false);
      setRetrying(false);
      return false;
    }

    try {
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceTxHash: sourceHash.trim(),
          requestedAdvanceBps: advance * 100,
          deliveryDays: days,
          role,
        }),
      });
      const payload: unknown = await response.json();
      if (response.status === 401 || response.status === 403) {
        setAccessRequired(true);
      }
      const parsed = parsePublicCaseResponse(payload);
      if (parsed) {
        setSubmission(parsed);
        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "string"
              ? payload.error
              : "The worker could not process this case yet.";
          setError(message);
        }
        return response.ok;
      }
      if (!response.ok || !parsed) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "The case intake request could not be submitted.";
        throw new Error(message);
      }
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The case intake request could not be submitted.",
      );
      return false;
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  }

  async function submitCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    await sendCase();
  }

  async function retryCase() {
    if (!submission) return;
    setSourceTxHash(submission.case.sourceTxHash);
    setRetrying(true);
    await sendCase(submission.case.sourceTxHash);
  }

  function useRecordedSource() {
    setSourceTxHash(recordedSourceTxHash);
    setSubmission(null);
    setError(null);
    setAccessRequired(false);
  }

  const intake = submission?.intake ?? null;
  return (
    <section className="live-case-intake" aria-labelledby="live-case-title">
      <div className="live-case-intake-heading">
        <div>
          <span className="eyebrow">Start a real case</span>
          <h2 id="live-case-title">
            Verify the order behind a financing request.
          </h2>
          <p>
            Submit the source transaction and requested terms. The worker checks
            the receipt, supported event, USC proof, and Creditcoin CC3 registry
            state before a proposal can be considered.
          </p>
        </div>
        <code className="boundary-code">LIVE_TESTNET_GATE</code>
      </div>

      <form className="live-case-form" onSubmit={submitCase}>
        <div className="live-case-access-hint">
          <div>
            <strong>Operator access comes first.</strong>
            <span>
              Sign in with the wallet that should own this case. The browser
              signs only the access message; worker keys stay server-side.
            </span>
          </div>
          <Link className="text-link" href="/access">
            Open wallet access{" "}
            <ArrowRight size={15} weight="bold" aria-hidden="true" />
          </Link>
        </div>
        <label className="review-field live-case-hash-field">
          <span>Source transaction</span>
          <input
            type="text"
            value={sourceTxHash}
            onChange={(event) => setSourceTxHash(event.target.value)}
            placeholder="0x… Ethereum Sepolia OrderGuaranteed tx"
            autoComplete="off"
            spellCheck={false}
            required
          />
          <small>
            Paste the transaction for the buyer-backed order. Only the
            configured source escrow and supported event are accepted.
          </small>
        </label>
        <div className="review-field-grid">
          <label className="review-field">
            <span>Requested advance</span>
            <div className="review-input-suffix">
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={requestedAdvance}
                onChange={(event) => setRequestedAdvance(event.target.value)}
                inputMode="decimal"
                required
              />
              <span>%</span>
            </div>
          </label>
          <label className="review-field">
            <span>Delivery tenor</span>
            <div className="review-input-suffix">
              <input
                type="number"
                min="0"
                max="365"
                step="1"
                value={deliveryDays}
                onChange={(event) => setDeliveryDays(event.target.value)}
                inputMode="numeric"
                required
              />
              <span>days</span>
            </div>
          </label>
        </div>
        <label className="review-field">
          <span>Reviewing as</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as typeof role)}
          >
            <option value="lender">Lender / risk analyst</option>
            <option value="marketplace">Marketplace operator</option>
            <option value="supplier">Supplier / shop owner</option>
          </select>
        </label>
        {error ? (
          <div className="review-inline-error" role="alert">
            <WarningCircle size={18} weight="bold" aria-hidden="true" />
            <span>
              {error}
              {accessRequired ? (
                <>
                  {" "}
                  <Link className="text-link" href="/access">
                    Sign in as an operator
                  </Link>
                </>
              ) : null}
            </span>
          </div>
        ) : null}
        <div className="live-case-actions">
          <button
            className="button button-primary"
            type="submit"
            disabled={loading}
          >
            {loading ? "Submitting case…" : "Verify & register evidence"}
            {loading ? (
              <CircleNotch
                className="spin"
                size={17}
                weight="bold"
                aria-hidden="true"
              />
            ) : (
              <ArrowRight size={17} weight="bold" aria-hidden="true" />
            )}
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={useRecordedSource}
          >
            Use recorded testnet receipt
          </button>
        </div>
        <p className="live-case-note">
          This may submit a USC verification transaction from the configured
          worker wallet. It creates a review record, not a loan: no custody,
          disbursement, or capital approval occurs here. Operator sign-in is
          required.
        </p>
      </form>

      <LiveCaseResult
        intake={intake}
        submission={submission}
        onRetry={retryCase}
        retrying={retrying}
      />
    </section>
  );
}

function LiveCaseResult({
  intake,
  submission,
  onRetry,
  retrying,
}: {
  intake: PublicIntakeStatus | null;
  submission: PublicCaseResponse | null;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (!submission) {
    return (
      <div className="live-case-empty">
        <span className="status-pill status-pill-warning">OPERATOR ACTION</span>
        <strong>Ready for a case.</strong>
        <span>
          One source transaction will create one durable verification request.
        </span>
      </div>
    );
  }

  const order = intake?.order ?? null;
  // A repeated, idempotent case submission can return the durable case
  // without a fresh worker snapshot. Use the server-owned case status as the
  // fallback so a completed case is never presented as still processing.
  const status = intake?.status ?? submission.case.status;
  const completed = status === "COMPLETED";
  const verifiedEvidence = Boolean(
    order?.stage === "VERIFIED" &&
    order.proofStatus === "LIVE_VERIFIED" &&
    order.evidenceId,
  );
  const completedSnapshotUnavailable = completed && !verifiedEvidence;
  const failed =
    status === "FAILED_RETRYABLE" ||
    status === "FAILED_TERMINAL" ||
    status === "WORKER_UNAVAILABLE";
  const title = completed
    ? verifiedEvidence
      ? "Evidence is verified."
      : "Case is complete; proof details need a refresh."
    : failed
      ? submission.case.status === "WORKER_UNAVAILABLE"
        ? "The worker needs a retry."
        : "The evidence request stopped."
      : "The worker is processing this case.";

  return (
    <div className="live-case-result" aria-live="polite">
      <div className="live-case-result-heading">
        <span
          className={`status-pill ${completed ? "status-pill-live" : failed ? "status-pill-warning" : "status-pill-pending"}`}
        >
          {completed ? (
            <CheckCircle size={14} weight="bold" aria-hidden="true" />
          ) : failed ? (
            <WarningCircle size={14} weight="bold" aria-hidden="true" />
          ) : (
            <CircleNotch
              className="spin"
              size={14}
              weight="bold"
              aria-hidden="true"
            />
          )}
          {status}
        </span>
        <code className="boundary-code">
          CASE {submission.case.caseId.slice(0, 8)}
        </code>
      </div>
      <h3>{title}</h3>
      <p>
        {completed
          ? verifiedEvidence
            ? "The source receipt, USC proof boundary, and Creditcoin registry result are now linked to this case. A model proposal and any signed action remain separate gates."
            : "The case is marked complete from a durable server record, but the current worker proof snapshot is unavailable. Open the case and wait for a fresh read-back before requesting a proposal."
          : failed
            ? "No approval was created. The case is durable and can be retried without creating a second worker request."
            : "The page will refresh the durable worker status automatically. No browser-held key is involved."}
      </p>
      <ol className="live-case-timeline">
        <li className={order ? "complete" : "active"}>
          <span>01</span>
          <div>
            <strong>Source receipt and event</strong>
            <small>
              {order
                ? "Observed and decoded"
                : completedSnapshotUnavailable
                  ? "Snapshot unavailable"
                  : "Waiting for worker"}
            </small>
          </div>
        </li>
        <li className={verifiedEvidence ? "complete" : "active"}>
          <span>02</span>
          <div>
            <strong>USC proof + CC3 registration</strong>
            <small>
              {verifiedEvidence
                ? "Live receipt read back"
                : (order?.stage ?? "Pending")}
            </small>
          </div>
        </li>
        <li className={verifiedEvidence ? "next" : "active"}>
          <span>03</span>
          <div>
            <strong>Proposal and policy</strong>
            <small>
              {verifiedEvidence
                ? "Separate next gate · no capital moved"
                : "Available after current proof read-back"}
            </small>
          </div>
        </li>
      </ol>
      <div className="live-case-links">
        <Link className="text-link" href={`/cases/` + submission.case.caseId}>
          Inspect this case{" "}
          <ArrowRight size={15} weight="bold" aria-hidden="true" />
        </Link>
        {failed && submission.case.status !== "FAILED_TERMINAL" ? (
          <button
            className="button button-secondary"
            type="button"
            onClick={onRetry}
            disabled={retrying}
          >
            {retrying ? "Retrying worker…" : "Retry verification"}
          </button>
        ) : null}
      </div>
      {order?.evidenceId ? (
        <div className="live-case-links">
          <Link className="text-link" href={`/cases/${submission.case.caseId}`}>
            Inspect verified receipts{" "}
            <ArrowRight size={15} weight="bold" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
