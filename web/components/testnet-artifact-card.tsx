import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { shortenId } from "../lib/demo-data";
import {
  formatSourceMinorUnits,
  sourceTestnetEvidence,
} from "../lib/source-evidence";
import { liveEvidence } from "../lib/live-evidence";

export function TestnetArtifactCard() {
  return (
    <section
      className="testnet-artifact"
      aria-labelledby="testnet-artifact-title"
    >
      <div className="testnet-artifact-header">
        <div>
          <span className="eyebrow">Recorded testnet artifact</span>
          <h2 id="testnet-artifact-title">
            One source order. One native USC receipt. Independently readable.
          </h2>
          <p>
            A real Sepolia <code>OrderGuaranteed</code> transaction was proved
            by the worker and registered on Creditcoin CC3. The evidence ID and
            both receipts are linked below; quote execution remains a separate
            policy step.
          </p>
        </div>
        <span className="status-pill">
          <CheckCircle size={14} weight="bold" aria-hidden="true" /> Source +
          CC3 verified
        </span>
      </div>

      <div className="testnet-artifact-grid">
        <div className="testnet-artifact-item">
          <span>Sepolia source receipt</span>
          <strong>{sourceTestnetEvidence.network}</strong>
          <a
            href={sourceTestnetEvidence.transactionExplorer}
            target="_blank"
            rel="noreferrer"
          >
            {shortenId(sourceTestnetEvidence.transactionHash)}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
        <div className="testnet-artifact-item">
          <span>Creditcoin USC receipt</span>
          <strong>CC3 native verification</strong>
          <a
            href={liveEvidence.creditcoin.verificationTransactionExplorer}
            target="_blank"
            rel="noreferrer"
          >
            {shortenId(liveEvidence.creditcoin.verificationTransactionHash)}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
        <div className="testnet-artifact-item">
          <span>Order packet</span>
          <strong>
            {formatSourceMinorUnits(sourceTestnetEvidence.orderValueMinor)}{" "}
            order
          </strong>
          <small>
            {formatSourceMinorUnits(sourceTestnetEvidence.guaranteeAmountMinor)}
            buyer guarantee · block {sourceTestnetEvidence.blockNumber}
          </small>
        </div>
        <div className="testnet-artifact-item">
          <span>Source escrow</span>
          <strong>{shortenId(sourceTestnetEvidence.escrowAddress)}</strong>
          <a
            href={sourceTestnetEvidence.escrowExplorer}
            target="_blank"
            rel="noreferrer"
          >
            Inspect contract <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className="testnet-artifact-checks" aria-label="Evidence status">
        <div className="testnet-artifact-check">
          <CheckCircle size={18} weight="bold" aria-hidden="true" />
          <span>
            <strong>Sepolia receipt</strong>
            <small>
              Success · receipt log {liveEvidence.source.receiptLogIndex}
            </small>
          </span>
        </div>
        <div className="testnet-artifact-check">
          <CheckCircle size={18} weight="bold" aria-hidden="true" />
          <span>
            <strong>Attestcoin / USC proof</strong>
            <small>Retrieved and accepted by the native CC3 verifier</small>
          </span>
        </div>
        <div className="testnet-artifact-check">
          <CheckCircle size={18} weight="bold" aria-hidden="true" />
          <span>
            <strong>Facility registry</strong>
            <small>
              <Link
                href={`/proof/${liveEvidence.creditcoin.evidenceId}`}
                aria-label="Open the live evidence proof console"
              >
                EVIDENCE_VERIFIED ·{" "}
                {shortenId(liveEvidence.creditcoin.evidenceId)}
              </Link>
            </small>
          </span>
        </div>
      </div>

      <p className="testnet-artifact-note">
        Order ID <code>{shortenId(sourceTestnetEvidence.orderId)}</code> ·
        Evidence ID{" "}
        <Link href={`/proof/${liveEvidence.creditcoin.evidenceId}`}>
          <code>{shortenId(liveEvidence.creditcoin.evidenceId)}</code>
        </Link>{" "}
        ·{" "}
        <Link href={`/proof/${liveEvidence.creditcoin.evidenceId}`}>
          Inspect live proof <ArrowRight size={13} aria-hidden="true" />
        </Link>{" "}
        ·{" "}
        <Link href={`/orders/${liveEvidence.source.orderId}`}>
          Inspect recorded order <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </p>
    </section>
  );
}
