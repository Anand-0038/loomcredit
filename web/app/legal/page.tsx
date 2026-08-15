import type { Metadata } from "next";
import Link from "next/link";

import { LegalSection, LegalShell } from "../../components/legal-shell";

export const metadata: Metadata = {
  title: "Legal center",
  description:
    "LoomCredit legal, privacy, cookie, and prototype launch-readiness information.",
  alternates: { canonical: "/legal" },
};

export default function LegalPage() {
  return (
    <LegalShell
      current="legal"
      title="Legal center"
      description="The current prototype’s privacy, terms, cookie notice, and release obligations in one place."
    >
      <LegalSection title="What is covered here">
        <p>
          This legal center describes the current LoomCredit testnet prototype:
          a read-only evidence console, a deterministic local policy lab, and
          optional wallet sign-in. It does not create a lending agreement,
          custody relationship, investment offering, or regulated credit
          decision.
        </p>
        <div className="legal-link-grid">
          <Link href="/privacy">
            <strong>Privacy policy</strong>
            <span>
              Data collected by the current web and authentication flow.
            </span>
          </Link>
          <Link href="/terms">
            <strong>Terms of use</strong>
            <span>Rules and limitations for using the testnet prototype.</span>
          </Link>
          <Link href="/cookies">
            <strong>Cookie notice</strong>
            <span>
              Essential session cookies and third-party wallet boundaries.
            </span>
          </Link>
          <Link href="/docs/legal-readiness">
            <strong>Launch checklist</strong>
            <span>
              Items that still require an owner, vendors, counsel, or deployment
              evidence.
            </span>
          </Link>
        </div>
      </LegalSection>
      <LegalSection title="Important status">
        <p>
          The pages are a substantive prototype baseline, not a certification of
          compliance. The operator must supply the legal entity, address,
          contact channel, governing law, retention schedule, vendor terms, and
          applicable financial-regulatory analysis before accepting customer
          data or presenting the system as a lending or lending-service product.
        </p>
      </LegalSection>
      <LegalSection title="Do not submit sensitive material">
        <p>
          Do not put private keys, wallet seed phrases, bank credentials, full
          purchase orders, identity documents, customer data, or confidential
          commercial terms into the public demo, wallet signature message, issue
          tracker, or chat. The current browser flow is not a secure customer
          document intake system.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
