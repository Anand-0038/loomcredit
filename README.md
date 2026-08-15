# LoomCredit

Evidence before underwriting.

LoomCredit is a Creditcoin USC prototype for turning a proof-backed trade
event into a bounded supplier-finance proposal. It is built around one
auditable boundary:

```text
source-chain order guarantee
  -> Attestcoin / USC proof
  -> Creditcoin evidence registry
  -> typed model proposal
  -> deterministic RiskGuard policy
  -> accounting-only sandbox reservation
```

The model proposes. The contract and policy boundary decide. Missing evidence,
an unavailable model, an unsafe quote, an unknown signer, a replay, an expired
quote, insufficient liquidity, or an invalid facility state fails closed.

## What is in this code drop

This repository contains the runnable application and its public testnet
artifacts. It intentionally excludes private control-room notes, credentials,
raw media, presentation files, screenshots, and all documentation files except
this README.

The current public tree includes:

- Source-chain escrow contracts and lifecycle verification.
- Creditcoin `TradeEvidenceUSC`, `FacilityRegistry`, `RiskGuard`, and
  accounting-only `SandboxCapitalVault` contracts.
- A typed evidence packet and schema-bound OpenAI-compatible model adapter.
- Deterministic off-chain policy checks and EIP-712 quote signing.
- A retryable SQLite worker using the official USC proof-builder flow.
- A Next.js product console with live-evidence, local-policy, proof, security,
  access, legal, and API surfaces.
- Public testnet deployment/order/evidence JSON under `docs/` and product
  visuals under `web/public/assets/`.

## Honest status

The included artifacts prove a recorded testnet path from an Ethereum Sepolia
`OrderGuaranteed` receipt through USC verification, a real structured model
proposal, a separately signed quote, and an approved Creditcoin RiskGuard
reservation in accounting-only sandbox liquidity. The public evidence manifest
contains the approval transaction and quote hash. The deployed RiskGuard
bytecode emitted the backwards-compatible `QuoteApproved` event but not the
newer `QuoteDecisionAudited` event, so the full decision-term audit is not
claimed. These artifacts do not prove production lending, physical delivery,
repayment capacity, custody, customer adoption, or regulatory approval.

A configured provider must be valid, and operator, deployer, worker, and agent
wallets must be separate before a serious live run. Do not turn a local
fixture or a fail-closed `REFER` result into a live-success claim.

Recorded public artifacts:

- [Source deployment](docs/deployments/source-deployment.json)
- [Source order receipt](docs/deployments/source-order.json)
- [Creditcoin deployment](docs/deployments/creditcoin-deployment.json)
- [Reduced evidence manifest](docs/demo-evidence.json)

## Product boundary

LoomCredit is designed for a marketplace or lender that needs to review
buyer-backed supplier-finance opportunities without trusting an opaque model
or an unverified source-chain event. The prototype keeps the scope narrow:

1. The worker discovers a source lifecycle event after the configured
   confirmation depth.
2. The USC boundary verifies the source receipt, emitter, event fields,
   commitments, query key, and replay status.
3. `FacilityRegistry` stores only the verified evidence needed by the
   underwriting packet.
4. The model receives a typed packet, not a private key or arbitrary browser
   input, and returns a schema-bound proposal.
5. Deterministic policy checks enforce the evidence ID, facility state,
   guarantee ratio, tenor, advance cap, exposure, liquidity, expiry, and signer
   status.
6. `RiskGuard` accepts only a valid EIP-712 `APPROVE` quote from an allowlisted
   agent signer and reserves accounting-only sandbox liquidity.

The browser's local policy lab is deliberately marked `LOCAL_FIXTURE_ONLY`.
The read-only evidence surface is separate from local scenarios and never
submits a transaction.

## Run locally

Requirements: Node.js 22 or newer, Corepack, pnpm 11, and Foundry for the
Solidity suite.

```bash
corepack pnpm install
corepack pnpm dev
```

Open `http://localhost:3000` and explore:

- `/` — product overview and architecture
- `/demo` — safe, unsafe, and cancelled local policy scenarios
- `/proof/<evidence-id>` — evidence console
- `/orders/<order-id>` — source-to-Creditcoin order trace
- `/security` — enforced controls and known limits
- `/access` — wallet sign-in boundary; it does not request private keys
- `/whitepaper` — implementation-aligned product thesis
- `/docs` — in-app developer documentation
- `/openapi.json` — read-only API contract
- `/llms.txt` — concise machine-readable site map

The local development command runs the web console and its read-only worker
status feed. It does not broadcast a chain transaction.

## Configuration

Copy `.env.example` to `.env` and enter values out of band. Never commit `.env`,
private keys, API keys, wallet seed phrases, or signed payloads.

```bash
cp .env.example .env
corepack pnpm worker:config
```

The model configuration is an OpenAI-compatible trio:

```text
MODEL_BASE_URL
MODEL_API_KEY
MODEL_NAME
```

The agent signer is a separate role:

```text
CREDITCOIN_AGENT_PRIVATE_KEY
CREDITCOIN_AGENT_SIGNER_ADDRESS
```

Never reuse a source operator, deployment, worker, or funding wallet as the
agent signer. The agent address must be explicitly approved by the deployed
RiskGuard owner on the target testnet before signing. The web process should
not receive worker or signer secrets.

Legal metadata, public origin, hosted evidence URL, media URL, and submission
fields are operator-owned release inputs. This repository does not invent
them.

## Evidence and signing commands

The following commands are intentionally separated. Packet creation is
read-only; signing uses a dedicated key; submission is a live testnet mutation.

```bash
corepack pnpm build:evidence-packet --packet-only > /tmp/loomcredit-evidence.json
corepack pnpm --silent --filter @loomcredit/agent quote \
  /tmp/loomcredit-evidence.json > /tmp/loomcredit-model-quote.json
corepack pnpm evidence:manifest \
  --agent-quote /tmp/loomcredit-model-quote.json
corepack pnpm --filter @loomcredit/agent quote \
  /tmp/loomcredit-evidence.json --sign > /tmp/loomcredit-signed-quote.json
corepack pnpm submit:quote \
  /tmp/loomcredit-signed-quote.json --dry-run

# After the live command returns its JSON receipt:
corepack pnpm evidence:manifest \
  --agent-quote /tmp/loomcredit-signed-quote.json \
  --riskguard-receipt /tmp/loomcredit-riskguard-receipt.json
```

`--dry-run` performs schema, chain, evidence, signer, EIP-712, policy, and
allowlist checks without broadcasting. Run the non-dry submission command only
with a human present after reviewing the destination, quote, nonce, expiry,
and expected testnet mutation. The receipt-aware evidence command records only
public transaction fields; it never copies the raw signature or model output
into the public evidence manifest.

## Verification

Run the relevant gates before publishing or presenting the project:

```bash
corepack pnpm format:check
corepack pnpm typecheck
corepack pnpm test
corepack pnpm lint
corepack pnpm build
corepack pnpm test:contracts
corepack pnpm secret-scan
corepack pnpm secret-scan:test
corepack pnpm public-boundary:check
corepack pnpm agent-evidence:test
corepack pnpm submit-quote:test
```

`submission:preflight` is also available when all event artifacts are present.
It is expected to report blockers until model, signer, legal, public-hosting,
media, and submission gates are genuinely complete.

For browser verification, install Playwright in an isolated development
environment and run:

```bash
python scripts/browser-smoke.py
```

## Repository layout

```text
contracts/source/      Source escrow and lifecycle contracts
contracts/creditcoin/  USC evidence, registry, RiskGuard, and vault
shared/                Schemas, arithmetic, and local fixture data
agent/                 Model adapter, evidence binding, policy, signing
worker/                USC proof worker, retries, SQLite stages, status feed
web/                   Next.js console and public assets
scripts/               Bounded local, evidence, test, and release utilities
docs/*.json            Public testnet deployment and evidence artifacts
README.md              This code-only release guide
```

## Creditcoin and hackathon fit

The prototype is AI-primary with a concrete RWA/DeFi supplier-finance use
case. Attestcoin/USC is a necessary evidence rail: the source order event is
not treated as underwriting truth until it is verified and registered on
Creditcoin.

Re-check current organizer rules, tracks, eligibility, deadlines, and required
fields directly before an external action:

- [Creditcoin BUIDL page](https://buidl.creditcoin.org/)
- [DoraHacks BUIDL CTC page](https://dorahacks.io/hackathon/buidl-ctc/detail)

This repository does not claim sponsorship, partnership, listing, judging
outcomes, customer traction, or production readiness.

## Render deployment

The included `scripts/render-start.mjs` runs the production Next.js console,
the read-only worker status feed, and the source-chain watcher under one Render
web service. Only Next.js listens on Render's public `PORT`; the worker API
stays on loopback and is proxied through `/api/live-evidence`.

Use a paid Render web-service plan with a persistent disk mounted at
`/var/data`. Render services otherwise have an ephemeral filesystem, which
would reset worker cursors and wallet sessions after a restart. Use these
commands:

```text
Build: corepack pnpm install --frozen-lockfile && corepack pnpm build
Start: corepack pnpm start:render
Health: /api/health
Disk: /var/data (at least 1 GB)
```

Set these service variables in Render. Enter secret values in Render's
environment editor; never paste them into the repository or chat.

```text
NEXT_PUBLIC_SITE_URL=https://<the-final-render-origin>
AUTH_ORIGIN=https://<the-final-render-origin>
AUTH_CHAIN_ID=11155111
AUTH_OPERATOR_ADDRESSES=<lowercase operator wallet, optional>
AUTH_SECURE_COOKIE=true
AUTH_DATABASE_PATH=/var/data/auth.sqlite

SOURCE_CHAIN_RPC_URL=<Sepolia RPC URL>
CREDITCOIN_RPC_URL=https://rpc.cc3-testnet.creditcoin.network
PROOF_BUILDER_URL=https://prover.cc3-testnet.creditcoin.network
SOURCE_CHAIN_KEY=1
CREDITCOIN_WALLET_PRIVATE_KEY=<funded disposable CC3 testnet worker key>
WORKER_START_BLOCK=11443299
WORKER_DATABASE_PATH=/var/data/worker.sqlite
EVIDENCE_API_HOST=127.0.0.1
EVIDENCE_API_PORT=8787
WORKER_CONFIRMATIONS=2
WORKER_POLL_INTERVAL_MS=15000
```

The public deployment manifests supply the source escrow and
`TradeEvidenceUSC` addresses, so those variables can remain unset unless a
different testnet deployment is intentionally selected. The worker key must
be a disposable, funded testnet identity; do not reuse a deployer, source
operator, or agent signer for a serious deployment. `MODEL_API_KEY` and
`CREDITCOIN_AGENT_PRIVATE_KEY` are not required by the hosted UI/watcher and
must not be added to the web runtime unless the separate quote service is
deliberately enabled and independently reviewed.

Before calling the site production-ready, configure the five `LEGAL_*`
values, verify `/api/ready` reports a reachable live worker, and confirm that
the public UI still labels testnet, accounting-only, and non-production
boundaries accurately.

## Security boundary

- The sandbox vault is accounting-only test liquidity; it does not hold user
  funds.
- The model cannot authorize capital or access a private key.
- Evidence, policy, signer, nonce, expiry, lifecycle, exposure, and liquidity
  checks are enforced before reservation.
- Failure is explicit and fail-closed: unavailable model and missing evidence
  produce `REFER`; unsafe quotes are rejected; unknown signers and replayed
  nonces cannot pass RiskGuard.
- Public status routes expose sanitized state only; they do not accept proof
  bytes, private keys, signed quote submissions, or mutation requests.

Use disposable testnet accounts and review every live transaction. This is a
technical prototype, not financial, legal, or compliance advice.
