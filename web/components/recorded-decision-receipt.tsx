import {
  ArrowUpRight,
  CheckCircle,
  Fingerprint,
  LockKey,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { shortenId } from "../lib/demo-data";
import {
  hasRecordedRiskGuardApproval,
  liveEvidence,
  recordedRiskGuardReceipt,
} from "../lib/live-evidence";

function percentFromBps(value: unknown): string {
  return typeof value === "number"
    ? `${(value / 100).toFixed(2)}%`
    : "Not recorded";
}

function providerLabel(value: unknown): string {
  if (typeof value !== "string" || value.length === 0)
    return "Recorded provider";
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

function recordedAtLabel(value: unknown): string {
  if (typeof value !== "string") return "Recorded testnet artifact";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "Recorded testnet artifact";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(timestamp);
}

export function RecordedDecisionReceipt() {
  if (!hasRecordedRiskGuardApproval()) return null;

  const receipt = recordedRiskGuardReceipt();
  const agent = liveEvidence.agent;
  const signing = agent?.signing;
  const submission = signing?.submission;
  if (!receipt || !agent || !signing || !submission) return null;

  const auditStatus = submission.audit?.status;
  return (
    <section
      className="recorded-decision-receipt"
      aria-labelledby="recorded-decision-receipt-title"
    >
      <div className="recorded-decision-heading">
        <div>
          <span className="eyebrow">Recorded decision receipt</span>
          <h2 id="recorded-decision-receipt-title">
            The action boundary is inspectable.
          </h2>
          <p>
            This historical CC3 testnet receipt connects one verified order to
            one structured proposal, one signer, and one policy-controlled
            accounting action. It is not an active offer, a loan, or custody of
            funds.
          </p>
        </div>
        <span className="status-pill">
          <CheckCircle size={14} weight="bold" aria-hidden="true" />
          Recorded · no capital moved
        </span>
      </div>

      <ol
        className="recorded-decision-grid"
        aria-label="Recorded decision chain"
      >
        <li className="recorded-decision-step">
          <span className="recorded-decision-icon" aria-hidden="true">
            <ShieldCheck size={19} weight="bold" />
          </span>
          <span className="recorded-decision-label">01 · Evidence</span>
          <strong>Source + native USC proof</strong>
          <small>
            Order <code>{shortenId(liveEvidence.source.orderId)}</code>
            <br />
            Evidence{" "}
            <code>{shortenId(liveEvidence.creditcoin.evidenceId)}</code>
          </small>
          <Link
            className="text-link"
            href={`/proof/${liveEvidence.creditcoin.evidenceId}`}
          >
            Inspect proof <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
        </li>

        <li className="recorded-decision-step">
          <span className="recorded-decision-icon" aria-hidden="true">
            <Fingerprint size={19} weight="bold" />
          </span>
          <span className="recorded-decision-label">02 · Proposal</span>
          <strong>
            {agent.decision} · tier {agent.riskTier}
          </strong>
          <small>
            {providerLabel(agent.provider)} ·{" "}
            {agent.model ?? agent.modelVersion}
            <br />
            {percentFromBps(agent.advanceBps)} advance ·{" "}
            {percentFromBps(agent.feeBps)} fee
          </small>
        </li>

        <li className="recorded-decision-step">
          <span className="recorded-decision-icon" aria-hidden="true">
            <ShieldCheck size={19} weight="bold" />
          </span>
          <span className="recorded-decision-label">03 · Policy</span>
          <strong>RiskGuard approved</strong>
          <small>
            Policy <code>{agent.policyVersion}</code>
            <br />
            {agent.policyDecision} · chain {signing.chainId}
          </small>
        </li>

        <li className="recorded-decision-step">
          <span className="recorded-decision-icon" aria-hidden="true">
            <LockKey size={19} weight="bold" />
          </span>
          <span className="recorded-decision-label">04 · Authorization</span>
          <strong>EIP-712 signer boundary</strong>
          <small>
            Signer <code>{shortenId(signing.signer)}</code>
            <br />
            {signing.validation}
          </small>
        </li>

        <li className="recorded-decision-step">
          <span className="recorded-decision-icon" aria-hidden="true">
            <CheckCircle size={19} weight="bold" />
          </span>
          <span className="recorded-decision-label">05 · Action</span>
          <strong>SANDBOX_RESERVED</strong>
          <small>
            QuoteApproved · {recordedAtLabel(liveEvidence.generatedAt)}
            <br />
            NO_CAPITAL_MOVED
          </small>
          <a
            className="text-link"
            href={receipt.explorer}
            target="_blank"
            rel="noreferrer"
          >
            Open CC3 receipt <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </li>
      </ol>

      {auditStatus === "NOT_AVAILABLE_ON_DEPLOYED_BYTECODE" ? (
        <p className="recorded-decision-note">
          The recorded deployment exposes the backwards-compatible
          <code>QuoteApproved</code> event. The newer full decision-term audit
          event requires a fresh deployment and fresh evidence; this receipt
          does not imply that upgrade.
        </p>
      ) : null}
    </section>
  );
}
