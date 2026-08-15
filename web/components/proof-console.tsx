import {
  Fingerprint,
  LockKey,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { StageRail } from "./stage-rail";
import { liveEvidence } from "../lib/live-evidence";
import { shortenId } from "../lib/demo-data";

export function ProofConsole({
  compact = false,
  mode = "local",
}: {
  compact?: boolean;
  mode?: "local" | "live";
}) {
  const live = mode === "live";
  return (
    <section className="proof-console" aria-labelledby="proof-console-title">
      <div className="proof-console-aside">
        <span className="eyebrow eyebrow-inverse">Evidence rail</span>
        <h2 id="proof-console-title">
          A governed quote starts with verified evidence.
        </h2>
        <p>
          An advance can move only after the source event is registered,
          checked, and bound to one order.{" "}
          {live
            ? "This packet is live testnet evidence; the quote step remains separate."
            : "This console is a local fixture, not a live transaction."}
        </p>
        <dl className="console-list">
          <div>
            <dt>Proof status</dt>
            <dd className={`console-status status-dot${live ? "" : " local"}`}>
              {live ? "Live verified" : "Local fixture"}
            </dd>
          </div>
          <div>
            <dt>Order</dt>
            <dd className="mono">
              {live ? shortenId(liveEvidence.source.orderId) : "Example packet"}
            </dd>
          </div>
          <div>
            <dt>Evidence</dt>
            <dd className="mono">
              {live ? (
                <Link
                  className="text-link mono"
                  href={`/proof/${liveEvidence.creditcoin.evidenceId}`}
                  aria-label="Open the live evidence proof console"
                >
                  {shortenId(liveEvidence.creditcoin.evidenceId)}
                </Link>
              ) : (
                "Not recorded on-chain"
              )}
            </dd>
          </div>
        </dl>
        {!compact ? (
          <div className="console-boundary-note">
            <ShieldCheck
              size={18}
              color="var(--teal)"
              weight="bold"
              aria-hidden="true"
            />
            <span>
              {live
                ? "Attestcoin proved the evidence. RiskGuard still controls the action."
                : "Attestcoin proves the evidence. RiskGuard controls the action."}
            </span>
          </div>
        ) : null}
      </div>
      <StageRail mode={mode} />
      {!compact ? (
        <div className="console-guardrails">
          <span className="console-guardrail">
            <Fingerprint
              size={16}
              color="var(--gold)"
              weight="bold"
              aria-hidden="true"
            />
            Commitments remain opaque
          </span>
          <span className="console-guardrail">
            <LockKey
              size={16}
              color="var(--teal)"
              weight="bold"
              aria-hidden="true"
            />
            Signatures stay bounded
          </span>
        </div>
      ) : null}
    </section>
  );
}
