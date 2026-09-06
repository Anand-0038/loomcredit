import Link from "next/link";

import { Breadcrumbs } from "./structured-data";
import {
  formatLegalDate,
  getLegalConfig,
  legalContactHref,
} from "../lib/legal";

export function LegalShell({
  current,
  title,
  description,
  children,
}: {
  current: "legal" | "privacy" | "terms" | "cookies";
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const config = getLegalConfig();
  const contactHref = legalContactHref(config.contactEmail);

  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <Breadcrumbs
            items={[{ label: "Home", href: "/" }, { label: title }]}
          />
          <span className="eyebrow">Legal and privacy</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </section>
      <section className="page-main">
        <div className="container legal-layout">
          <article className="legal-document">
            <div
              className={`legal-status${config.isPublishable ? " ready" : ""}`}
            >
              <strong>
                {config.isPublishable
                  ? "Legal details available"
                  : "Prototype notice"}
              </strong>
              <p>
                {config.isPublishable
                  ? "These pages still require jurisdiction-specific legal review before the service is used for lending, regulated credit intermediation, or customer data beyond the narrow prototype flow."
                  : "This page describes the current testnet prototype. It is not a final legal agreement or legal advice."}
              </p>
            </div>
            <dl className="legal-meta">
              <div>
                <dt>Operator</dt>
                <dd>{config.entityName ?? "LoomCredit prototype"}</dd>
              </div>
              <div>
                <dt>Effective date</dt>
                <dd>
                  {config.effectiveDate
                    ? formatLegalDate(config.effectiveDate)
                    : "Pending publication"}
                </dd>
              </div>
              <div>
                <dt>Public address</dt>
                <dd>{config.entityAddress ?? "Pending publication"}</dd>
              </div>
              <div>
                <dt>Governing law</dt>
                <dd>{config.governingLaw ?? "Pending publication"}</dd>
              </div>
            </dl>
            {children}
          </article>
          <aside className="legal-sidebar" aria-label="Legal navigation">
            <div className="surface-card legal-nav-card">
              <span className="eyebrow">Legal center</span>
              <nav>
                <Link
                  className={current === "legal" ? "active" : ""}
                  href="/legal"
                >
                  Overview and launch status
                </Link>
                <Link
                  className={current === "privacy" ? "active" : ""}
                  href="/privacy"
                >
                  Privacy policy
                </Link>
                <Link
                  className={current === "terms" ? "active" : ""}
                  href="/terms"
                >
                  Terms of use
                </Link>
                <Link
                  className={current === "cookies" ? "active" : ""}
                  href="/cookies"
                >
                  Cookie notice
                </Link>
              </nav>
            </div>
            <div className="surface-card legal-contact-card">
              <span className="eyebrow">Questions or requests</span>
              <h2>Need to get in touch?</h2>
              {contactHref ? (
                <a className="text-link" href={contactHref}>
                  {config.contactEmail}
                </a>
              ) : (
                <p>
                  The public legal contact will be listed here in the final
                  notice.
                </p>
              )}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="legal-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function LegalList({ items }: { items: string[] }) {
  return (
    <ul className="legal-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
