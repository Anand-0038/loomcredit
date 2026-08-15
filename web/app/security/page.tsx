import type { Metadata } from "next";
import Image from "next/image";
import {
  CheckCircle,
  LockKeyOpen,
  Warning,
} from "@phosphor-icons/react/dist/ssr";

import { Breadcrumbs } from "../../components/structured-data";

export const metadata: Metadata = {
  title: "Security boundary",
  description: "LoomCredit's proof, model, policy, and capital boundaries.",
  alternates: { canonical: "/security" },
};

export default function SecurityPage() {
  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <Breadcrumbs
            items={[{ label: "Home", href: "/" }, { label: "Security" }]}
          />
          <span className="eyebrow">Security boundary</span>
          <h1>Make the unsafe path boring.</h1>
          <p>
            LoomCredit treats verification, intelligence, policy, and capital as
            separate capabilities with explicit handoffs and failure states.
          </p>
        </div>
      </section>
      <section className="page-main">
        <div className="container">
          <div className="two-column">
            <section className="surface-card">
              <span className="eyebrow">What is enforced</span>
              <h2 style={{ marginTop: 10 }}>
                Four boundaries around one action.
              </h2>
              <ul>
                <li>
                  <strong>Source evidence:</strong> successful receipt, trusted
                  emitter, exact topics/data, and replay key.
                </li>
                <li>
                  <strong>Agent output:</strong> Zod schema, evidence ID
                  binding, deterministic policy evaluation, and REFER on missing
                  model/evidence.
                </li>
                <li>
                  <strong>RiskGuard:</strong> EIP-712 signer allowlist, nonce
                  replay guard, expiry, advance cap, guarantee ratio, tenor,
                  buyer concentration, state, and liquidity checks.
                </li>
                <li>
                  <strong>Capital:</strong> the demo vault is accounting-only
                  test liquidity; it cannot withdraw a real user&apos;s funds.
                </li>
                <li>
                  <strong>Browser boundary:</strong> baseline response headers
                  prevent framing, MIME sniffing, unnecessary referrer leakage,
                  and unused browser capabilities. Authentication write routes
                  also apply a bounded single-instance rate limit; a trusted
                  distributed edge remains required for scaled deployments.
                </li>
              </ul>
            </section>
            <section className="surface-card">
              <span className="eyebrow">What is not claimed</span>
              <h2 style={{ marginTop: 10 }}>Truth is a feature.</h2>
              <ul>
                <li>
                  No production lending product or investment offer is active.
                </li>
                <li>
                  No live proof response or deployed contract address is
                  embedded in the local browser demo.
                </li>
                <li>
                  No model response is fabricated when the model environment is
                  missing.
                </li>
                <li>No transaction is called by the browser demo lab.</li>
              </ul>
            </section>
          </div>
          <div className="architecture-frame" style={{ marginTop: 18 }}>
            <Image
              src="/assets/riskguard-demo.png"
              alt="RiskGuard comparison: a safe 30 percent quote passes policy checks while a manipulated 80 percent quote is rejected above the 40 percent cap"
              width={1400}
              height={700}
              sizes="(max-width: 720px) calc(100vw - 48px), min(1120px, calc(100vw - 60px))"
              loading="eager"
            />
          </div>
          <div className="three-up" style={{ marginTop: 18 }}>
            <article className="feature-card">
              <span className="feature-icon">
                <CheckCircle size={21} weight="bold" aria-hidden="true" />
              </span>
              <h3>Fail closed</h3>
              <p>
                Missing evidence, an unavailable model, an unknown signer, or an
                unsafe proposal becomes a refer/reject state.
              </p>
            </article>
            <article className="feature-card">
              <span className="feature-icon">
                <LockKeyOpen size={21} weight="bold" aria-hidden="true" />
              </span>
              <h3>Least privilege</h3>
              <p>
                The agent proposes. The policy contract decides. The testnet
                vault records reservations without custody.
              </p>
            </article>
            <article className="feature-card">
              <span className="feature-icon">
                <Warning size={21} weight="bold" aria-hidden="true" />
              </span>
              <h3>Known limitations</h3>
              <p>
                Live deployment, funded wallet, source escrow, prover
                availability, and end-to-end transaction evidence remain
                external setup work.
              </p>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
