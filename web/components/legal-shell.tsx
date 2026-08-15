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
                  ? "Publication configuration present"
                  : "Prototype legal baseline — owner details required"}
              </strong>
              <p>
                {config.isPublishable
                  ? "These pages still require jurisdiction-specific legal review before the service is used for lending, regulated credit intermediation, or customer data beyond the narrow prototype flow."
                  : "The wording is written for the current testnet prototype, but it is not a final legal contract. Configure the operator identity, public contact, address, governing law, and effective date before publishing a public release."}
              </p>
            </div>
            <dl className="legal-meta">
              <div>
                <dt>Operator</dt>
                <dd>{config.entityName ?? "Not configured"}</dd>
              </div>
              <div>
                <dt>Effective date</dt>
                <dd>{formatLegalDate(config.effectiveDate)}</dd>
              </div>
              <div>
                <dt>Public address</dt>
                <dd>{config.entityAddress ?? "Not configured"}</dd>
              </div>
              <div>
                <dt>Governing law</dt>
                <dd>{config.governingLaw ?? "Not configured"}</dd>
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
              <h2>Use the configured legal contact.</h2>
              {contactHref ? (
                <a className="text-link" href={contactHref}>
                  {config.contactEmail}
                </a>
              ) : (
                <p>
                  No public legal contact is configured yet. Set
                  <code>LEGAL_CONTACT_EMAIL</code> before launch.
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
