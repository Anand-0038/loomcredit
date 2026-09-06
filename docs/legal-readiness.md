# Legal and privacy launch readiness

LoomCredit now includes a public legal baseline at `/legal`, `/privacy`,
`/terms`, and `/cookies`. These pages describe the narrow testnet prototype and
are deliberately marked as a draft until the operator supplies its identity and
jurisdiction. They are not legal advice or a certification of compliance.

## Required before any public customer or lending use

- Choose and record the operating legal entity, registered/public address,
  privacy/legal contact, effective date, target markets, and governing law.
- Have qualified counsel review the Terms of Use, Privacy Policy, Cookie Notice,
  disclaimer, intellectual-property position, dispute language, and any local
  consumer-protection requirements.
- Decide whether LoomCredit is only technology infrastructure or an agent/LSP,
  marketplace, arranger, factor, lender, payment service, credit-information
  service, or other regulated activity in every target jurisdiction. Do not use
  the current prototype as a regulated lending product.
- If India is in scope, separately map the Digital Personal Data Protection
  framework and rules, RBI Digital Lending Directions, 2025, regulated-entity
  and LSP contracts, customer disclosures, consent/audit requirements,
  grievance redressal, KYC/AML, credit-information, outsourcing, and data
  residency obligations that apply to the chosen operating model.
- If the EEA, UK, or another privacy regime is in scope, identify controller
  and processor roles, purposes and lawful bases, data-subject rights, special
  category concerns, international transfers, sub-processors, breach response,
  privacy-by-design controls, and any DPO or local representative requirement.
- Publish a data inventory and retention schedule for wallet addresses,
  authentication nonces, sessions, audit logs, worker databases, evidence
  packets, provider request/response data, backups, and public-chain records.
  The current checkout does not yet implement an operator-approved audit-log
  deletion schedule.
- Execute appropriate security, confidentiality, and data-processing terms with
  hosting, RPC/proof, model, monitoring, wallet, and support providers. Confirm
  whether personal or commercial data leaves the target country/region.
- If optional PostHog analytics is enabled, add it to the vendor/data-flow
  inventory, verify the selected hosting region and retention, document the
  lawful basis and consent withdrawal path, and keep the event allow-list
  aligned with [`Analytics_Contract.md`](./Analytics_Contract.md). It is
  disabled by default in this checkout.
- Add a real request and complaint channel, identity-verification process,
  response deadlines, deletion/correction workflow, incident response plan, and
  human review for any high-impact underwriting use.
- The repository is released under the MIT License in [`LICENSE`](../LICENSE).
  This software license does not grant lending, custody, regulatory, or data
  processing rights described elsewhere in this document.
- Review all public evidence, commitments, screenshots, logs, demo recordings,
  explorer links, and social copy for personal data, secret leakage, vendor
  endorsement, financial claims, and unsupported regulatory claims.

## Current implementation boundary

The current web app has wallet sign-in with one-time nonces, expiring HttpOnly
sessions, hashed session tokens, server-controlled roles, bounded JSON bodies,
and authentication audit events. Optional product analytics is disabled by
default and, when explicitly enabled and accepted, sends only the documented
allow-listed product events. It does not request private keys or serve as a
document intake system. The local policy demo is fixture-only. The recorded
blockchain evidence is testnet data and cannot be deleted by the LoomCredit
operator after publication on a public chain.

Before treating the pages as final, configure these server-side variables and
re-run the submission preflight:

```text
LEGAL_ENTITY_NAME
LEGAL_CONTACT_EMAIL
LEGAL_ENTITY_ADDRESS
LEGAL_GOVERNING_LAW
LEGAL_EFFECTIVE_DATE=YYYY-MM-DD
```

The configuration makes missing release ownership visible; it does not replace
legal review.
