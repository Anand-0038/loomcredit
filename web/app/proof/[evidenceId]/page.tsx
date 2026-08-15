import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";

import { ProofConsole } from "../../../components/proof-console";
import { demoOrder } from "../../../lib/demo-data";
import { liveEvidence } from "../../../lib/live-evidence";
import { shortenId } from "../../../lib/demo-data";

export function generateStaticParams() {
  return [
    { evidenceId: demoOrder.evidenceId },
    { evidenceId: liveEvidence.creditcoin.evidenceId },
  ];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ evidenceId: string }>;
}): Promise<Metadata> {
  const { evidenceId } = await params;
  const isLive =
    evidenceId.toLowerCase() ===
    liveEvidence.creditcoin.evidenceId.toLowerCase();

  if (isLive) {
    return {
      title: "Verified Creditcoin evidence console",
      description:
        "Inspect the recorded Sepolia source receipt, native Creditcoin CC3 verification receipt, and independent evidence registry read-back.",
      alternates: {
        canonical: `/proof/${liveEvidence.creditcoin.evidenceId}`,
      },
      openGraph: {
        title: "Verified Creditcoin evidence console — LoomCredit",
        description:
          "Recorded testnet proof evidence for a buyer-backed trade lifecycle event.",
        type: "article",
      },
    };
  }

  return {
    title: "Local proof fixture",
    description:
      "A local LoomCredit proof fixture used to explain evidence checks; it is not recorded on-chain.",
    alternates: { canonical: `/proof/${evidenceId}` },
    robots: { index: false, follow: false },
  };
}

export default async function ProofPage({
  params,
}: {
  params: Promise<{ evidenceId: string }>;
}) {
  const { evidenceId } = await params;
  const known = evidenceId.toLowerCase() === demoOrder.evidenceId.toLowerCase();
  const live =
    evidenceId.toLowerCase() ===
    liveEvidence.creditcoin.evidenceId.toLowerCase();
  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <Link
            className="text-link"
            href={
              live
                ? `/orders/${liveEvidence.source.orderId}`
                : `/orders/${demoOrder.orderId}`
            }
          >
            <ArrowLeft size={16} weight="bold" aria-hidden="true" />
            {live ? " Recorded order packet" : " Order packet"}
          </Link>
          <h1>Proof console.</h1>
          <p>
            {live
              ? "Inspect the recorded Sepolia-to-Creditcoin USC handoff and its independently read-back evidence state."
              : known
                ? "A transparent look at the local handoff from source event to policy boundary."
                : "This evidence ID is not present in the recorded or local fixture store."}
          </p>
        </div>
      </section>
      <section className="page-main">
        <div className="container">
          {live ? (
            <>
              <ProofConsole mode="live" />
              <div className="two-column" style={{ marginTop: 18 }}>
                <section className="surface-card">
                  <span className="eyebrow">LIVE TESTNET</span>
                  <h2 style={{ marginTop: 10 }}>Evidence verified on CC3.</h2>
                  <p>
                    The worker submitted the Attestcoin proof to
                    TradeEvidenceUSC. The receipt and FacilityRegistry state
                    were read back independently after mining.
                  </p>
                  <dl className="console-list">
                    <div>
                      <dt>Evidence ID</dt>
                      <dd>
                        <a
                          className="text-link mono"
                          href={
                            liveEvidence.creditcoin
                              .verificationTransactionExplorer
                          }
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open the CC3 transaction that registered this evidence"
                        >
                          {shortenId(liveEvidence.creditcoin.evidenceId)}{" "}
                          <ArrowUpRight size={13} aria-hidden="true" />
                        </a>
                      </dd>
                    </div>
                    <div>
                      <dt>Facility state</dt>
                      <dd>
                        <a
                          className="text-link"
                          href={
                            liveEvidence.creditcoin.facilityRegistryExplorer
                          }
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open the CC3 FacilityRegistry used for the state read-back"
                        >
                          {liveEvidence.creditcoin.stateReadBack}{" "}
                          <ArrowUpRight size={13} aria-hidden="true" />
                        </a>
                      </dd>
                    </div>
                  </dl>
                </section>
                <section className="surface-card">
                  <span className="eyebrow">Receipts</span>
                  <h2 style={{ marginTop: 10 }}>Follow the proof.</h2>
                  <p>
                    These links are public testnet artifacts. They do not
                    represent a loan, deposit, or investment product.
                  </p>
                  <p>
                    <a
                      className="text-link"
                      href={liveEvidence.source.explorer}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Sepolia source receipt{" "}
                      <ArrowRight size={14} aria-hidden="true" />
                    </a>
                  </p>
                  <p>
                    <a
                      className="text-link"
                      href={
                        liveEvidence.creditcoin.verificationTransactionExplorer
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      Creditcoin verification receipt{" "}
                      <ArrowRight size={14} aria-hidden="true" />
                    </a>
                  </p>
                  <span className="status-pill">
                    <CheckCircle size={14} weight="bold" aria-hidden="true" />{" "}
                    LIVE_VERIFIED
                  </span>
                </section>
              </div>
            </>
          ) : known ? (
            <>
              <ProofConsole mode="local" />
              <div className="two-column" style={{ marginTop: 18 }}>
                <section className="surface-card">
                  <span className="eyebrow">What is checked</span>
                  <h2 style={{ marginTop: 10 }}>
                    Evidence is more than inclusion.
                  </h2>
                  <ul>
                    <li>Receipt status must be successful before decoding.</li>
                    <li>
                      The configured source escrow must be the event emitter.
                    </li>
                    <li>
                      Order terms, commitments, and log index must match
                      expected data.
                    </li>
                    <li>The query key must not have been processed before.</li>
                  </ul>
                </section>
                <section className="surface-card">
                  <span className="eyebrow">Current boundary</span>
                  <h2 style={{ marginTop: 10 }}>
                    Local fixture, not live proof.
                  </h2>
                  <p>
                    The contracts and worker contain the real USC shape, but
                    this browser route deliberately has no deployed address,
                    proof response, or transaction hash to show.
                  </p>
                  <p className="mono">evidenceId: not recorded on-chain</p>
                  <span className="status-pill local">
                    <CheckCircle size={14} weight="bold" aria-hidden="true" />{" "}
                    not recorded on-chain
                  </span>
                </section>
              </div>
            </>
          ) : (
            <div className="narrow-container empty-state">
              <ShieldCheck
                size={34}
                color="var(--slate)"
                weight="duotone"
                aria-hidden="true"
              />
              <p>No recorded or local evidence packet matches this ID.</p>
              <Link className="text-link" href="/demo">
                Run the demo lab{" "}
                <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
