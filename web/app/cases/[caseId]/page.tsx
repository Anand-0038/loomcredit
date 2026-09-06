import type { Metadata } from "next";

import { Breadcrumbs } from "../../../components/structured-data";
import { LiveCaseDetail } from "../../../components/live-case-detail";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live case inspection",
  description:
    "Inspect the durable source receipt, USC proof, and Creditcoin registration status for a LoomCredit case.",
  robots: { index: false, follow: false },
};

export default async function CasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  return (
    <main>
      <section className="page-hero">
        <div className="container page-hero-grid">
          <div>
            <Breadcrumbs
              items={[
                { label: "Home", href: "/" },
                { label: "Review a case", href: "/review" },
                { label: "Live case" },
              ]}
            />
            <span className="eyebrow">Durable case record</span>
            <h1>Operate this financing case from proof to decision.</h1>
            <p>
              This is the operational center for the case: source-order facts,
              worker progress, USC verification, policy evaluation, and later
              lifecycle events stay together. Requested terms never become
              evidence, and no browser action moves capital.
            </p>
          </div>
          <aside className="page-hero-route" aria-label="Case boundary">
            <div className="page-hero-route-heading">
              <span>Inspection boundary</span>
              <span className="page-hero-route-code">NO BROWSER KEY</span>
            </div>
            <p className="case-detail-boundary">
              Case <code>{caseId}</code>
            </p>
          </aside>
        </div>
      </section>
      <section className="page-main">
        <div className="container">
          <LiveCaseDetail caseId={caseId} />
        </div>
      </section>
    </main>
  );
}
