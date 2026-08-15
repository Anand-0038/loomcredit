import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";

import { DemoLab } from "../../components/demo-lab";
import { LiveEvidencePanel } from "../../components/live-evidence-panel";
import { Breadcrumbs } from "../../components/structured-data";
import { TestnetArtifactCard } from "../../components/testnet-artifact-card";
import { liveEvidence } from "../../lib/live-evidence";

const liveOrderHref = `/orders/${liveEvidence.source.orderId}`;
const localOrderHref =
  "/orders/0x2424242424242424242424242424242424242424242424242424242424242424";

export const metadata: Metadata = {
  title: "Demo lab",
  description:
    "Run LoomCredit's deterministic safe, unsafe, and cancelled-order scenarios.",
  robots: { index: false, follow: true },
};

export default function DemoPage() {
  return (
    <main>
      <section className="page-hero">
        <div className="container page-hero-grid">
          <div>
            <Breadcrumbs
              items={[{ label: "Home", href: "/" }, { label: "Demo lab" }]}
            />
            <span className="eyebrow">Evidence &amp; policy lab</span>
            <h1>See where a financing proposal stops.</h1>
            <p>
              Review the live evidence feed when the worker is connected, then
              pressure-test the same deterministic policy boundary locally. The
              lab makes only a same-origin policy API request; it does not
              submit transactions or call a model provider.
            </p>
          </div>
          <aside
            className="page-hero-route"
            aria-label="How to read the demo lab"
          >
            <div className="page-hero-route-heading">
              <span>Read the product in three moves</span>
              <span className="page-hero-route-code">NO WALLET REQUIRED</span>
            </div>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>Observe</strong>
                  <small>Recorded receipts, when the worker feed exists.</small>
                </div>
                <em>READ-ONLY</em>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Pressure-test</strong>
                  <small>
                    Change one quote input and rerun policy locally.
                  </small>
                </div>
                <em>FIXTURE</em>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Inspect</strong>
                  <small>Follow the decision trace to the next gate.</small>
                </div>
                <em>EXPLICIT</em>
              </li>
            </ol>
          </aside>
        </div>
      </section>
      <section className="page-main">
        <div className="container">
          <TestnetArtifactCard />
          <LiveEvidencePanel />
          <DemoLab />
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 18,
              marginTop: 26,
            }}
          >
            <Link className="text-link" href={liveOrderHref}>
              View the recorded order packet{" "}
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </Link>
            <Link className="text-link" href={localOrderHref}>
              Inspect the local fixture{" "}
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </Link>
            <Link className="text-link" href="/security">
              Review the security boundary{" "}
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
