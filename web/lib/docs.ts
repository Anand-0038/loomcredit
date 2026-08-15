export type DocsBlock =
  | { kind: "text"; body: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "steps"; items: string[] }
  | { kind: "code"; language: string; code: string }
  | {
      kind: "callout";
      tone: "info" | "warning" | "success";
      title: string;
      body: string;
    }
  | { kind: "table"; columns: string[]; rows: string[][] }
  | {
      kind: "links";
      items: { label: string; href: string; note: string }[];
    };

export interface DocsSection {
  id: string;
  title: string;
  blocks: DocsBlock[];
}

export interface DocsPage {
  slug: string;
  group: string;
  title: string;
  description: string;
  label: string;
  sections: DocsSection[];
}

const code = (language: string, value: string): DocsBlock => ({
  kind: "code",
  language,
  code: value,
});

export const docsPages: DocsPage[] = [
  {
    slug: "",
    group: "Start here",
    label: "Overview",
    title: "Build with verified trade evidence",
    description:
      "Understand the LoomCredit product boundary, choose an integration path, and get from a local demo to a real testnet evidence packet.",
    sections: [
      {
        id: "what-is-loomcredit",
        title: "What is LoomCredit?",
        blocks: [
          {
            kind: "text",
            body: "LoomCredit turns a source-chain trade lifecycle event into inspectable evidence for bounded underwriting. A worker waits for source finality and attestation, a Creditcoin USC contract verifies the event, and a structured agent proposes a facility quote. RiskGuard—not the model—decides whether an approved quote can reserve accounting-only sandbox liquidity.",
          },
          {
            kind: "callout",
            tone: "success",
            title: "The governing rule",
            body: "Cryptography determines what happened. AI recommends what to do. Deterministic policy determines what is allowed.",
          },
        ],
      },
      {
        id: "choose-your-path",
        title: "Choose your path",
        blocks: [
          {
            kind: "table",
            columns: ["You want to…", "Start here"],
            rows: [
              ["Run the product locally", "Quickstart"],
              [
                "Understand evidence and policy",
                "Evidence and underwriting concepts",
              ],
              ["Consume the read-only feed", "HTTP API reference"],
              ["Operate the proof worker", "Worker guide"],
              ["Generate or sign a quote", "CLI reference"],
              [
                "Prepare a controlled deployment",
                "Operations and troubleshooting",
              ],
            ],
          },
        ],
      },
      {
        id: "system-map",
        title: "System map",
        blocks: [
          code(
            "text",
            "source lifecycle event\n  -> source receipt + finality\n  -> Attestcoin proof builder\n  -> TradeEvidenceUSC on Creditcoin\n  -> typed EvidencePacket\n  -> model proposal\n  -> deterministic policy\n  -> optional EIP-712 signature\n  -> RiskGuard reservation",
          ),
          {
            kind: "text",
            body: "Each arrow is a separate trust boundary. The browser can inspect recorded evidence and run explicitly local policy scenarios, but it does not submit USC proofs, call the model, or move capital.",
          },
        ],
      },
      {
        id: "truth-status",
        title: "Truth status",
        blocks: [
          {
            kind: "table",
            columns: ["Boundary", "Meaning"],
            rows: [
              [
                "LIVE_VERIFIED",
                "A source event has a successful native USC verification and independent registry read-back.",
              ],
              [
                "MODEL_TYPED_EVIDENCE",
                "The configured model returned a schema-valid proposal for live evidence.",
              ],
              [
                "LOCAL_FIXTURE_ONLY",
                "Deterministic test data used for UI and policy demonstrations; no live transaction.",
              ],
              [
                "NOT_REQUESTED",
                "Signing or submission was intentionally not attempted.",
              ],
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "quickstart",
    group: "Start here",
    label: "Quickstart",
    title: "Run LoomCredit locally",
    description:
      "Install the repository, start the web console and read-only worker feed, then run the honest local and live evidence paths.",
    sections: [
      {
        id: "requirements",
        title: "Requirements",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Node.js 22 or newer",
              "Corepack with pnpm 11",
              "Foundry for Solidity verification",
              "Python 3 with Playwright only if you want browser smoke tests",
            ],
          },
        ],
      },
      {
        id: "install-and-run",
        title: "Install and run the web console",
        blocks: [
          code("bash", "corepack pnpm install\ncorepack pnpm dev"),
          {
            kind: "text",
            body: "Open http://localhost:3000. The public pages are safe to run without credentials. The demo lab is always labeled LOCAL_FIXTURE_ONLY.",
          },
        ],
      },
      {
        id: "worker-feed",
        title: "Start the read-only evidence feed",
        blocks: [
          code("bash", "corepack pnpm worker:status"),
          {
            kind: "text",
            body: "The worker status API listens on 127.0.0.1:8787 by default. Configure LIVE_EVIDENCE_API_URL for the web server so /api/live-evidence can proxy the feed without exposing worker credentials to the browser.",
          },
        ],
      },
      {
        id: "local-demo",
        title: "Run the local policy lab",
        blocks: [
          code(
            "bash",
            "corepack pnpm demo:happy\ncorepack pnpm demo:unsafe-agent",
          ),
          {
            kind: "text",
            body: "The safe fixture should be approved. The unsafe fixture should be rejected because its 80% advance exceeds the 40% deterministic cap. Neither command calls a model or submits a transaction.",
          },
        ],
      },
      {
        id: "verify-installation",
        title: "Verify the installation",
        blocks: [
          code(
            "bash",
            "corepack pnpm typecheck\ncorepack pnpm test\ncorepack pnpm lint\ncorepack pnpm build\ncorepack pnpm test:contracts",
          ),
          {
            kind: "callout",
            tone: "warning",
            title: "Credentials are not part of quickstart",
            body: "Never put a private key in the browser environment, NEXT_PUBLIC_* variables, a fixture packet, or a model prompt. The live worker and signing flows are documented separately.",
          },
        ],
      },
    ],
  },
  {
    slug: "concepts/evidence",
    group: "Concepts",
    label: "Evidence model",
    title: "Evidence is the product boundary",
    description:
      "Learn how source receipts, USC proofs, registry state, and typed packets combine into a verifiable underwriting input.",
    sections: [
      {
        id: "evidence-lifecycle",
        title: "Evidence lifecycle",
        blocks: [
          {
            kind: "steps",
            items: [
              "The source escrow emits OrderGuaranteed, OrderCancelled, OrderDisputed, or OrderSettled.",
              "The worker waits for the configured confirmation depth and identifies the receipt-local log position.",
              "The Attestcoin proof builder returns a Merkle and continuity proof for the source transaction.",
              "TradeEvidenceUSC verifies receipt success, trusted emitter, exact event shape, and replay status on Creditcoin.",
              "The worker persists the stage and exposes only sanitized status through the read-only API.",
            ],
          },
        ],
      },
      {
        id: "receipt-local-index",
        title: "Receipt-local log index matters",
        blocks: [
          {
            kind: "text",
            body: "Explorers may display a block-wide log index. USC verification requires the event position inside the transaction receipt. LoomCredit stores and revalidates the receipt-local index before proof submission; using the explorer index can select the wrong event or fail verification.",
          },
          code(
            "json",
            '{\n  "blockHeight": 11443299,\n  "txIndex": 106,\n  "logIndex": 1,\n  "proofStatus": "LIVE_VERIFIED"\n}',
          ),
        ],
      },
      {
        id: "packet-contract",
        title: "EvidencePacket contract",
        blocks: [
          {
            kind: "table",
            columns: ["Field group", "Why it exists"],
            rows: [
              [
                "Identity",
                "orderId, evidenceId, source and execution networks bind the packet to a specific obligation.",
              ],
              [
                "Commercial facts",
                "Order value, guarantee, token, deadline, and commitments are decoded facts, not model guesses.",
              ],
              [
                "Lifecycle",
                "Facility state and settlement/dispute counters constrain whether underwriting is valid.",
              ],
              [
                "Capacity",
                "Total and available sandbox liquidity keep off-chain policy aligned with RiskGuard.",
              ],
              [
                "Proof",
                "LIVE_VERIFIED is the only status permitted to reach a real model or signer.",
              ],
            ],
          },
        ],
      },
      {
        id: "live-versus-fixture",
        title: "Live versus fixture data",
        blocks: [
          {
            kind: "callout",
            tone: "warning",
            title: "Do not promote a fixture",
            body: "A local policy approval proves deterministic policy behavior. It does not prove an on-chain evidence registration, a model request, a signature, or a reservation.",
          },
        ],
      },
    ],
  },
  {
    slug: "concepts/underwriting",
    group: "Concepts",
    label: "Underwriting",
    title: "The model proposes; policy decides",
    description:
      "Understand the structured model contract, deterministic policy checks, and the signed RiskGuard boundary.",
    sections: [
      {
        id: "model-contract",
        title: "Model contract",
        blocks: [
          {
            kind: "text",
            body: "The model receives only a parsed EvidencePacket. It must return one strict FacilityQuote with an enumerated decision, bounded numeric fields, a pinned policy version, a pinned model version, and exactly the registered evidence ID.",
          },
          code(
            "json",
            '{\n  "decision": "APPROVE",\n  "advanceBps": 2000,\n  "feeBps": 100,\n  "riskTier": "A",\n  "evidenceIds": ["0x…"]\n}',
          ),
        ],
      },
      {
        id: "policy-checks",
        title: "Deterministic policy checks",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Advance cap: the quote cannot exceed 40% of the order value.",
              "Guarantee ratio: the buyer guarantee must satisfy the configured minimum.",
              "Tenor: delivery must be within the configured 90-day policy window.",
              "Buyer concentration: reserved exposure is bounded against total capacity.",
              "Expiry, evidence binding, lifecycle state, signer approval, policy version, and liquidity are checked before approval.",
              "RiskGuard also rejects a signed quote above its MAX_FEE_BPS bound and emits QuoteDecisionAudited with the decision inputs when the deployed bytecode includes the event.",
            ],
          },
        ],
      },
      {
        id: "signing-boundary",
        title: "Signing and submission",
        blocks: [
          code(
            "bash",
            "corepack pnpm --filter @loomcredit/agent quote /tmp/evidence.json --sign\ncorepack pnpm submit:quote /tmp/signed-quote.json --dry-run\ncorepack pnpm submit:quote /tmp/signed-quote.json",
          ),
          {
            kind: "text",
            body: "Signing requires a separate private key whose address is allowlisted in RiskGuard. The worker/operator key pays the transaction fee; it is not silently reused as the model signer. The submission script validates LIVE_VERIFIED status, contract binding, chain ID, quote shape, and recovered signature before reporting success; --dry-run performs those checks without broadcasting. A deployed bytecode version with QuoteDecisionAudited lets an indexer compare the signed decision inputs with the on-chain audit record; the current recorded deployment predates that event and is not presented as having emitted it.",
          },
        ],
      },
      {
        id: "failure-behavior",
        title: "Failure behavior",
        blocks: [
          {
            kind: "table",
            columns: ["Failure", "Result"],
            rows: [
              [
                "Missing model or timeout",
                "REFER / MODEL_UNAVAILABLE; no signing.",
              ],
              ["Malformed model output", "Schema failure; no policy approval."],
              ["Unsafe numeric quote", "REJECTED by deterministic policy."],
              ["Expired or replayed quote", "Rejected by policy or RiskGuard."],
              ["Missing signer", "Signing fails closed with CONFIG_INVALID."],
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "integrations/api",
    group: "Integrations",
    label: "HTTP API",
    title: "HTTP API reference",
    description:
      "Integrate with the read-only evidence feed, local policy lab, health boundary, and wallet authentication endpoints.",
    sections: [
      {
        id: "api-conventions",
        title: "Conventions",
        blocks: [
          {
            kind: "text",
            body: "The Next.js server exposes same-origin routes under /api. JSON responses include a boundary field where the route has a trust distinction. Dynamic routes use no-store caching. The live-evidence proxy validates the worker response against the documented schema and rejects unexpected fields before returning it. The worker status API is read-only and should be placed behind a private network or authenticated proxy in a hosted deployment.",
          },
        ],
      },
      {
        id: "public-endpoints",
        title: "Public and integration endpoints",
        blocks: [
          {
            kind: "table",
            columns: ["Method and path", "Purpose"],
            rows: [
              [
                "GET /api/health",
                "Reports web health and bounded worker-feed reachability.",
              ],
              [
                "GET /api/ready",
                "Returns 200 only when the configured evidence feed is ready.",
              ],
              [
                "GET /openapi.json",
                "Machine-readable contract for the public API routes.",
              ],
              [
                "GET /api/live-evidence",
                "Proxies the sanitized worker status response.",
              ],
              [
                "POST /api/demo/evaluate",
                "Runs safe, unsafe, or cancelled local fixture policy scenarios.",
              ],
              [
                "POST /api/auth/nonce",
                "Issues a one-time wallet sign-in message.",
              ],
              [
                "POST /api/auth/verify",
                "Verifies the signed message and creates an HttpOnly session.",
              ],
              [
                "GET /api/auth/session",
                "Returns the sanitized current session.",
              ],
              ["POST /api/auth/sign-out", "Revokes the current session."],
            ],
          },
        ],
      },
      {
        id: "health-example",
        title: "Health check",
        blocks: [
          code("bash", "curl -s http://localhost:3000/api/health | jq"),
          code(
            "json",
            '{\n  "status": "ok",\n  "liveEvidenceUpstream": "reachable",\n  "latestVerifiedOrder": "0x…",\n  "workerSecrets": "not-applicable"\n}',
          ),
        ],
      },
      {
        id: "demo-example",
        title: "Local policy example",
        blocks: [
          code(
            "bash",
            "curl -s -X POST http://localhost:3000/api/demo/evaluate \\\n  -H 'content-type: application/json' \\\n  -d '{\"mode\":\"unsafe\"}' | jq '.boundary, .policy.decision, .policy.failureCode'",
          ),
          {
            kind: "callout",
            tone: "warning",
            title: "Fixture boundary",
            body: "This endpoint is a deterministic local lab. It must never be presented as a live underwriting or transaction endpoint.",
          },
        ],
      },
      {
        id: "auth-flow",
        title: "Wallet authentication flow",
        blocks: [
          {
            kind: "steps",
            items: [
              "Call POST /api/auth/nonce with address and chainId.",
              "Ask the wallet to sign the returned human-readable message.",
              "POST the original address, chainId, nonce, message, and signature to /api/auth/verify.",
              "Keep the returned HttpOnly session cookie; never store the raw token in local storage.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "integrations/worker",
    group: "Integrations",
    label: "Worker",
    title: "Operate the proof worker",
    description:
      "Configure the source watcher, process one transaction, expose sanitized status, and understand durable stages.",
    sections: [
      {
        id: "worker-commands",
        title: "Commands",
        blocks: [
          {
            kind: "table",
            columns: ["Command", "Use it for"],
            rows: [
              [
                "pnpm worker:config",
                "Validate configuration without printing private keys.",
              ],
              ["pnpm worker:process -- 0x…", "Process one source transaction."],
              ["pnpm worker:watch-once", "Scan one bounded source range."],
              ["pnpm worker:watch", "Run the durable polling watcher."],
              ["pnpm worker:status", "Serve sanitized GET /v1/orders status."],
            ],
          },
        ],
      },
      {
        id: "configuration",
        title: "Required configuration",
        blocks: [
          {
            kind: "table",
            columns: ["Variable", "Role"],
            rows: [
              ["SOURCE_CHAIN_RPC_URL", "Source-chain JSON-RPC endpoint."],
              ["CREDITCOIN_RPC_URL", "Creditcoin CC3 JSON-RPC endpoint."],
              ["PROOF_BUILDER_URL", "Attestcoin proof-builder endpoint."],
              ["SOURCE_CHAIN_KEY", "Source network key used by USC proofs."],
              [
                "CREDITCOIN_WALLET_PRIVATE_KEY",
                "Worker transaction-fee key; server-only.",
              ],
              [
                "WORKER_START_BLOCK",
                "Operator-selected first block for watcher scans.",
              ],
              ["WORKER_DATABASE_PATH", "Durable SQLite path for worker state."],
            ],
          },
        ],
      },
      {
        id: "stages",
        title: "Durable stages",
        blocks: [
          code(
            "text",
            "DETECTED\n  -> WAITING_FOR_ATTESTATION\n  -> PROOF_REQUESTED\n  -> PROOF_READY\n  -> CREDITCOIN_SUBMITTED\n  -> VERIFIED",
          ),
          {
            kind: "text",
            body: "Network and proof-builder failures remain retryable. Failed source receipts, malformed proofs, wrong emitters, and receipt mismatches become terminal failures. A broadcast transaction hash is persisted before waiting for mining so restarts can confirm instead of rebroadcasting.",
          },
        ],
      },
      {
        id: "status-api",
        title: "Status API",
        blocks: [
          code(
            "bash",
            "curl -s http://127.0.0.1:8787/v1/orders | jq '.orders[] | {orderId,eventType,stage,proofStatus}'",
          ),
          {
            kind: "callout",
            tone: "warning",
            title: "Read-only means read-only",
            body: "The status API never accepts proof bytes, private keys, quote submissions, or mutation requests. Keep it loopback-only unless an authenticated edge is configured.",
          },
        ],
      },
    ],
  },
  {
    slug: "cli",
    group: "Integrations",
    label: "CLI reference",
    title: "CLI and automation reference",
    description:
      "Use the repository commands to deploy test contracts, seed evidence, build packets, quote, verify, and preflight a submission.",
    sections: [
      {
        id: "command-groups",
        title: "Command groups",
        blocks: [
          {
            kind: "table",
            columns: ["Group", "Commands"],
            rows: [
              ["Development", "dev, build, lint, typecheck, test"],
              ["Contracts", "test:contracts, deploy:source, deploy:creditcoin"],
              [
                "Evidence",
                "seed:source-order, worker:watch-once, evidence:manifest, build:evidence-packet",
              ],
              ["Agent", "agent:quote, demo:happy, demo:unsafe-agent"],
              ["Release", "submit:quote, submission:preflight"],
              ["Security", "secret-scan, secret-scan:test"],
            ],
          },
        ],
      },
      {
        id: "evidence-pipeline",
        title: "Evidence pipeline",
        blocks: [
          code(
            "bash",
            "corepack pnpm worker:watch-once\ncorepack pnpm evidence:manifest\ncorepack pnpm build:evidence-packet --packet-only > /tmp/evidence.json\ncorepack pnpm --filter @loomcredit/agent quote /tmp/evidence.json",
          ),
          {
            kind: "text",
            body: "The packet builder refuses fixture or partially processed rows. The quote command returns REFER when model or evidence requirements are not satisfied. Add --sign only in a controlled agent environment with the separate allowlisted signer.",
          },
        ],
      },
      {
        id: "release-preflight",
        title: "Release preflight",
        blocks: [
          code(
            "bash",
            "corepack pnpm submission:preflight\ncorepack pnpm --silent submission:preflight --json",
          ),
          {
            kind: "text",
            body: "Preflight is intentionally non-zero while external artifacts are missing. A blocked result is useful information; do not bypass it by relabeling local fixtures as live receipts. Use the silent JSON form in CI or agent workflows; it keeps stdout parseable while preserving the nonzero exit status.",
          },
        ],
      },
    ],
  },
  {
    slug: "security",
    group: "Operations",
    label: "Security",
    title: "Security and trust boundaries",
    description:
      "Understand what LoomCredit protects, what it deliberately does not claim, and how to operate the prototype safely.",
    sections: [
      {
        id: "trust-boundaries",
        title: "Trust boundaries",
        blocks: [
          {
            kind: "table",
            columns: ["Boundary", "Rule"],
            rows: [
              [
                "Source chain",
                "The source receipt and trusted emitter are authoritative for the encoded event.",
              ],
              [
                "USC verifier",
                "Native verification plus exact event checks are required before evidence registration.",
              ],
              [
                "Model",
                "May propose a typed quote; never receives private keys or authorizes capital.",
              ],
              [
                "RiskGuard",
                "Recovers the signer and enforces deterministic limits before reservation.",
              ],
              [
                "Browser",
                "May inspect evidence and run local fixtures; does not submit transactions.",
              ],
            ],
          },
        ],
      },
      {
        id: "secret-handling",
        title: "Secret handling",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Keep .env ignored and out of commits, screenshots, logs, and prompts.",
              "Keep worker and agent keys out of web/.env.local and all NEXT_PUBLIC_* variables.",
              "Use separate source, deployer, worker, and agent identities before serious deployment.",
              "The web service emits baseline security headers; add a deployment-specific CSP after reviewing wallet and provider requirements.",
              "Authentication writes have a bounded single-instance limiter and return Retry-After; configure AUTH_ORIGIN explicitly and use a trusted distributed edge limiter before exposing authentication to many users.",
              "Rotate any credential pasted into chat or committed to history.",
            ],
          },
        ],
      },
      {
        id: "known-limits",
        title: "Known limits",
        blocks: [
          {
            kind: "bullets",
            items: [
              "The current prototype uses SQLite and is not a multi-instance production data layer.",
              "SandboxCapitalVault is accounting-only test liquidity; it is not custody or a lending product.",
              "On-chain evidence does not prove physical delivery, repayment, or off-network duplicate financing.",
              "Public deployment, eligibility, and submission media require human-owned release steps.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "operations/troubleshooting",
    group: "Operations",
    label: "Troubleshooting",
    title: "Troubleshoot by boundary",
    description:
      "Use failure codes, logs, and bounded checks to diagnose the correct layer without masking an integration failure.",
    sections: [
      {
        id: "common-failures",
        title: "Common failures",
        blocks: [
          {
            kind: "table",
            columns: ["Symptom", "Check first"],
            rows: [
              [
                "CONFIG_INVALID",
                "Run worker:config and inspect only variable presence and public addresses.",
              ],
              [
                "MODEL_UNAVAILABLE",
                "Check model base URL, key presence, timeout, and provider response status.",
              ],
              [
                "EVIDENCE_MISSING",
                "Confirm the packet is LIVE_VERIFIED and the evidence ID matches registry read-back.",
              ],
              [
                "PROCESS_BUSY_RETRYABLE",
                "Another worker lease owns the same source event; wait for expiry or inspect the process.",
              ],
              [
                "UPSTREAM_UNAVAILABLE",
                "Check worker status API reachability from the web server, not only from your browser.",
              ],
              [
                "INVALID_SIGNATURE",
                "Confirm the quote domain, chain ID, RiskGuard address, and signer key match.",
              ],
            ],
          },
        ],
      },
      {
        id: "diagnostic-sequence",
        title: "Diagnostic sequence",
        blocks: [
          {
            kind: "steps",
            items: [
              "Check the boundary label in the response or UI: LOCAL_FIXTURE_ONLY, LIVE_VERIFIED, or a failure boundary.",
              "Run the smallest local reproducer: API curl, worker status query, or agent quote command.",
              "Inspect the durable worker stage and last error without printing secrets or proof bytes.",
              "Retry only retryable network/provider failures; do not retry terminal receipt or signature mismatches blindly.",
              "Re-run submission preflight before claiming a release gate is complete.",
            ],
          },
        ],
      },
      {
        id: "support-bundle",
        title: "Safe support bundle",
        blocks: [
          code(
            "bash",
            "corepack pnpm worker:config\ncurl -s http://localhost:3000/api/health\ncurl -s http://127.0.0.1:8787/v1/orders\ncorepack pnpm submission:preflight",
          ),
          {
            kind: "callout",
            tone: "info",
            title: "Share outcomes, not secrets",
            body: "When asking for help, share sanitized error codes, stages, block numbers, and transaction hashes. Do not share .env files, private keys, model API keys, raw session tokens, or unredacted customer data.",
          },
        ],
      },
    ],
  },
  {
    slug: "legal-readiness",
    group: "Operations",
    label: "Legal readiness",
    title: "Legal and privacy launch checklist",
    description:
      "Track the owner, privacy, regulatory, retention, vendor, and deployment decisions required before a public or customer-facing release.",
    sections: [
      {
        id: "publication-gate",
        title: "Publication gate",
        blocks: [
          {
            kind: "callout",
            tone: "warning",
            title: "Not a compliance certification",
            body: "The public legal pages describe the current testnet prototype and are a starting point for counsel review. They do not make LoomCredit a lender, establish regulatory authorization, or prove compliance in any jurisdiction.",
          },
          {
            kind: "links",
            items: [
              {
                label: "Legal center",
                href: "/legal",
                note: "Operator status and all public legal pages.",
              },
              {
                label: "Privacy policy",
                href: "/privacy",
                note: "Current wallet, session, audit, and evidence data handling.",
              },
              {
                label: "Terms of use",
                href: "/terms",
                note: "Prototype use rules, limitations, and no-lending boundary.",
              },
              {
                label: "Cookie notice",
                href: "/cookies",
                note: "Current first-party session-cookie inventory.",
              },
            ],
          },
        ],
      },
      {
        id: "before-public-release",
        title: "Before a public release",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Name the legal entity, public address, privacy contact, governing law, effective date, target markets, and complaint route.",
              "Have qualified counsel review the privacy policy, terms, cookie notice, disclaimers, consumer disclosures, IP position, and any lending or credit-intermediation classification.",
              "Inventory every personal-data field, processor, hosting region, wallet/explorer dependency, model provider, log, backup, and public-chain disclosure.",
              "Approve retention periods and deletion/exception procedures for auth nonces, sessions, audit events, worker data, support requests, and backups. Public-chain records require a separate minimisation and rights analysis.",
              "Complete vendor terms and data-processing agreements, international-transfer safeguards, incident response, access review, and data-subject request handling before collecting customer information.",
              "Decide whether a real production product needs KYC/AML, lending, outsourcing, fair-lending, consumer-credit, payments, sanctions, tax, or sector-specific controls; do not infer this from a testnet demo.",
              "Add a public software license or keep the repository’s no-license position deliberate and counsel-reviewed. Confirm third-party and reference-asset rights.",
            ],
          },
        ],
      },
      {
        id: "current-boundary",
        title: "Current implementation boundary",
        blocks: [
          {
            kind: "table",
            columns: ["Implemented now", "Still required"],
            rows: [
              [
                "Public legal routes, footer links, essential-session-cookie notice, and server-side owner metadata fields.",
                "Populate and approve owner details, then publish only counsel-reviewed text.",
              ],
              [
                "Wallet address, nonce, session, and audit records are handled by the current single-instance SQLite auth store.",
                "Define retention/deletion schedules, production access controls, shared storage, and incident procedures.",
              ],
              [
                "Public testnet hashes and contract addresses are shown as immutable evidence artifacts.",
                "Minimise personal data before anchoring anything and document public-chain rights/notice limits.",
              ],
              [
                "Browser demo is local fixture-only and does not request model, bank, KYC, or document data.",
                "Complete a separate regulated-product analysis before onboarding real counterparties or making credit decisions.",
              ],
            ],
          },
        ],
      },
      {
        id: "configuration",
        title: "Configure owner details",
        blocks: [
          code(
            "dotenv",
            "LEGAL_ENTITY_NAME=\nLEGAL_CONTACT_EMAIL=\nLEGAL_ENTITY_ADDRESS=\nLEGAL_GOVERNING_LAW=\nLEGAL_EFFECTIVE_DATE=YYYY-MM-DD",
          ),
          {
            kind: "callout",
            tone: "info",
            title: "Configuration is not approval",
            body: "Setting these variables changes the page status from draft configuration to publication configuration present. It does not replace legal review, a data inventory, regulatory analysis, vendor due diligence, or deployment verification.",
          },
        ],
      },
    ],
  },
];

export const docsGroups = Array.from(
  new Set(docsPages.map((page) => page.group)),
);

export function docsPath(slug: string): string {
  return slug ? `/docs/${slug}` : "/docs";
}

export function findDocsPage(slug: string): DocsPage | undefined {
  return docsPages.find((page) => page.slug === slug);
}
