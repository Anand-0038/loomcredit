import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ChartLineUp,
  CheckCircle,
  FileLock,
  LockKey,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";

import { ProofConsole } from "../components/proof-console";
import { StructuredData } from "../components/structured-data";
import { TestnetArtifactCard } from "../components/testnet-artifact-card";
import { faqItems, faqStructuredData } from "../lib/seo";
import {
  formatSourceMinorUnits,
  sourceTestnetEvidence,
} from "../lib/source-evidence";
import {
  hasRecordedRiskGuardApproval,
  liveEvidence,
} from "../lib/live-evidence";

export const metadata: Metadata = {
  title: "Attested trade evidence for bounded underwriting",
  description:
    "LoomCredit connects buyer-backed trade events to evidence-bound AI proposals and deterministic RiskGuard controls.",
  alternates: { canonical: "/" },
};

const recordedRiskGuardApproval = hasRecordedRiskGuardApproval();
const demoProposedAdvanceMinor = Math.floor(
  (sourceTestnetEvidence.orderValueMinor * 3_000) / 10_000,
);

export default function HomePage() {
  return (
    <main>
      <StructuredData data={faqStructuredData} />
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="hero-kicker-row">
              <span className="eyebrow">Creditcoin × Attestcoin / testnet</span>
              <span className="hero-state-mark">
                Recorded prototype · read-only
              </span>
            </div>
            <h1>
              Verified orders.
              <br />
              Bounded <em>AI.</em>
              <br />
              Policy-controlled <em>actions.</em>
            </h1>
            <p className="lede">
              For a lender or marketplace operator, start with a verified order,
              see what a bounded advance could look like, and understand why
              policy says yes, no, or review.
            </p>
            <p className="hero-boundary-line">
              Under the hood: Attestcoin proves the event, AI proposes, and
              deterministic policy controls the next gate.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/review">
                Review a case{" "}
                <ArrowRight size={18} weight="bold" aria-hidden="true" />
              </Link>
              <Link
                className="button button-secondary"
                href={`/proof/${liveEvidence.creditcoin.evidenceId}`}
              >
                Inspect recorded proof
              </Link>
            </div>
            <div className="hero-thesis" role="note">
              <span className="hero-thesis-label">The thesis</span>
              <p>
                Let evidence open the door. Let policy decide whether anything
                moves through it.
              </p>
            </div>
            <div className="hero-case-preview" aria-label="Local policy sample">
              <span>Try one finance case</span>
              <strong>
                {formatSourceMinorUnits(sourceTestnetEvidence.orderValueMinor)}{" "}
                order → {formatSourceMinorUnits(demoProposedAdvanceMinor)}
              </strong>
              <small>Local policy sample · NO_CAPITAL_MOVED</small>
            </div>
          </div>
          <div className="hero-proof-wrap">
            <div
              className="hero-proof-card"
              aria-label="Recorded Sepolia source receipt summary"
            >
              <div className="hero-proof-head">
                <span className="card-kicker">
                  Source receipt / recorded testnet
                </span>
                <span className="hero-proof-status">
                  <CheckCircle size={14} weight="bold" aria-hidden="true" />
                  {recordedRiskGuardApproval
                    ? "RiskGuard approved · sandbox"
                    : "Source + CC3 verified"}
                </span>
              </div>
              <div
                className="hero-proof-trace"
                aria-label={
                  recordedRiskGuardApproval
                    ? "Recorded evidence path: Ethereum source event, Attestcoin and USC proof, Creditcoin verification, registered evidence, AI proposal, and RiskGuard approval receipt"
                    : "Recorded evidence path: Ethereum source event, Attestcoin and USC proof, Creditcoin verification, registered evidence, then an AI proposal and RiskGuard decision as separate gates"
                }
              >
                <span className="hero-proof-trace-line" aria-hidden="true" />
                <span className="hero-proof-step verified">
                  <span className="hero-proof-step-dot">
                    <CheckCircle size={14} weight="bold" aria-hidden="true" />
                  </span>
                  <strong>Ethereum</strong>
                  <small>source event</small>
                </span>
                <span className="hero-proof-step verified">
                  <span className="hero-proof-step-dot">
                    <CheckCircle size={14} weight="bold" aria-hidden="true" />
                  </span>
                  <strong>Attestcoin</strong>
                  <small>USC proof</small>
                </span>
                <span className="hero-proof-step verified">
                  <span className="hero-proof-step-dot">
                    <CheckCircle size={14} weight="bold" aria-hidden="true" />
                  </span>
                  <strong>Creditcoin</strong>
                  <small>verification</small>
                </span>
                <span className="hero-proof-step verified">
                  <span className="hero-proof-step-dot">
                    <CheckCircle size={14} weight="bold" aria-hidden="true" />
                  </span>
                  <strong>Evidence</strong>
                  <small>registered</small>
                </span>
                <span className="hero-proof-step verified">
                  <span className="hero-proof-step-dot">
                    <CheckCircle size={14} weight="bold" aria-hidden="true" />
                  </span>
                  <strong>AI</strong>
                  <small>proposal</small>
                </span>
                <span
                  className={
                    recordedRiskGuardApproval
                      ? "hero-proof-step verified"
                      : "hero-proof-step next"
                  }
                >
                  <span className="hero-proof-step-dot">
                    {recordedRiskGuardApproval ? (
                      <CheckCircle size={14} weight="bold" aria-hidden="true" />
                    ) : (
                      <LockKey size={14} weight="bold" aria-hidden="true" />
                    )}
                  </span>
                  <strong>RiskGuard</strong>
                  <small>
                    {recordedRiskGuardApproval ? "receipt" : "next gate"}
                  </small>
                </span>
              </div>
              <h2>A buyer commitment recorded before policy acts.</h2>
              <dl className="proof-meta-list">
                <div className="proof-meta-row">
                  <dt>Order value</dt>
                  <dd>
                    {formatSourceMinorUnits(
                      sourceTestnetEvidence.orderValueMinor,
                    )}
                  </dd>
                </div>
                <div className="proof-meta-row">
                  <dt>Buyer guarantee</dt>
                  <dd>
                    {formatSourceMinorUnits(
                      sourceTestnetEvidence.guaranteeAmountMinor,
                    )}
                  </dd>
                </div>
                <div className="proof-meta-row">
                  <dt>Source network</dt>
                  <dd>{sourceTestnetEvidence.network}</dd>
                </div>
                <div className="proof-meta-row">
                  <dt>CC3 receipt</dt>
                  <dd>Verified</dd>
                </div>
              </dl>
              <a
                className="hero-proof-link"
                href={sourceTestnetEvidence.transactionExplorer}
                target="_blank"
                rel="noreferrer"
              >
                Open Sepolia receipt{" "}
                <ArrowRight size={15} weight="bold" aria-hidden="true" />
              </a>
              <a
                className="hero-proof-link"
                href={liveEvidence.creditcoin.verificationTransactionExplorer}
                target="_blank"
                rel="noreferrer"
              >
                Open CC3 receipt{" "}
                <ArrowRight size={15} weight="bold" aria-hidden="true" />
              </a>
            </div>
            <p className="hero-proof-caption">
              <span aria-hidden="true" />
              {recordedRiskGuardApproval
                ? "Observed on testnet. The approval is accounting-only, not a loan."
                : "Observed on testnet. Quote execution is a separate policy step."}
            </p>
          </div>
        </div>
      </section>

      <section className="section section-compact">
        <div className="container">
          <TestnetArtifactCard />
        </div>
      </section>

      <section className="section section-alt section-compact">
        <div
          className="container metric-strip"
          aria-label="LoomCredit product boundary"
        >
          <div className="metric">
            <strong>01</strong>
            <span>proof-backed order path</span>
          </div>
          <div className="metric">
            <strong>10</strong>
            <span>deterministic policy checks</span>
          </div>
          <div className="metric">
            <strong>0</strong>
            <span>claims of live capital in this demo</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">One complete workflow</span>
              <h2>Evidence, intelligence, controls — each with a clear job.</h2>
            </div>
            <p>
              The product wedge is narrow on purpose: bridge a verified trade
              event into a bounded underwriting action without turning the model
              into a hidden money mover.
            </p>
          </div>
          <div className="three-up">
            <article className="feature-card">
              <span className="feature-icon">
                <FileLock size={21} weight="bold" aria-hidden="true" />
              </span>
              <h3>Attestcoin proves the evidence.</h3>
              <p>
                USC query proofs, receipt success, trusted emitter checks, exact
                event fields, and replay protection make the source event
                admissible.
              </p>
            </article>
            <article className="feature-card">
              <span className="feature-icon">
                <ChartLineUp size={21} weight="bold" aria-hidden="true" />
              </span>
              <h3>The AI proposes the action.</h3>
              <p>
                A structured model adapter can return a schema-bound facility
                quote. Missing evidence or a missing model yields REFER, not a
                made-up answer.
              </p>
            </article>
            <article className="feature-card">
              <span className="feature-icon">
                <ShieldCheck size={21} weight="bold" aria-hidden="true" />
              </span>
              <h3>RiskGuard controls the action.</h3>
              <p>
                Advance, guarantee, tenor, concentration, liquidity, signer,
                evidence, expiry, and nonce checks run before sandbox capital is
                reserved.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="section-heading operator-flow-heading">
            <div>
              <span className="eyebrow">Use it as an operator</span>
              <h2>Start with a case, not a test button.</h2>
            </div>
            <p>
              A lender, marketplace operator, or supplier brings an order
              reference first. LoomCredit checks the evidence boundary before a
              proposal or policy action can be considered.
            </p>
          </div>
          <div className="operator-flow">
            <article className="operator-step">
              <span>01</span>
              <h3>Open a finance case</h3>
              <p>
                Enter a source transaction, requested advance, and delivery
                tenor. In a marketplace integration, the order system would
                provide this reference instead of a manual copy-and-paste.
              </p>
            </article>
            <article className="operator-step">
              <span>02</span>
              <h3>Inspect the evidence</h3>
              <p>
                Follow the source receipt, USC proof, Creditcoin registry state,
                lifecycle, and replay-safe evidence ID.
              </p>
            </article>
            <article className="operator-step">
              <span>03</span>
              <h3>See the controlled next gate</h3>
              <p>
                A structured model proposal is available only after verified
                evidence. A separate signer and RiskGuard policy gate remain
                responsible for any action.
              </p>
            </article>
          </div>
          <div className="operator-flow-actions">
            <Link className="button button-primary" href="/review">
              Start a case review{" "}
              <ArrowRight size={18} weight="bold" aria-hidden="true" />
            </Link>
            <span className="operator-flow-boundary">
              Unknown references stop with <code>EVIDENCE_NOT_FOUND</code>.
            </span>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Architecture</span>
              <h2>A proof rail from source order to governed quote.</h2>
            </div>
            <Link
              className="text-link"
              href={`/proof/${liveEvidence.creditcoin.evidenceId}`}
            >
              Inspect live evidence{" "}
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </Link>
          </div>
          <div className="architecture-frame">
            <Image
              src="/assets/architecture-diagram.png"
              alt="LoomCredit architecture: a buyer-backed source order on Sepolia moves through Attestcoin and USC proof, Creditcoin evidence registration, a structured underwriting agent, RiskGuard policy checks, and an accounting-only sandbox vault"
              width={1600}
              height={820}
              loading="eager"
              sizes="(max-width: 720px) calc(100vw - 48px), min(1120px, calc(100vw - 60px))"
            />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <ProofConsole mode="live" />
        </div>
      </section>

      <section className="section section-alt">
        <div className="container section-heading section-heading-no-margin">
          <div>
            <span className="eyebrow">Make the stop visible</span>
            <h2>
              See a safe quote pass — then change one value and watch policy
              reject it.
            </h2>
          </div>
          <Link className="button button-primary" href="/demo">
            Run the local scenarios{" "}
            <ArrowRight size={18} weight="bold" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="section section-alt faq-section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Short answers</span>
              <h2 id="faq-heading">
                What partners need to know before inspecting the system.
              </h2>
            </div>
            <p>
              Clear boundaries are part of the product. These answers describe
              what the prototype verifies, what the agent can propose, and where
              live deployment still begins.
            </p>
          </div>
          <div className="faq-list" aria-labelledby="faq-heading">
            {faqItems.map((item) => (
              <details className="faq-row" key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
