import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";

import { CaseHistory } from "../../components/case-history";
import { Breadcrumbs } from "../../components/structured-data";

export const metadata: Metadata = {
  title: "Case inbox",
  description:
    "Return to server-owned LoomCredit financing cases and inspect their latest evidence and proposal state.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function CasesPage() {
  return (
    <main>
      <section className="page-hero">
        <div className="container page-hero-grid">
          <div>
            <Breadcrumbs
              items={[{ label: "Home", href: "/" }, { label: "Case inbox" }]}
            />
            <span className="eyebrow">Operator workspace</span>
            <h1>Keep every evidence review in reach.</h1>
            <p>
              Return to cases created by your verified wallet, see where each
              request stopped, and reopen the latest server-owned proof and
              proposal state.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/review">
                Start a new case{" "}
                <ArrowRight size={17} weight="bold" aria-hidden="true" />
              </Link>
              <Link className="text-link" href="/security">
                Review the access boundary{" "}
                <ArrowRight size={15} weight="bold" aria-hidden="true" />
              </Link>
            </div>
          </div>
          <aside className="page-hero-route" aria-label="Case inbox boundary">
            <div className="page-hero-route-heading">
              <span>Case ownership</span>
              <span className="page-hero-route-code">PRIVATE TO ACCOUNT</span>
            </div>
            <p className="case-detail-boundary">
              Only the server-verified operator account that created a case can
              read or continue it.
            </p>
          </aside>
        </div>
      </section>
      <section className="page-main">
        <div className="container">
          <CaseHistory />
        </div>
      </section>
    </main>
  );
}
