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
import { liveEvidence } from "../lib/live-evidence";

export const metadata: Metadata = {
  title: "Attested trade evidence for bounded underwriting",
  description:
    "LoomCredit connects buyer-backed trade events to evidence-bound AI proposals and deterministic RiskGuard controls.",
  alternates: { canonical: "/" },
};

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
              LoomCredit turns proof-backed trade evidence into a quote that can
              be inspected, signed, and stopped by policy before capital is
              reserved.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/demo">
                Open the demo lab{" "}
                <ArrowRight size={18} weight="bold" aria-hidden="true" />
              </Link>
              <Link className="button button-secondary" href="/security">
                See the controls
              </Link>
            </div>
            <div className="hero-thesis" role="note">
              <span className="hero-thesis-label">The thesis</span>
              <p>
                Let evidence open the door. Let policy decide whether anything
                moves through it.
              </p>
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
                  Source + CC3 verified
                </span>
              </div>
              <div
                className="hero-proof-trace"
                aria-label="Recorded evidence path: source receipt, USC proof, facility registry, then RiskGuard as the next gate"
              >
                <span className="hero-proof-trace-line" aria-hidden="true" />
                <span className="hero-proof-step verified">
                  <span className="hero-proof-step-dot">
                    <CheckCircle size={14} weight="bold" aria-hidden="true" />
                  </span>
                  <strong>Source</strong>
                  <small>receipt</small>
                </span>
                <span className="hero-proof-step verified">
                  <span className="hero-proof-step-dot">
                    <CheckCircle size={14} weight="bold" aria-hidden="true" />
                  </span>
                  <strong>USC</strong>
                  <small>proof</small>
                </span>
                <span className="hero-proof-step verified">
                  <span className="hero-proof-step-dot">
                    <CheckCircle size={14} weight="bold" aria-hidden="true" />
                  </span>
                  <strong>CC3</strong>
                  <small>registry</small>
                </span>
                <span className="hero-proof-step next">
                  <span className="hero-proof-step-dot">
                    <LockKey size={14} weight="bold" aria-hidden="true" />
                  </span>
                  <strong>Guard</strong>
                  <small>next gate</small>
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
              Observed on testnet. Quote execution is a separate policy step.
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
        <div className="container section-heading" style={{ marginBottom: 0 }}>
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
