import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CaretLeft,
  CheckCircle,
  CopySimple,
} from "@phosphor-icons/react/dist/ssr";

import { ProofConsole } from "../../../components/proof-console";
import { demoOrder, formatMinorUnits, shortenId } from "../../../lib/demo-data";
import { liveEvidence } from "../../../lib/live-evidence";
import { formatSourceMinorUnits } from "../../../lib/source-evidence";

export function generateStaticParams() {
  return [
    { orderId: demoOrder.orderId },
    { orderId: liveEvidence.source.orderId },
  ];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orderId: string }>;
}): Promise<Metadata> {
  const { orderId } = await params;
  const isLiveEvidence =
    orderId.toLowerCase() === liveEvidence.source.orderId.toLowerCase();

  if (isLiveEvidence) {
    return {
      title: "Recorded testnet order evidence",
      description:
        "Inspect LoomCredit's recorded Sepolia order, Creditcoin CC3 verification receipt, and evidence registry read-back.",
      alternates: { canonical: `/orders/${liveEvidence.source.orderId}` },
      openGraph: {
        title: "Recorded testnet order evidence — LoomCredit",
        description:
          "A recorded Sepolia-to-Creditcoin CC3 evidence path for a buyer-backed trade event.",
        type: "article",
      },
    };
  }

  return {
    title: "Local order fixture",
    description:
      "A local LoomCredit evidence fixture used to explain the product boundary; it is not a live transaction.",
    alternates: { canonical: `/orders/${orderId}` },
    robots: { index: false, follow: false },
  };
}

export default async function OrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const isLocalFixture =
    orderId.toLowerCase() === demoOrder.orderId.toLowerCase();
  const isLiveEvidence =
    orderId.toLowerCase() === liveEvidence.source.orderId.toLowerCase();
  const order = isLocalFixture
    ? demoOrder
    : isLiveEvidence
      ? {
          orderId: liveEvidence.source.orderId,
          evidenceId: liveEvidence.creditcoin.evidenceId,
          status: liveEvidence.packet.facilityState,
          proofStatus: liveEvidence.packet.proofStatus,
          sourceChain: liveEvidence.packet.sourceChain,
          executionChain: liveEvidence.packet.executionChain,
          orderValue: liveEvidence.packet.orderValueMinor,
          guaranteeAmount: liveEvidence.packet.guaranteeAmountMinor,
          tenorDays: liveEvidence.packet.tenorDays,
          buyerSettlementCount: liveEvidence.packet.buyerSettlementCount,
          buyerDisputeCount: liveEvidence.packet.buyerDisputeCount,
          supplierSettlementCount: liveEvidence.packet.supplierSettlementCount,
        }
      : null;

  if (!order) {
    return (
      <main>
        <section className="page-main">
          <div className="narrow-container empty-state">
            <p>
              That order is not present in the recorded or local evidence store.
            </p>
            <Link className="text-link" href="/demo">
              <CaretLeft size={16} weight="bold" aria-hidden="true" /> Back to
              the demo lab
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const formatOrderAmount = (value: number) =>
    isLiveEvidence ? formatSourceMinorUnits(value) : formatMinorUnits(value);

  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <Link className="text-link" href="/demo">
            <CaretLeft size={16} weight="bold" aria-hidden="true" /> Demo lab
          </Link>
          <h1>
            {isLiveEvidence
              ? "Recorded order packet, with its proof attached."
              : "Order packet, with its boundaries attached."}
          </h1>
          <p>
            {isLiveEvidence
              ? "This packet is backed by a mined Sepolia receipt, a native CC3 verification receipt, and an independent registry read-back."
              : "The UI exposes the evidence and policy shape without turning fixture identifiers into claims of live chain activity."}
          </p>
        </div>
      </section>
      <section className="page-main">
        <div className="container">
          <div className="two-column">
            <section
              className="surface-card"
              aria-labelledby="order-summary-title"
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <span className="eyebrow">Order summary</span>
                  <h2 id="order-summary-title" style={{ marginTop: 10 }}>
                    {isLiveEvidence
                      ? "Recorded testnet order"
                      : "Example order packet"}
                  </h2>
                </div>
                <span
                  className={`status-pill${isLiveEvidence ? "" : " local"}`}
                >
                  <CheckCircle size={14} weight="bold" aria-hidden="true" />{" "}
                  {isLiveEvidence ? "live verified" : "local fixture"}
                </span>
              </div>
              <dl className="data-grid">
                <div className="data-item">
                  <dt>Source chain</dt>
                  <dd>{order.sourceChain}</dd>
                </div>
                <div className="data-item">
                  <dt>Execution chain</dt>
                  <dd>{order.executionChain}</dd>
                </div>
                <div className="data-item">
                  <dt>Order value</dt>
                  <dd>{formatOrderAmount(order.orderValue)}</dd>
                </div>
                <div className="data-item">
                  <dt>Buyer guarantee</dt>
                  <dd>{formatOrderAmount(order.guaranteeAmount)}</dd>
                </div>
                <div className="data-item">
                  <dt>Tenor</dt>
                  <dd>{order.tenorDays} days</dd>
                </div>
                <div className="data-item">
                  <dt>Facility state</dt>
                  <dd>
                    {isLiveEvidence ? (
                      <Link
                        className="text-link"
                        href={`/proof/${order.evidenceId}`}
                        aria-label="Open the live evidence proof console"
                      >
                        {order.status}
                      </Link>
                    ) : (
                      order.status
                    )}
                  </dd>
                </div>
              </dl>
              {isLiveEvidence ? (
                <div className="callout">
                  <strong>Transaction record:</strong> recorded on testnet after
                  successful source and CC3 operations.
                  <div style={{ marginTop: 8 }}>
                    <a
                      className="text-link"
                      href={liveEvidence.source.explorer}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Sepolia receipt{" "}
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </a>{" "}
                    ·{" "}
                    <a
                      className="text-link"
                      href={
                        liveEvidence.creditcoin.verificationTransactionExplorer
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      CC3 verification receipt{" "}
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="callout">
                  <strong>Transaction record:</strong> not recorded in this
                  local fixture. A live worker would persist the source and
                  Creditcoin transaction hashes only after the corresponding
                  network operations return them.
                </div>
              )}
              <Link
                className="text-link"
                style={{ marginTop: 22 }}
                href={`/proof/${order.evidenceId}`}
              >
                Open evidence console{" "}
                <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </Link>
            </section>
            <section
              className="surface-card"
              aria-labelledby="commitments-title"
            >
              <span className="eyebrow">Evidence binding</span>
              <h2 id="commitments-title" style={{ marginTop: 10 }}>
                Identity commitments stay opaque.
              </h2>
              <p>
                {isLiveEvidence
                  ? "The worker bound this evidence ID to the order and source query key after the native CC3 verification succeeded."
                  : "The worker binds an evidence ID to the order and source query key. This local page shows the shape, not a fabricated proof."}
              </p>
              <dl className="data-grid">
                <div className="data-item">
                  <dt>Evidence ID</dt>
                  <dd className="mono">
                    {isLiveEvidence ? (
                      <Link
                        className="text-link mono"
                        href={`/proof/${order.evidenceId}`}
                        aria-label="Open the live evidence proof console"
                      >
                        {shortenId(order.evidenceId)}
                      </Link>
                    ) : (
                      "Not recorded on-chain"
                    )}
                  </dd>
                </div>
                <div className="data-item">
                  <dt>Proof status</dt>
                  <dd>{order.proofStatus}</dd>
                </div>
                <div className="data-item">
                  <dt>Buyer history</dt>
                  <dd>
                    {order.buyerSettlementCount} settlements /{" "}
                    {order.buyerDisputeCount} dispute
                  </dd>
                </div>
                <div className="data-item">
                  <dt>Supplier history</dt>
                  <dd>{order.supplierSettlementCount} settlements</dd>
                </div>
              </dl>
              <p
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                }}
              >
                <CopySimple size={16} weight="bold" aria-hidden="true" /> Only
                aggregate history is shown; private identity commitments remain
                off-screen.
              </p>
            </section>
          </div>
          <div style={{ marginTop: 18 }}>
            <ProofConsole compact mode={isLiveEvidence ? "live" : "local"} />
          </div>
        </div>
      </section>
    </main>
  );
}
