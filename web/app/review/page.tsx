import type { Metadata } from "next";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { LiveCaseIntake } from "../../components/live-case-intake";
import { Breadcrumbs } from "../../components/structured-data";
import { liveEvidence } from "../../lib/live-evidence";
import { sourceTestnetEvidence } from "../../lib/source-evidence";

export const metadata: Metadata = {
  title: "Review a case",
  description:
    "Open a LoomCredit finance case, inspect its evidence boundary, and understand the next controlled action.",
  robots: { index: false, follow: true },
};

export default function ReviewPage() {
  return (
    <main>
      <section className="page-hero">
        <div className="container page-hero-grid">
          <div>
            <Breadcrumbs
              items={[{ label: "Home", href: "/" }, { label: "Review a case" }]}
            />
            <span className="eyebrow">Operator workspace</span>
            <h1>Turn an order into a reviewable case.</h1>
            <p>
              Bring a source transaction from a buyer-backed order. LoomCredit
              records a durable case, verifies the evidence, and makes the next
              controlled decision inspectable.
            </p>
            <div className="hero-actions">
              <Link className="button button-secondary" href="/access">
                Operator sign-in{" "}
                <ArrowRight size={17} weight="bold" aria-hidden="true" />
              </Link>
              <Link className="text-link" href="/security">
                Read the security boundary{" "}
                <ArrowRight size={15} weight="bold" aria-hidden="true" />
              </Link>
            </div>
          </div>
          <aside className="page-hero-route" aria-label="Case review steps">
            <div className="page-hero-route-heading">
              <span>What an operator does</span>
              <span className="page-hero-route-code">EVIDENCE FIRST</span>
            </div>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>Start</strong>
                  <small>Enter a source transaction and requested terms.</small>
                </div>
                <em>INTAKE</em>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Verify</strong>
                  <small>Inspect receipts, proof, and lifecycle state.</small>
                </div>
                <em>PROOF</em>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Decide</strong>
                  <small>
                    Keep proposal, policy, and human action separate.
                  </small>
                </div>
                <em>CONTROL</em>
              </li>
            </ol>
          </aside>
        </div>
      </section>
      <section className="page-main">
        <div className="container">
          <LiveCaseIntake
            recordedSourceTxHash={sourceTestnetEvidence.transactionHash}
          />
          <section
            className="review-recorded-example"
            aria-labelledby="recorded-example-title"
          >
            <div className="review-recorded-example-heading section-heading">
              <div>
                <span className="eyebrow">Read-only reference</span>
                <h2 id="recorded-example-title">
                  Need a known proof to orient yourself?
                </h2>
              </div>
              <p>
                This recorded testnet receipt is a compact reference for the
                evidence chain. It does not create a case or stand in for a new
                source transaction. Use the live intake above for operational
                work.
              </p>
            </div>
            <div className="review-recorded-reference">
              <div>
                <span className="eyebrow">Recorded testnet artifact</span>
                <strong>One verified order · one linked USC receipt</strong>
                <p>
                  {sourceTestnetEvidence.network} ·{" "}
                  {sourceTestnetEvidence.blockNumber
                    ? "block " + sourceTestnetEvidence.blockNumber
                    : "block recorded"}{" "}
                  · evidence {liveEvidence.creditcoin.evidenceId.slice(0, 10)}…
                </p>
              </div>
              <div className="review-recorded-reference-actions">
                <Link
                  className="button button-secondary"
                  href={"/orders/" + sourceTestnetEvidence.orderId}
                >
                  Inspect recorded order{" "}
                  <ArrowRight size={16} weight="bold" aria-hidden="true" />
                </Link>
                <Link
                  className="text-link"
                  href={"/proof/" + liveEvidence.creditcoin.evidenceId}
                >
                  Open proof console{" "}
                  <ArrowRight size={15} weight="bold" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
