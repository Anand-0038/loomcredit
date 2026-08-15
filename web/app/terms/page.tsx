import type { Metadata } from "next";

import {
  LegalList,
  LegalSection,
  LegalShell,
} from "../../components/legal-shell";
import { getLegalConfig } from "../../lib/legal";

export const metadata: Metadata = {
  title: "Terms of use",
  description:
    "Terms and limitations for using the LoomCredit testnet prototype and its read-only evidence surfaces.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  const config = getLegalConfig();

  return (
    <LegalShell
      current="terms"
      title="Terms of use"
      description="Rules for using LoomCredit as a testnet technical prototype, not as a lending or investment service."
    >
      <LegalSection title="1. Agreement and prototype status">
        <p>
          By accessing the current LoomCredit website or repository materials,
          you agree to use them only for lawful evaluation, development,
          security review, and testnet experimentation. These terms are a draft
          baseline for the prototype and are not complete until the operator,
          governing law, contact channel, and final limitation language are
          completed and reviewed by qualified counsel.
        </p>
      </LegalSection>

      <LegalSection title="2. No lending, custody, or investment product">
        <p>
          LoomCredit is not a bank, lender, broker, investment adviser,
          crowdfunding platform, payment service, custodian, credit bureau, or
          regulated financial institution. The current prototype does not make
          loans, accept deposits, custody funds, disburse capital, promise a
          return, or create a borrower-lender agreement. The sandbox vault is
          accounting-only test state.
        </p>
        <p>
          A model proposal, local policy result, recorded testnet receipt, or
          wallet session is not an approval, offer, commitment, credit score,
          underwriting guarantee, or evidence of physical delivery, repayment
          capacity, legal enforceability, or absence of duplicate financing.
        </p>
      </LegalSection>

      <LegalSection title="3. Testnet and third-party risk">
        <LegalList
          items={[
            "Testnet tokens, contracts, proofs, RPC services, explorers, wallets, model providers, and hosting services may be unavailable, changed, forked, reverted, rate-limited, or compromised.",
            "Blockchain transactions and public data may be irreversible, publicly inspectable, and outside the operator’s control.",
            "Explorer labels and a successful source-chain or USC proof do not establish the commercial, legal, physical, or financial truth of an order.",
            "You are responsible for using disposable testnet accounts, protecting private keys, checking transaction details, and complying with the applicable network and provider terms.",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Wallet sign-in">
        <p>
          Wallet sign-in is an authentication mechanism only. The app asks for a
          human-readable signature over a server-issued nonce and does not ask
          for a private key or transaction. You must control the wallet you use,
          review the message before signing, and report suspected compromise. A
          connected address does not grant operator privileges or authorize a
          capital-moving action.
        </p>
      </LegalSection>

      <LegalSection title="5. Acceptable use">
        <p>You must not:</p>
        <LegalList
          items={[
            "Use the prototype with real customer funds, real lending decisions, production private keys, or confidential personal or commercial data.",
            "Misrepresent LoomCredit, Creditcoin, Attestcoin, a model provider, or any lender as sponsoring, endorsing, guaranteeing, or partnering with you or the project.",
            "Attempt to bypass evidence, policy, authentication, rate limits, access controls, provider rules, or testnet safety boundaries.",
            "Submit malicious payloads, exploit attempts, denial-of-service traffic, or data belonging to another person without authorization.",
            "Use prototype output as the sole basis for lending, collections, sanctions, identity, employment, insurance, or other high-impact decisions.",
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Intellectual property and contributions">
        <p>
          The repository does not currently declare a public software license.
          Unless a separate license says otherwise, no broad right to copy,
          modify, distribute, deploy, or commercialize the code, branding,
          documentation, or assets is granted by these terms. Contributions are
          subject to the repository’s contribution rules and must not include
          secrets, personal data, or material that you do not have the right to
          submit.
        </p>
      </LegalSection>

      <LegalSection title="7. Availability and disclaimers">
        <p>
          The prototype is provided on an experimental, availability-not-
          guaranteed basis. To the maximum extent permitted by applicable law,
          the operator disclaims warranties of accuracy, fitness,
          merchantability, non-infringement, security, availability, regulatory
          status, and uninterrupted operation. Nothing here excludes liability
          that cannot lawfully be excluded.
        </p>
        <p>
          A final release must replace this draft with counsel-reviewed
          limitation, indemnity, consumer-protection, dispute, export/sanctions,
          and governing-law language suitable for the operator’s entity and
          target markets.
        </p>
      </LegalSection>

      <LegalSection title="8. Governing law and contact">
        <p>
          The governing-law and dispute-resolution fields are intentionally
          configuration-driven and are not asserted here until the operator
          chooses a legal entity and jurisdiction. Do not rely on this draft as
          a complete contract.
        </p>
        <p>
          Configured governing law: {config.governingLaw || "not configured"}.
        </p>
        <p>
          The configured legal contact is{" "}
          {config.contactEmail || "not configured"}. See the{" "}
          <a href="/privacy">privacy policy</a> for data-request handling and{" "}
          <a href="/legal">the legal center</a> for launch status.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
