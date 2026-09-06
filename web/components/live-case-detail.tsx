"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  CircleNotch,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useState, type ReactNode } from "react";
import { POLICY } from "@loomcredit/shared";

import {
  parsePublicCaseResponse,
  publicCaseReviewSchema,
  type PublicIntakeStatus,
  type PublicCaseResponse,
  type PublicCaseReview,
} from "../lib/case-status";
import { parsePublicProposal, type PublicProposal } from "../lib/case-proposal";

const REFRESH_INTERVAL_MS = 5_000;
const UNAVAILABLE_REFRESH_INTERVAL_MS = 12_000;

function explorerUrl(kind: "source" | "creditcoin", hash: string): string {
  const base =
    kind === "source"
      ? "https://sepolia.etherscan.io/tx/"
      : "https://creditcoin-testnet.blockscout.com/tx/";
  return base + hash;
}

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export function LiveCaseDetail({ caseId }: { caseId: string }) {
  const [payload, setPayload] = useState<PublicCaseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspectionAccessRequired, setInspectionAccessRequired] =
    useState(false);
  const [loading, setLoading] = useState(true);
  const [proposal, setProposal] = useState<PublicProposal | null>(null);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalAccessRequired, setProposalAccessRequired] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryAccessRequired, setRetryAccessRequired] = useState(false);
  const [retryLoading, setRetryLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const currentStatus = payload?.intake?.status ?? payload?.case.status;

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch(
          "/api/cases/" + encodeURIComponent(caseId),
          { cache: "no-store" },
        );
        const body: unknown = await response.json();
        const parsed = parsePublicCaseResponse(body);
        if (!response.ok || !parsed) {
          if (parsed && !cancelled) {
            setPayload(parsed);
            setProposal(parsed.proposal ?? null);
          }
          if (response.status === 401 || response.status === 403) {
            if (!cancelled) setInspectionAccessRequired(true);
          }
          const message =
            typeof body === "object" &&
            body !== null &&
            "error" in body &&
            typeof body.error === "string"
              ? body.error
              : response.status === 401
                ? "Sign in with the wallet that created this case to inspect it."
                : "The case inspection response was unavailable.";
          if (!cancelled) setError(message);
          return;
        }
        if (!cancelled) {
          setPayload(parsed);
          setProposal(parsed.proposal ?? null);
          setError(null);
          setInspectionAccessRequired(false);
        }
      } catch {
        if (!cancelled) {
          setError("The case inspection service could not be reached.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (currentStatus === "FAILED_TERMINAL") {
      return;
    }

    void refresh();
    const interval = window.setInterval(
      () => void refresh(),
      currentStatus === "WORKER_UNAVAILABLE"
        ? UNAVAILABLE_REFRESH_INTERVAL_MS
        : REFRESH_INTERVAL_MS,
    );
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [caseId, currentStatus]);

  async function requestProposal() {
    setProposalLoading(true);
    setProposalError(null);
    setProposalAccessRequired(false);
    try {
      const response = await fetch(
        "/api/cases/" + encodeURIComponent(caseId) + "/proposal",
        { method: "POST", headers: { "content-type": "application/json" } },
      );
      const body: unknown = await response.json();
      const parsed = parsePublicProposal(body);
      if (!response.ok || !parsed) {
        if (response.status === 401 || response.status === 403) {
          setProposalAccessRequired(true);
        }
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "The proposal could not be generated.";
        throw new Error(message);
      }
      setProposal(parsed);
    } catch (caught) {
      setProposalError(
        caught instanceof Error
          ? caught.message
          : "The proposal could not be generated.",
      );
    } finally {
      setProposalLoading(false);
    }
  }

  async function retryCase() {
    if (!payload) return;
    setRetryLoading(true);
    setRetryError(null);
    setRetryAccessRequired(false);
    setProposal(null);
    try {
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceTxHash: payload.case.sourceTxHash,
          requestedAdvanceBps: payload.case.requestedAdvanceBps,
          deliveryDays: payload.case.deliveryDays,
          role: payload.case.role,
        }),
      });
      const body: unknown = await response.json();
      if (response.status === 401 || response.status === 403) {
        setRetryAccessRequired(true);
      }
      const parsed = parsePublicCaseResponse(body);
      if (parsed) {
        setPayload(parsed);
        setProposal(parsed.proposal ?? null);
        if (response.ok) return;
      }
      const message =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof body.error === "string"
          ? body.error
          : "The worker retry could not be submitted.";
      throw new Error(message);
    } catch (caught) {
      setRetryError(
        caught instanceof Error
          ? caught.message
          : "The worker retry could not be submitted.",
      );
    } finally {
      setRetryLoading(false);
    }
  }

  async function recordReview(input: {
    decision: PublicCaseReview["decision"];
    note?: string;
  }) {
    setReviewLoading(true);
    setReviewError(null);
    try {
      const response = await fetch(
        "/api/cases/" + encodeURIComponent(caseId) + "/reviews",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const body: unknown = await response.json();
      const candidate =
        typeof body === "object" && body !== null && "review" in body
          ? publicCaseReviewSchema.safeParse(body.review)
          : null;
      if (!response.ok || !candidate?.success) {
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "The human review could not be recorded.";
        throw new Error(message);
      }
      setPayload((current) =>
        current
          ? { ...current, reviews: [candidate.data, ...current.reviews] }
          : current,
      );
    } catch (caught) {
      setReviewError(
        caught instanceof Error
          ? caught.message
          : "The human review could not be recorded.",
      );
      throw caught;
    } finally {
      setReviewLoading(false);
    }
  }

  if (loading && !payload) {
    return (
      <div className="case-detail-card" aria-busy="true">
        <span className="eyebrow">Reading worker state</span>
        <h2>Loading this case…</h2>
        <p>The browser is waiting for a server-verified case response.</p>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="case-detail-card case-detail-card-error" role="alert">
        <WarningCircle size={26} weight="bold" aria-hidden="true" />
        <span className="eyebrow">Inspection unavailable</span>
        <h2>We could not open this case.</h2>
        <p>{error ?? "The case was not found."}</p>
        {inspectionAccessRequired ? (
          <Link className="text-link" href="/access">
            Sign in with the case owner wallet
          </Link>
        ) : null}
        <Link className="button button-secondary" href="/review">
          Return to review{" "}
          <ArrowRight size={16} weight="bold" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <CaseDetailView
      response={payload}
      staleMessage={error}
      onRequestProposal={requestProposal}
      proposal={proposal}
      proposalError={proposalError}
      proposalAccessRequired={proposalAccessRequired}
      proposalLoading={proposalLoading}
      onRetryCase={retryCase}
      retryError={retryError}
      retryAccessRequired={retryAccessRequired}
      retryLoading={retryLoading}
      onRecordReview={recordReview}
      reviewLoading={reviewLoading}
      reviewError={reviewError}
    />
  );
}

function CaseDetailView({
  response,
  staleMessage,
  onRequestProposal,
  proposal,
  proposalError,
  proposalAccessRequired,
  proposalLoading,
  onRetryCase,
  retryError,
  retryAccessRequired,
  retryLoading,
  onRecordReview,
  reviewLoading,
  reviewError,
}: {
  response: PublicCaseResponse;
  staleMessage: string | null;
  onRequestProposal: () => void;
  proposal: PublicProposal | null;
  proposalError: string | null;
  proposalAccessRequired: boolean;
  proposalLoading: boolean;
  onRetryCase: () => void;
  retryError: string | null;
  retryAccessRequired: boolean;
  retryLoading: boolean;
  onRecordReview: (input: {
    decision: PublicCaseReview["decision"];
    note?: string;
  }) => Promise<void>;
  reviewLoading: boolean;
  reviewError: string | null;
}) {
  const intake = response.intake;
  const order = intake?.order ?? null;
  const history = intake?.history ?? (order ? [order] : []);
  const lifecycleEvents = history.filter(
    (event) => event.eventType !== "ORDER_GUARANTEED",
  );
  const latestLifecycle = lifecycleEvents[lifecycleEvents.length - 1] ?? null;
  const sourceOrder =
    order?.sourceOrder ??
    history.find((event) => event.eventType === "ORDER_GUARANTEED")
      ?.sourceOrder ??
    null;
  const lifecycleBlocksProposal = lifecycleEvents.length > 0;
  const evidenceReady = Boolean(
    intake?.status === "COMPLETED" &&
    order?.stage === "VERIFIED" &&
    order.proofStatus === "LIVE_VERIFIED" &&
    order.evidenceId,
  );
  const status = intake?.status ?? response.case.status;
  // The durable case status is authoritative when the worker snapshot is
  // temporarily unavailable (for example after a restart). Do not downgrade
  // a server-owned completed case to a pending screen just because the latest
  // read-back could not be fetched.
  const completed = status === "COMPLETED";
  const failed =
    status === "FAILED_RETRYABLE" ||
    status === "FAILED_TERMINAL" ||
    status === "WORKER_UNAVAILABLE";

  return (
    <div className="case-detail">
      <div className="case-detail-card">
        <div className="case-detail-heading">
          <div>
            <span className="eyebrow">
              Case {response.case.caseId.slice(0, 8)}
            </span>
            <h2>
              {completed ? "Evidence verified for this case." : "Case status"}
            </h2>
          </div>
          <span
            className={
              "status-pill " +
              (completed
                ? "status-pill-live"
                : failed
                  ? "status-pill-warning"
                  : "status-pill-pending")
            }
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
            {statusLabel(status)}
          </span>
        </div>
        {staleMessage ? (
          <p className="case-detail-stale" role="status">
            Latest refresh: {staleMessage}
          </p>
        ) : null}
        <p>
          {completed
            ? evidenceReady
              ? lifecycleBlocksProposal
                ? "The source receipt, native USC proof, and Creditcoin registry read-back are attached to this case. A later order lifecycle event is visible below, so a new proposal is stopped."
                : "The source receipt, native USC proof, and Creditcoin registry read-back are attached to this case. Requested terms remain a separate input to the next proposal gate."
              : "This case is durably marked complete, but the current verified evidence snapshot is unavailable. Proposal generation stays stopped until the worker can read the proof back again."
            : failed
              ? "No approval was created. Correct the source or worker condition, then retry the same case."
              : "The worker is still resolving the source receipt. This page refreshes the durable status automatically."}
        </p>
        {failed && status !== "FAILED_TERMINAL" ? (
          <div className="case-detail-proposal-action">
            <button
              className="button button-secondary"
              type="button"
              onClick={onRetryCase}
              disabled={retryLoading}
            >
              {retryLoading ? "Retrying verification…" : "Retry verification"}
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </button>
            <small>
              The same durable case and terms are retried; a duplicate worker
              request is not created.
            </small>
          </div>
        ) : null}
        {retryError ? (
          <div className="review-inline-error" role="alert">
            <WarningCircle size={18} weight="bold" aria-hidden="true" />
            <span>
              {retryError}
              {retryAccessRequired ? (
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
        {completed && lifecycleBlocksProposal ? (
          <div className="case-detail-stop" role="status">
            <span className="status-pill status-pill-warning">
              ACTION STOPPED
            </span>
            <div>
              <strong>
                {latestLifecycle
                  ? eventTypeLabel(latestLifecycle.eventType) +
                    " is the latest observed lifecycle event."
                  : "A later lifecycle event was observed for this order."}
              </strong>
              <small>
                LoomCredit does not generate a new financing proposal while a
                cancellation, dispute, or settlement event is present in the
                order history.
              </small>
            </div>
          </div>
        ) : completed && evidenceReady ? (
          <div className="case-detail-proposal-action">
            <button
              className="button button-primary"
              type="button"
              onClick={onRequestProposal}
              disabled={proposalLoading}
            >
              {proposalLoading
                ? "Generating bounded proposal…"
                : proposal
                  ? "Regenerate bounded proposal"
                  : "Generate bounded proposal"}
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </button>
            <small>
              The worker builds a fresh packet for this evidence ID. No
              browser-held model key, signature, or transaction is used.
            </small>
          </div>
        ) : completed ? (
          <div className="case-detail-stop case-detail-readback" role="status">
            <span className="status-pill status-pill-warning">
              READ-BACK REQUIRED
            </span>
            <div>
              <strong>Current evidence is not proposal-ready.</strong>
              <small>
                The durable case status is complete, but a fresh LIVE_VERIFIED
                worker snapshot is required before LoomCredit can build a model
                proposal.
              </small>
            </div>
          </div>
        ) : null}
        {proposalError ? (
          <div className="review-inline-error" role="alert">
            <WarningCircle size={18} weight="bold" aria-hidden="true" />
            <span>
              {proposalError}
              {proposalAccessRequired ? (
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
        {proposal ? (
          <>
            <ProposalCard
              proposal={proposal}
              lifecycleBlocked={lifecycleBlocksProposal}
              liveEvidenceReady={evidenceReady}
            />
            <HumanReviewPanel
              proposal={proposal}
              reviews={response.reviews}
              disabled={lifecycleBlocksProposal || !evidenceReady}
              loading={reviewLoading}
              error={reviewError}
              onRecord={onRecordReview}
            />
          </>
        ) : null}
      </div>

      <CaseFactsCard
        sourceOrder={sourceOrder}
        sourceChainKey={order?.sourceChainKey ?? null}
        requestedAdvanceBps={response.case.requestedAdvanceBps}
        deliveryDays={response.case.deliveryDays}
        role={response.case.role}
      />

      <div className="case-detail-card">
        <div className="case-detail-heading">
          <div>
            <span className="eyebrow">Evidence chain</span>
            <h2>Inspect what the worker actually verified.</h2>
          </div>
          <code className="boundary-code">LIVE_VERIFIED ONLY</code>
        </div>
        <ol className="case-detail-timeline">
          <DetailStep
            number="01"
            title="Source transaction"
            value={
              order
                ? "Receipt and supported event decoded"
                : completed && !evidenceReady
                  ? "Current proof snapshot unavailable"
                  : "Waiting for receipt"
            }
            complete={Boolean(order)}
          />
          <DetailStep
            number="02"
            title="Attestcoin / USC proof"
            value={
              order?.stage === "VERIFIED"
                ? "Native proof accepted"
                : completed && !evidenceReady
                  ? "Current proof snapshot unavailable"
                  : (order?.stage ?? "Pending")
            }
            complete={evidenceReady}
          />
          <DetailStep
            number="03"
            title="Creditcoin registry"
            value={
              order?.evidenceId
                ? "Evidence ID read back"
                : completed && !evidenceReady
                  ? "Current proof snapshot unavailable"
                  : "Not available yet"
            }
            complete={evidenceReady}
          />
        </ol>

        <div className="case-detail-receipts">
          <ReceiptLink
            label="Source Sepolia receipt"
            hash={response.case.sourceTxHash}
            kind="source"
          />
          {order?.creditcoinTxHash ? (
            <ReceiptLink
              label="Creditcoin verification receipt"
              hash={order.creditcoinTxHash}
              kind="creditcoin"
            />
          ) : null}
        </div>
        {order?.evidenceId || order?.orderId ? (
          <dl className="case-detail-identifiers">
            {order.orderId ? (
              <div>
                <dt>Order ID</dt>
                <dd>
                  <code>{order.orderId}</code>
                </dd>
              </div>
            ) : null}
            {order.evidenceId ? (
              <div>
                <dt>Evidence ID</dt>
                <dd>
                  <code>{order.evidenceId}</code>
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>

      <OrderHistoryCard history={history} latestLifecycle={latestLifecycle} />

      <div className="case-detail-next">
        <span className="eyebrow">Next controlled gate</span>
        <h2>
          {lifecycleBlocksProposal
            ? "The order lifecycle has stopped new action."
            : "Proposal and policy remain separate from proof."}
        </h2>
        <p>
          {lifecycleBlocksProposal
            ? "The history above is the source of truth for what happened after the guarantee. A new financing proposal requires a fresh eligible order event; this case remains useful as an auditable record."
            : "A verified receipt does not become a loan decision. Once a fresh case is eligible, the server-side agent can evaluate the exact evidence packet against these requested terms; missing model or signer configuration must remain a visible referral."}
        </p>
        <div className="case-detail-next-actions">
          <Link className="text-link" href="/cases">
            Back to case inbox{" "}
            <ArrowRight size={15} weight="bold" aria-hidden="true" />
          </Link>
          <Link className="text-link" href="/review">
            Open another case{" "}
            <ArrowRight size={15} weight="bold" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function CaseFactsCard({
  sourceOrder,
  sourceChainKey,
  requestedAdvanceBps,
  deliveryDays,
  role,
}: {
  sourceOrder: NonNullable<PublicIntakeStatus["order"]>["sourceOrder"];
  sourceChainKey: number | null;
  requestedAdvanceBps: number;
  deliveryDays: number;
  role: PublicCaseResponse["case"]["role"];
}) {
  return (
    <section className="case-detail-card case-detail-facts-card">
      <div className="case-detail-heading">
        <div>
          <span className="eyebrow">Case inputs and source facts</span>
          <h2>The commercial context stays visible.</h2>
        </div>
        <div className="case-detail-legend" aria-label="Data boundaries">
          <span className="case-detail-legend-verified">Source receipt</span>
          <span className="case-detail-legend-requested">Operator input</span>
        </div>
      </div>
      <div className="case-detail-fact-group case-detail-fact-group-verified">
        <div className="case-detail-fact-group-heading">
          <span>Decoded source order</span>
          <small>
            {sourceOrder
              ? "Read from the configured OrderGuaranteed event. USC and CC3 verification remain shown in the evidence chain."
              : "Waiting for the worker to decode the source receipt."}
          </small>
        </div>
        {sourceOrder ? (
          <dl className="case-detail-facts">
            <Fact label="Buyer">
              <AddressValue value={sourceOrder.buyer} />
            </Fact>
            <Fact label="Supplier">
              <AddressValue value={sourceOrder.supplier} />
            </Fact>
            <Fact label="Order value">
              {formatMinorUnits(sourceOrder.orderValueMinor)}
            </Fact>
            <Fact label="Buyer guarantee">
              {formatMinorUnits(sourceOrder.guaranteeAmountMinor)}
            </Fact>
            <Fact label="Due date">
              {formatUnixDate(sourceOrder.deliveryDeadline)}
            </Fact>
            <Fact label="Source chain">{sourceChainLabel(sourceChainKey)}</Fact>
            <Fact label="Settlement asset">
              <AddressValue value={sourceOrder.settlementToken} />
            </Fact>
            <Fact label="Source nonce">{sourceOrder.nonce}</Fact>
          </dl>
        ) : (
          <div className="case-detail-fact-empty" role="status">
            Source-order facts will appear after the receipt is decoded. No
            values are inferred from the requested terms.
          </div>
        )}
      </div>
      <div className="case-detail-fact-group case-detail-fact-group-requested">
        <div className="case-detail-fact-group-heading">
          <span>Operator request</span>
          <small>
            These values came from the case form. They are evaluated against the
            evidence and policy; they are not source-chain facts.
          </small>
        </div>
        <dl className="case-detail-facts">
          <Fact label="Requested advance">{requestedAdvanceBps / 100}%</Fact>
          <Fact label="Requested tenor">{deliveryDays} days</Fact>
          <Fact label="Reviewing as">{formatRole(role)}</Fact>
          <Fact label="Current policy ceiling">
            {POLICY.maxAdvanceBps / 100}% advance · {POLICY.maxTenorDays} days
          </Fact>
        </dl>
      </div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function AddressValue({ value }: { value: string }) {
  return <code title={value}>{shortAddress(value)}</code>;
}

function OrderHistoryCard({
  history,
  latestLifecycle,
}: {
  history: PublicIntakeStatus["history"];
  latestLifecycle: PublicIntakeStatus["history"][number] | null;
}) {
  return (
    <section className="case-detail-card case-detail-history-card">
      <div className="case-detail-heading">
        <div>
          <span className="eyebrow">Lifecycle and audit history</span>
          <h2>See what happened after the guarantee.</h2>
        </div>
        <span
          className={
            "status-pill " +
            (latestLifecycle ? "status-pill-warning" : "status-pill-live")
          }
        >
          {latestLifecycle
            ? eventTypeLabel(latestLifecycle.eventType)
            : "NO LATER EVENT"}
        </span>
      </div>
      <p>
        Each row is a worker-persisted source event. A later cancellation,
        dispute, or settlement is visible here and stops a new proposal until
        its state is resolved.
      </p>
      {history.length > 0 ? (
        <ol className="case-audit-list">
          {history.map((event, index) => (
            <li key={event.sourceEventKey}>
              <div className="case-audit-index">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="case-audit-main">
                <div className="case-audit-heading">
                  <strong>{eventTypeLabel(event.eventType)}</strong>
                  <span
                    className={
                      "case-audit-proof case-audit-proof-" +
                      event.proofStatus.toLowerCase()
                    }
                  >
                    {event.proofStatus.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="case-audit-meta">
                  <span>
                    Worker stage <strong>{statusLabel(event.stage)}</strong>
                  </span>
                  <span>
                    Block <strong>{event.blockHeight ?? "pending"}</strong>
                  </span>
                  <span>
                    Observed{" "}
                    <strong>
                      {formatTimestamp(
                        event.stageTimestamps[event.stage] ?? event.updatedAt,
                      )}
                    </strong>
                  </span>
                </div>
                <code title={event.sourceTxHash}>
                  {shortHash(event.sourceTxHash)}
                </code>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="case-detail-fact-empty" role="status">
          No source event has been persisted yet. The worker history will appear
          here as processing advances.
        </div>
      )}
    </section>
  );
}

function ProposalCard({
  proposal,
  lifecycleBlocked,
  liveEvidenceReady,
}: {
  proposal: PublicProposal;
  lifecycleBlocked: boolean;
  liveEvidenceReady: boolean;
}) {
  const termsMatched = proposal.terms.status === "MATCHED";
  const decisionLabel =
    proposal.decision === "APPROVED"
      ? "POLICY APPROVED"
      : proposal.decision === "REJECTED"
        ? "POLICY REJECTED"
        : "REFER";
  return (
    <div className="proposal-card">
      <div className="case-detail-heading">
        <div>
          <span className="eyebrow">Structured proposal</span>
          <h3>{decisionLabel}</h3>
        </div>
        <span
          className={
            "status-pill " +
            (proposal.decision === "APPROVED" && termsMatched
              ? "status-pill-live"
              : "status-pill-warning")
          }
        >
          {proposal.mode === "MODEL" ? "MODEL" : "REFER"}
        </span>
      </div>
      <p>
        This is a model proposal evaluated against deterministic policy. It is
        not a signed RiskGuard action and it does not move capital.
      </p>
      {lifecycleBlocked ? (
        <div className="proposal-history-warning" role="status">
          This proposal is retained as history, but a later order lifecycle
          event makes it non-actionable.
        </div>
      ) : !liveEvidenceReady ? (
        <div className="proposal-history-warning" role="status">
          This proposal is retained as history, but the current worker proof
          snapshot is unavailable. It is not treated as actionable until the
          evidence is read back again.
        </div>
      ) : null}
      <div className="proposal-summary">
        <div>
          <span>Advance proposed</span>
          <strong>{proposal.quote.advanceBps / 100}%</strong>
        </div>
        <div>
          <span>Requested maximum</span>
          <strong>{proposal.terms.requestedAdvanceBps / 100}%</strong>
        </div>
        <div>
          <span>Evidence tenor</span>
          <strong>{proposal.terms.evidenceTenorDays} days</strong>
        </div>
        <div>
          <span>Terms gate</span>
          <strong>{proposal.terms.status.replaceAll("_", " ")}</strong>
        </div>
        <div>
          <span>Policy ceiling</span>
          <strong>
            {proposal.policy?.checks.find((check) => check.id === "advance-cap")
              ?.limit ?? String(POLICY.maxAdvanceBps / 100) + "% maximum"}
          </strong>
        </div>
      </div>
      <div className="proposal-meta">
        <span>
          Provider: <strong>{proposal.provider ?? "not configured"}</strong>
        </span>
        <span>
          Model: <strong>{proposal.model ?? "not configured"}</strong>
        </span>
        <span>
          Signer: <strong>{proposal.signing.status}</strong>
        </span>
      </div>
      <div className="proposal-reasoning">
        <div>
          <span className="proposal-section-label">
            AI reasoning · structured reason codes
          </span>
          <p>
            The model returned bounded codes, not an unverified narrative. Each
            code is shown verbatim with a plain-language label.
          </p>
        </div>
        <ul className="proposal-reason-list">
          {proposal.quote.reasonCodes.map((reason) => (
            <li key={reason}>
              <code>{reason}</code>
              <span>{reasonLabel(reason)}</span>
            </li>
          ))}
        </ul>
      </div>
      {proposal.policy ? (
        <ul className="proposal-checks">
          {proposal.policy.checks.map((check) => (
            <li key={check.id}>
              <span>{check.status}</span>
              <strong>{check.label}</strong>
              <small>
                {check.actual} · limit {check.limit}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="proposal-reasons">
          Policy was not evaluated because the model boundary returned a
          referral.
        </p>
      )}
    </div>
  );
}

function HumanReviewPanel({
  proposal,
  reviews,
  disabled,
  loading,
  error,
  onRecord,
}: {
  proposal: PublicProposal;
  reviews: PublicCaseReview[];
  disabled: boolean;
  loading: boolean;
  error: string | null;
  onRecord: (input: {
    decision: PublicCaseReview["decision"];
    note?: string;
  }) => Promise<void>;
}) {
  const recommendationAcceptable =
    proposal.decision === "APPROVED" &&
    proposal.policy?.decision === "APPROVED" &&
    proposal.terms.status === "MATCHED";
  const [decision, setDecision] = useState<PublicCaseReview["decision"]>(
    recommendationAcceptable
      ? "ACCEPT_RECOMMENDATION"
      : "REFER_FOR_INFORMATION",
  );
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  async function submitReview() {
    setSaved(false);
    try {
      const normalizedNote = note.trim();
      await onRecord({
        decision,
        ...(normalizedNote ? { note: normalizedNote } : {}),
      });
      setNote("");
      setSaved(true);
    } catch {
      // The parent owns the sanitized server error.
    }
  }

  return (
    <section
      className="human-review-panel"
      aria-labelledby="human-review-title"
    >
      <div className="case-detail-heading">
        <div>
          <span className="eyebrow">Human review</span>
          <h3 id="human-review-title">Record the operator outcome.</h3>
        </div>
        <span className="status-pill status-pill-pending">
          OFF-CHAIN REVIEW
        </span>
      </div>
      <p>
        Accept the recommendation, request more information, or decline this
        case. This records an internal review event only—it does not sign a
        RiskGuard quote, reserve capital, or approve a loan.
      </p>
      <div className="human-review-form">
        <label>
          <span>Outcome</span>
          <select
            value={decision}
            onChange={(event) =>
              setDecision(event.target.value as PublicCaseReview["decision"])
            }
            disabled={loading || disabled}
          >
            <option
              value="ACCEPT_RECOMMENDATION"
              disabled={!recommendationAcceptable}
            >
              Accept current recommendation
            </option>
            <option value="REFER_FOR_INFORMATION">
              Request more information
            </option>
            <option value="DECLINE_CASE">Decline case review</option>
          </select>
        </label>
        <label>
          <span>
            Review note
            {decision === "ACCEPT_RECOMMENDATION"
              ? " (optional)"
              : " (required)"}
          </span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1_000}
            rows={3}
            disabled={loading || disabled}
            placeholder={
              decision === "ACCEPT_RECOMMENDATION"
                ? "Optional rationale or follow-up condition"
                : "State what is missing or why the case is declined"
            }
          />
        </label>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void submitReview()}
          disabled={
            loading ||
            disabled ||
            (decision === "ACCEPT_RECOMMENDATION" &&
              !recommendationAcceptable) ||
            (decision !== "ACCEPT_RECOMMENDATION" && note.trim().length < 3)
          }
        >
          {loading ? "Recording review…" : "Record review outcome"}
        </button>
      </div>
      {disabled ? (
        <div className="proposal-history-warning" role="status">
          Review updates are stopped because the current evidence is not
          actionable. Historical outcomes remain visible below.
        </div>
      ) : null}
      {error ? (
        <div className="review-inline-error" role="alert">
          <WarningCircle size={18} weight="bold" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : saved ? (
        <p className="human-review-saved" role="status">
          Review recorded in the case audit history.
        </p>
      ) : null}
      {reviews.length ? (
        <ol className="human-review-history">
          {reviews.map((review) => (
            <li key={review.reviewId}>
              <div>
                <strong>{reviewDecisionLabel(review.decision)}</strong>
                <span>{formatTimestamp(review.createdAt)}</span>
              </div>
              <p>{review.note ?? "No operator note added."}</p>
              <small>
                Bound to evidence {shortHash(review.proposalEvidenceId)} · model
                outcome {review.proposalDecision} · proposal{" "}
                {review.proposalFingerprint
                  ? shortHash(review.proposalFingerprint)
                  : "legacy unbound record"}
              </small>
            </li>
          ))}
        </ol>
      ) : (
        <p className="human-review-empty">
          No human review has been recorded yet.
        </p>
      )}
    </section>
  );
}

function reviewDecisionLabel(decision: PublicCaseReview["decision"]): string {
  if (decision === "ACCEPT_RECOMMENDATION") return "Recommendation accepted";
  if (decision === "REFER_FOR_INFORMATION") return "More information requested";
  return "Case review declined";
}

function DetailStep({
  number,
  title,
  value,
  complete,
}: {
  number: string;
  title: string;
  value: string;
  complete: boolean;
}) {
  return (
    <li className={complete ? "complete" : "active"}>
      <span>{number}</span>
      <div>
        <strong>{title}</strong>
        <small>{value}</small>
      </div>
    </li>
  );
}

function ReceiptLink({
  label,
  hash,
  kind,
}: {
  label: string;
  hash: string;
  kind: "source" | "creditcoin";
}) {
  return (
    <a href={explorerUrl(kind, hash)} target="_blank" rel="noreferrer">
      <span>{label}</span>
      <code>{hash.slice(0, 10) + "…" + hash.slice(-8)}</code>
      <ArrowRight size={15} weight="bold" aria-hidden="true" />
    </a>
  );
}

function formatRole(role: PublicCaseResponse["case"]["role"]): string {
  if (role === "marketplace") return "Marketplace operator";
  if (role === "supplier") return "Supplier / shop owner";
  return "Lender / risk analyst";
}

function eventTypeLabel(eventType: string): string {
  if (eventType === "ORDER_GUARANTEED") return "ORDER GUARANTEED";
  if (eventType === "ORDER_CANCELLED") return "ORDER CANCELLED";
  if (eventType === "ORDER_DISPUTED") return "ORDER DISPUTED";
  if (eventType === "ORDER_SETTLED") return "ORDER SETTLED";
  return statusLabel(eventType);
}

function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    BUYER_GUARANTEE_VERIFIED:
      "Buyer guarantee is present in the source packet.",
    POSITIVE_SETTLEMENT_HISTORY: "The model found positive settlement history.",
    TENOR_WITHIN_POLICY: "Requested tenor is within the policy boundary.",
    CONCENTRATION_WITHIN_POLICY:
      "Buyer concentration is within the configured limit.",
    LIQUIDITY_AVAILABLE: "The evaluated liquidity check has capacity.",
    ADVANCE_LIMIT_EXCEEDED: "Requested advance exceeds the configured cap.",
    ORDER_CANCELLED: "The source order was cancelled.",
    ORDER_DISPUTED: "The source order is disputed.",
    QUOTE_EXPIRED: "The quote is outside its permitted lifetime.",
    MODEL_UNAVAILABLE: "The configured model did not return a usable quote.",
    EVIDENCE_MISSING: "Required evidence is missing or not bound exactly.",
  };
  return labels[reason] ?? "The model returned this bounded reason code.";
}

function sourceChainLabel(sourceChainKey: number | null): string {
  if (sourceChainKey === 1) return "Ethereum Sepolia";
  return sourceChainKey === null
    ? "Waiting for source receipt"
    : "Source chain key " + sourceChainKey;
}

function shortAddress(value: string): string {
  return value.slice(0, 6) + "…" + value.slice(-4);
}

function shortHash(value: string): string {
  return value.slice(0, 10) + "…" + value.slice(-8);
}

function formatMinorUnits(value: string): string {
  if (!/^\d+$/.test(value)) return "Unavailable";
  const amount = BigInt(value);
  const whole = amount / 1_000_000n;
  const cents = ((amount % 1_000_000n) / 10_000n).toString().padStart(2, "0");
  return "$" + whole.toLocaleString("en-US") + "." + cents;
}

function formatUnixDate(value: number): string {
  const date = new Date(value * 1_000);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return (
    new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recorded";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
