import type { Metadata } from "next";

import {
  LegalList,
  LegalSection,
  LegalShell,
} from "../../components/legal-shell";
import { AnalyticsPreferences } from "../../components/analytics-preferences";
import { getLegalConfig, legalContactHref } from "../../lib/legal";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How the current LoomCredit testnet prototype handles wallet, session, audit, and public evidence data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  const config = getLegalConfig();
  const contactHref = legalContactHref(config.contactEmail);

  return (
    <LegalShell
      current="privacy"
      title="Privacy policy"
      description="A prototype data-handling notice for the current LoomCredit web, wallet-authentication, and testnet evidence surfaces."
    >
      <LegalSection title="1. Scope and controller status">
        <p>
          This notice applies to the LoomCredit website, its read-only API
          routes, the local policy demo, and the optional wallet sign-in flow.
          The legal operator is shown at the top of this page when configured.
          Until that field is completed, this page must be treated as a draft
          awaiting the operator’s legal identity and jurisdictional review.
        </p>
        <p>
          The current web surface is a technical testnet prototype. It is not a
          customer onboarding, KYC, loan-application, payment, or document
          storage service.
        </p>
      </LegalSection>

      <LegalSection title="2. Information the current web surface processes">
        <p>Depending on how you use the prototype, the server may process:</p>
        <LegalList
          items={[
            "Wallet information: the public EVM address and selected chain ID that you submit for sign-in.",
            "Authentication records: the one-time nonce, the exact sign-in message, issue/expiry/attempt timestamps, account identifier, role, session expiry, and security audit events.",
            "Session security data: only a hash of the opaque session token is stored by the auth database; the raw token is returned in an HttpOnly cookie and is not placed in local storage by the app.",
            "Public testnet evidence: transaction hashes, contract addresses, order identifiers, evidence identifiers, lifecycle stages, timestamps, and other values already visible or intended to be verifiable on public testnet infrastructure.",
            "Technical request data: hosting, reverse-proxy, RPC, wallet, or browser infrastructure may process IP addresses, user-agent strings, error logs, and security telemetry under its own terms.",
            "Optional product analytics: only when explicitly enabled by the operator and accepted by a visitor, the configured PostHog project receives allow-listed anonymous events for product surfaces, local demo modes and outcomes, read-only feed status, and wallet-flow stage/outcome. The browser integration does not send wallet addresses, order IDs, evidence IDs, raw inputs, provider payloads, or session recordings.",
          ]}
        />
        <p>
          The current browser application does not request private keys, seed
          phrases, bank credentials, payment-card details, full purchase-order
          uploads, identity documents, or a transaction approval. Do not submit
          them through any public surface.
        </p>
      </LegalSection>

      <LegalSection title="3. What we use information for">
        <LegalList
          items={[
            "To issue and verify a one-time wallet sign-in message and create, maintain, and revoke a server session.",
            "To protect the authentication boundary, prevent nonce replay, enforce configured rate limits, and investigate abuse or security incidents.",
            "To display and reconcile recorded testnet evidence and its lifecycle status; public blockchain data remains public and may be immutable.",
            "To operate, debug, and improve the prototype, subject to the operator’s configured retention and access controls.",
            "To understand which bounded prototype surfaces and demo scenarios are useful when optional analytics has been enabled and accepted.",
          ]}
        />
        <p>
          The local demo endpoint uses deterministic fixture data and does not
          call a model, proof builder, wallet, or blockchain. The browser does
          not send data to the model provider. If an operator separately runs
          the server-side agent/worker path, typed evidence may be sent to the
          configured model provider; that deployment must complete its vendor,
          confidentiality, data-processing, and cross-border review first.
        </p>
      </LegalSection>

      <LegalSection title="4. Optional analytics preference">
        <p>
          Optional analytics is disabled unless the operator configures the
          PostHog integration and a visitor accepts it. You can change that
          choice here; disabling it stops future events from this browser.
        </p>
        <AnalyticsPreferences />
      </LegalSection>

      <LegalSection title="5. Legal bases and jurisdiction">
        <p>
          The lawful basis for processing depends on the operator, user role,
          jurisdiction, and whether the service is used only for a demo or in a
          regulated lending workflow. A final release must document the
          applicable basis or permitted use for each data category, including
          consent where required, and must not rely on this prototype wording as
          a substitute for counsel.
        </p>
        <p>
          If the service is offered in India or used as a lending-service
          provider to an RBI-regulated entity, the operator and lender must
          separately assess the Digital Personal Data Protection framework, RBI
          Digital Lending Directions, 2025, outsourcing, customer protection,
          grievance, recordkeeping, and any applicable KYC/AML or
          credit-information obligations. If the service is offered to people in
          the EEA/UK or another jurisdiction with data-protection law, the
          operator must separately assess territorial scope, processor/vendor
          terms, international transfers, rights handling, and breach duties.
        </p>
      </LegalSection>

      <LegalSection title="6. Sharing and public-chain limits">
        <p>
          We may disclose information to infrastructure providers needed to host
          the service, operate RPC/proof-builder integrations, deliver security,
          or process a configured model request. The operator must maintain a
          current vendor list, security review, confidentiality terms, and
          data-processing/transfer terms before using non-test data.
        </p>
        <p>
          Wallet addresses, transaction hashes, contract state, and commitments
          written to a public blockchain or testnet may be visible to anyone,
          copied indefinitely, and impossible for the operator to delete. A
          deletion request cannot erase third-party blockchain history. Do not
          put names, email addresses, purchase-order text, or other directly
          identifying information into on-chain fields or unsalted commitments.
        </p>
      </LegalSection>

      <LegalSection title="7. Retention">
        <p>
          In the current prototype, used or expired authentication nonces are
          pruned when new nonces are issued. Session records expire or can be
          revoked. Authentication audit events and public evidence records do
          not yet have a complete, operator-approved retention and deletion
          schedule in this checkout. That is a launch blocker for production
          personal-data processing and must be resolved before onboarding users.
        </p>
        <p>
          A final policy must state the retention period or criteria for each
          category, legal holds, backup deletion, public-chain exceptions, and
          who may access audit records.
        </p>
      </LegalSection>

      <LegalSection title="8. Rights and requests">
        <p>
          Where applicable law grants rights such as access, correction,
          deletion, restriction, objection, portability, consent withdrawal, or
          complaint escalation, requests should be sent to the configured legal
          contact. The operator must verify identity, respond within the
          applicable deadline, and explain any public-chain or legal-retention
          limitation.
        </p>
        {contactHref ? (
          <p>
            Current contact: <a href={contactHref}>{config.contactEmail}</a>.
          </p>
        ) : (
          <p>
            No request channel is configured yet. Set
            <code>LEGAL_CONTACT_EMAIL</code> before public launch.
          </p>
        )}
      </LegalSection>

      <LegalSection title="9. Security and changes">
        <p>
          The prototype uses one-time nonces, signature recovery, expiring
          HttpOnly sessions, hashed session tokens, server-side roles, bounded
          request bodies, and baseline security headers. These controls reduce
          risk but do not guarantee security, availability, or recovery from a
          compromised wallet, provider, host, or private key.
        </p>
        <p>
          The operator may update this notice when the service, providers,
          jurisdictions, data categories, or legal requirements change. The
          effective date at the top of the page must be updated after a reviewed
          change.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
