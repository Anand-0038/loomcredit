import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";

import { Breadcrumbs } from "../../components/structured-data";
import { liveEvidence } from "../../lib/live-evidence";

export const metadata: Metadata = {
  title: "Whitepaper",
  description:
    "The implementation-aligned LoomCredit whitepaper: attested trade evidence, bounded AI, and deterministic capital controls.",
  alternates: { canonical: "/whitepaper" },
};

const contents = [
  ["abstract", "Abstract"],
  ["wedge", "1. Product wedge"],
  ["model", "2. System model"],
  ["protocol", "3. Protocol flow"],
  ["policy", "4. Policy and AI boundary"],
  ["lifecycle", "5. Lifecycle and failure"],
  ["security", "6. Security and privacy"],
  ["access", "7. Product access"],
  ["status", "8. Evidence status"],
  ["roadmap", "9. Roadmap"],
  ["conclusion", "10. Conclusion"],
];

const liveProofHref = `/proof/${liveEvidence.creditcoin.evidenceId}`;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="whitepaper-section-label">{children}</span>;
}

export default function WhitepaperPage() {
  return (
    <main>
      <header className="whitepaper-cover">
        <div className="container">
          <Breadcrumbs
            items={[{ label: "Home", href: "/" }, { label: "Whitepaper" }]}
          />
          <div className="whitepaper-cover-grid">
            <div>
              <span className="eyebrow">LoomCredit / technical whitepaper</span>
              <h1>
                Attested trade evidence and policy-constrained AI for supplier
                finance.
              </h1>
              <p className="whitepaper-dek">
                A focused protocol for turning a buyer-backed source event into
                an inspectable evidence packet and a bounded underwriting
                action.
              </p>
            </div>
            <dl className="whitepaper-metadata">
              <div>
                <dt>Version</dt>
                <dd>1.0</dd>
              </div>
              <div>
                <dt>Published</dt>
                <dd>08 Aug 2026</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>Testnet prototype</dd>
              </div>
              <div>
                <dt>Thesis</dt>
                <dd>Evidence before intelligence</dd>
              </div>
            </dl>
          </div>
          <div className="whitepaper-thesis">
            <span>Core proposition</span>
            <strong>
              Attestcoin proves the evidence. The agent proposes the action.
              RiskGuard controls the action.
            </strong>
          </div>
        </div>
      </header>

      <section className="page-main whitepaper-main">
        <div className="container whitepaper-document-layout">
          <aside className="whitepaper-toc" aria-label="Whitepaper contents">
            <nav>
              <span className="eyebrow">On this page</span>
              <ol>
                {contents.map(([id, label]) => (
                  <li key={id}>
                    <a href={"#" + id}>{label}</a>
                  </li>
                ))}
              </ol>
            </nav>
            <section
              className="whitepaper-evidence-card"
              aria-labelledby="whitepaper-evidence-title"
            >
              <div className="whitepaper-evidence-card-head">
                <span className="eyebrow eyebrow-inverse">
                  Current boundary
                </span>
                <span className="whitepaper-evidence-code">TESTNET</span>
              </div>
              <h2 id="whitepaper-evidence-title">Recorded evidence packet</h2>
              <p>
                This checkout includes one real Sepolia receipt, native CC3
                verification, and independent registry read-back. The AI quote
                step remains a separate credentialed gate.
              </p>
              <dl className="whitepaper-evidence-list">
                <div>
                  <dt>Evidence</dt>
                  <dd>
                    <code>LIVE_VERIFIED</code>
                    <span>Recorded testnet proof path</span>
                  </dd>
                </div>
                <div>
                  <dt>Wallet</dt>
                  <dd>
                    <code>SIGN_IN_READY</code>
                    <span>Nonce-bound EIP-191 session</span>
                  </dd>
                </div>
                <div>
                  <dt>AI quote</dt>
                  <dd>
                    <code>NOT_RUN</code>
                    <span>Model credentials are not stored here</span>
                  </dd>
                </div>
                <div>
                  <dt>Capital</dt>
                  <dd>
                    <code>SANDBOX</code>
                    <span>Accounting-only test liquidity</span>
                  </dd>
                </div>
                <div>
                  <dt>Receipt</dt>
                  <dd>
                    <code>EVIDENCE_VERIFIED</code>
                    <span>
                      <a
                        href={liveEvidence.source.explorer}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Sepolia
                        <ArrowUpRight size={12} aria-hidden="true" />
                      </a>{" "}
                      ·{" "}
                      <a
                        href={
                          liveEvidence.creditcoin
                            .verificationTransactionExplorer
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        CC3
                        <ArrowUpRight size={12} aria-hidden="true" />
                      </a>
                    </span>
                  </dd>
                </div>
              </dl>
              <Link className="whitepaper-evidence-link" href={liveProofHref}>
                Open the live proof console{" "}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </section>
          </aside>

          <article className="whitepaper-document">
            <section id="abstract" className="whitepaper-section">
              <SectionLabel>Abstract</SectionLabel>
              <h2>Make the lender’s evidence packet inspectable.</h2>
              <p>
                Small suppliers can have a legitimate purchase order and still
                lack the cash needed for materials, labour, packaging, testing,
                and logistics before delivery. The hard part is not producing
                another loan dashboard. It is establishing which commercial
                facts can be trusted, keeping the evidence current, and
                preventing an automated recommendation from exceeding policy.
              </p>
              <p>
                LoomCredit tests a narrow protocol: a buyer or marketplace posts
                an order guarantee on a source chain; a worker waits for
                finality and Attestcoin attestation, obtains a USC proof, and
                submits it to Creditcoin; a structured agent proposes a quote
                from typed evidence; and RiskGuard decides whether that quote
                can reserve accounting-only sandbox liquidity.
              </p>
              <p>
                The prototype’s contribution is a visible failure boundary. The
                local adversarial policy lab shows a safe 30% proposal passing
                and an unsafe 80% proposal being rejected against the
                deterministic cap. The recorded live bundle currently stops at
                <code>EVIDENCE_VERIFIED</code>; it does not claim a live model
                approval or rejection receipt. The design does not claim to
                prove physical delivery, legal enforceability, off-network
                duplicate financing, or repayment ability.
              </p>
            </section>

            <section id="wedge" className="whitepaper-section">
              <SectionLabel>01 / Product wedge</SectionLabel>
              <h2>Evidence infrastructure for a regulated lender.</h2>
              <p>
                The first customer is not an anonymous borrower looking for a
                public lending pool. It is a marketplace, export aggregator, or
                trade platform that already knows the order context and wants a
                regulated lender to review supplier-finance cases with stronger,
                lifecycle-aware evidence.
              </p>
              <div className="whitepaper-model-block">
                <div>
                  <span>Originator</span>
                  <strong>Buyer / marketplace</strong>
                  <p>Commits the order context and guarantee.</p>
                </div>
                <div>
                  <span>Infrastructure</span>
                  <strong>LoomCredit</strong>
                  <p>Verifies evidence and bounds the recommendation.</p>
                </div>
                <div>
                  <span>Capital provider</span>
                  <strong>Regulated lender or NBFC</strong>
                  <p>Owns agreement, disbursement, and collections.</p>
                </div>
                <div>
                  <span>Beneficiary</span>
                  <strong>Supplier</strong>
                  <p>Receives working capital under the lender’s terms.</p>
                </div>
              </div>
              <p className="whitepaper-note">
                LoomCredit is infrastructure and workflow software in this
                model. Calling the current prototype a lender would be
                inaccurate.
              </p>
            </section>

            <section id="model" className="whitepaper-section">
              <SectionLabel>02 / System model</SectionLabel>
              <h2>Separate evidence, intelligence, and control.</h2>
              <div
                className="whitepaper-flow-document"
                aria-label="System flow"
              >
                <div>
                  <span>01</span>
                  <strong>Order event</strong>
                  <p>Buyer-backed commitment on the source chain.</p>
                </div>
                <div>
                  <span>02</span>
                  <strong>USC proof</strong>
                  <p>Attestcoin proof and exact source-field validation.</p>
                </div>
                <div>
                  <span>03</span>
                  <strong>Agent quote</strong>
                  <p>Typed, attributable recommendation from evidence.</p>
                </div>
                <div>
                  <span>04</span>
                  <strong>RiskGuard</strong>
                  <p>Deterministic policy gate before reservation.</p>
                </div>
              </div>
              <p>
                The separation is deliberate. Cryptographic verification
                establishes what happened. The agent proposes what to do. A
                contract decides what is allowed. No model output can directly
                withdraw capital or bypass evidence validation.
              </p>
            </section>

            <section id="protocol" className="whitepaper-section">
              <SectionLabel>03 / Protocol flow</SectionLabel>
              <h2>From source commitment to evidence registration.</h2>
              <h3>3.1 Source commitment</h3>
              <p>
                <code>OrderGuaranteeEscrow</code> records a minimal buyer-backed
                commitment and emits <code>OrderGuaranteed</code>. The event
                carries the order identifier, buyer, supplier, settlement token,
                order and guarantee amounts, delivery deadline, terms
                commitment, identity commitments, and nonce. The same source
                contract defines cancellation, dispute, and settlement events.
              </p>
              <h3>3.2 Attestcoin and USC</h3>
              <p>
                The worker discovers the source event, waits for the required
                finality and attestation state, requests a Merkle and continuity
                proof, and submits it to Creditcoin.{" "}
                <code>TradeEvidenceUSC</code> calls Creditcoin’s native
                query-verifier precompile. The precompile establishes inclusion
                and finalized-chain continuity; the application contract then
                checks receipt success, the trusted emitter, the exact event
                signature, every decoded business field, and replay status.
              </p>
              <h3>3.3 Evidence registration</h3>
              <p>
                The registry stores only normalized facts and commitments needed
                by policy. A replay key binds source chain, block, transaction,
                log, and emitter. A commercial fingerprint binds the order and
                terms so the same obligation cannot create a second active
                facility inside participating LoomCredit integrations.
              </p>
              <p className="whitepaper-note">
                This protection is deliberately scoped. It cannot discover a
                facility originated outside integrations that share the
                registry.
              </p>
            </section>

            <section id="policy" className="whitepaper-section">
              <SectionLabel>04 / Policy and AI boundary</SectionLabel>
              <h2>AI recommends. Policy decides.</h2>
              <p>
                The agent receives typed, attributable evidence—not a raw
                document to interpret as authority—and returns a schema-bound
                quote containing decision, advance and fee basis points, expiry,
                risk tier, reason codes, evidence identifiers, policy version,
                model version, and a signer-bound nonce.
              </p>
              <div className="whitepaper-columns-document">
                <div>
                  <h3>Agent may propose</h3>
                  <ul>
                    <li>Approve, refer, or reject.</li>
                    <li>Advance and fee basis points.</li>
                    <li>Risk tier and explainable reason codes.</li>
                    <li>Model and policy versions.</li>
                  </ul>
                </div>
                <div>
                  <h3>RiskGuard must enforce</h3>
                  <ul>
                    <li>Signer, evidence, nonce, and expiry.</li>
                    <li>Facility state and replay protection.</li>
                    <li>Advance, guarantee, tenor, and liquidity limits.</li>
                    <li>Buyer concentration and available liquidity.</li>
                  </ul>
                </div>
              </div>
              <div
                className="whitepaper-policy-table"
                role="region"
                aria-label="Demonstration policy"
              >
                <div>
                  <span>Maximum advance</span>
                  <strong>40% of order value</strong>
                </div>
                <div>
                  <span>Minimum buyer guarantee</span>
                  <strong>10% of order value</strong>
                </div>
                <div>
                  <span>Maximum tenor</span>
                  <strong>90 days</strong>
                </div>
                <div>
                  <span>Quote lifetime</span>
                  <strong>600 seconds</strong>
                </div>
              </div>
              <p className="whitepaper-note">
                These are demonstration controls, not a credit model and not a
                promise that a lender would use them in production. Model
                unavailability, timeout, or malformed output routes to{" "}
                <code>REFER</code>; a quote that exceeds policy is rejected. The
                live model-to-RiskGuard transaction remains a release gate.
              </p>
            </section>

            <section id="lifecycle" className="whitepaper-section">
              <SectionLabel>05 / Lifecycle and failure</SectionLabel>
              <h2>Evidence stays attached to the facility lifecycle.</h2>
              <div
                className="whitepaper-lifecycle"
                aria-label="Facility lifecycle"
              >
                <span>Evidence verified</span>
                <b aria-hidden="true">→</b>
                <span>Quoted</span>
                <b aria-hidden="true">→</b>
                <span>Reserved</span>
                <b aria-hidden="true">→</b>
                <span>Settled</span>
              </div>
              <p>
                Cancellation, dispute, and settlement evidence can invalidate or
                close a facility. UI state is never authoritative; contracts and
                persisted worker records are. The worker stores event stages and
                a source cursor so a restart can reconcile rather than silently
                lose a case.
              </p>
              <div className="whitepaper-failure-list">
                <h3>Fail-closed cases</h3>
                <ul>
                  <li>Untrusted emitter or failed source receipt.</li>
                  <li>
                    Proof replay, duplicate fingerprint, or terms substitution.
                  </li>
                  <li>Stale, expired, or unauthorized quote.</li>
                  <li>
                    Invalid cancellation, settlement, or state transition.
                  </li>
                </ul>
              </div>
            </section>

            <section id="security" className="whitepaper-section">
              <SectionLabel>06 / Security and privacy</SectionLabel>
              <h2>Keep each trust boundary legible.</h2>
              <table className="whitepaper-boundary-table">
                <caption className="sr-only">Trust boundaries</caption>
                <thead>
                  <tr>
                    <th scope="col">Boundary</th>
                    <th scope="col">Establishes</th>
                    <th scope="col">Does not establish</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Attestcoin / USC</th>
                    <td>Inclusion and chain continuity</td>
                    <td>Delivery or legal enforceability</td>
                  </tr>
                  <tr>
                    <th scope="row">Worker</th>
                    <td>Discovery, proof retrieval, retry</td>
                    <td>Permission to bypass validation</td>
                  </tr>
                  <tr>
                    <th scope="row">Agent</th>
                    <td>Structured recommendation</td>
                    <td>Authority over policy or capital</td>
                  </tr>
                  <tr>
                    <th scope="row">RiskGuard</th>
                    <td>Encoded action limits</td>
                    <td>Off-chain fraud absent from evidence</td>
                  </tr>
                </tbody>
              </table>
              <p>
                Full purchase orders, legal agreements, tax records, contact
                data, and KYB material should remain encrypted off-chain. Public
                commitments must be salted; predictable identifiers should not
                be hashed in a way that enables a cheap dictionary attack. The
                worker signing key remains outside the web application.
              </p>
            </section>

            <section id="access" className="whitepaper-section">
              <SectionLabel>07 / Product access</SectionLabel>
              <h2>Wallet connection plus verified sign-in.</h2>
              <p>
                The browser exposes a real <code>Connect wallet</code> entry
                point using an injected EIP-1193 provider. After connection,
                <code>Sign in with wallet</code> requests a one-time server
                nonce and asks the wallet to sign a human-readable EIP-191
                message. The server verifies the exact message, chain, expiry,
                nonce replay state, and recovered address before binding it to
                an account and server-controlled role.
              </p>
              <p>
                Successful sign-in creates an opaque, expiring HttpOnly session;
                the raw token is not stored in the database. Sign-in failures,
                successful sign-ins, and sign-outs are persisted in the auth
                audit log. This checkout has no capital-moving privileged web
                action yet; future privileged handlers must require the session
                and audit the action before executing.
              </p>
            </section>

            <section id="status" className="whitepaper-section">
              <SectionLabel>08 / Evidence status</SectionLabel>
              <h2>Claims carry a status, not a costume.</h2>
              <p>
                LoomCredit keeps local inspection, testnet evidence, production
                infrastructure, and future work separate. The current browser
                console uses deterministic fixtures and explicitly does not
                invent a transaction hash, proof, receipt, or model response.
              </p>
              <div className="whitepaper-status-vocabulary">
                <div>
                  <code>LOCAL_FIXTURE</code>
                  <span>Deterministic browser data; not a transaction.</span>
                </div>
                <div>
                  <code>TESTNET</code>
                  <span>A real request or receipt with explorer evidence.</span>
                </div>
                <div>
                  <code>LIVE</code>
                  <span>Production infrastructure with reviewed controls.</span>
                </div>
                <div>
                  <code>PROPOSED</code>
                  <span>
                    A design or pilot requirement not implemented here.
                  </span>
                </div>
              </div>
              <div className="callout whitepaper-callout">
                <strong>Current product truth:</strong> this is a real technical
                prototype for evidence-bound underwriting controls, not a
                production lending product. Capital shown in the demo is
                accounting-only sandbox state.
              </div>
            </section>

            <section id="roadmap" className="whitepaper-section">
              <SectionLabel>09 / Roadmap</SectionLabel>
              <h2>Earn the next claim with the next piece of evidence.</h2>
              <div className="whitepaper-roadmap">
                <div>
                  <strong>Hackathon</strong>
                  <span>
                    Verified order path, bounded quote, attack suite, and honest
                    evidence manifest.
                  </span>
                </div>
                <div>
                  <strong>No-money pilot</strong>
                  <span>
                    Redacted cases, one marketplace connector, lender review
                    workflow, durable auth, and audit logs.
                  </span>
                </div>
                <div>
                  <strong>Technical pilot</strong>
                  <span>
                    Live source integration, reliability metrics, privacy
                    review, and policy governance.
                  </span>
                </div>
                <div>
                  <strong>Production facilities</strong>
                  <span>
                    Regulated partner, legal agreements, capital controls,
                    security review, and measured outcomes.
                  </span>
                </div>
              </div>
              <p>
                OCR, multi-model ensembles, public lending pools, tokenomics,
                arbitrary chain support, and complex dispute arbitration are
                intentionally below the critical path.
              </p>
            </section>

            <section
              id="conclusion"
              className="whitepaper-section whitepaper-conclusion"
            >
              <SectionLabel>10 / Conclusion</SectionLabel>
              <h2>Verify the evidence. Bound the action.</h2>
              <p>
                LoomCredit does not claim that a blockchain removes trade risk
                or that an AI model should control lending. Its narrower thesis
                is practical: verify the commercial evidence first, bind it to
                lifecycle state, let software propose an auditable action, and
                keep the final action inside deterministic policy.
              </p>
              <p className="whitepaper-principle">
                Attestcoin proves the evidence. The agent proposes the action.
                RiskGuard controls the action. A regulated partner owns the
                loan.
              </p>
            </section>
          </article>
        </div>

        <div className="container whitepaper-footer-cta">
          <div>
            <span className="eyebrow">Continue inspecting</span>
            <h2>Read the security boundary or test the evidence workflow.</h2>
          </div>
          <div className="access-next-links">
            <Link className="button button-primary" href="/demo">
              Open the demo lab{" "}
              <ArrowRight size={17} weight="bold" aria-hidden="true" />
            </Link>
            <Link className="text-link" href="/security">
              Security boundary{" "}
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
