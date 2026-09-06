# Live testnet deployment path

This repository has a deterministic deployment path for the first real LoomCredit evidence run. It is intentionally separate from the web app: deployment and worker signing keys never belong in `web/.env.local`, `NEXT_PUBLIC_*`, or the web health route.

The scripts require real operator keys, funded accounts, and reachable RPCs. They do not create fabricated hashes or fall back to local fixtures.

The Node scripts load the repository-root `.env` automatically when it is
present. Existing shell environment variables still take precedence. Keep the
file local and ignored; never commit it.

## Render deployment contract

`render.yaml` describes the hosted prototype as one paid web service. The web
console and source worker share a process so the status API remains bound to
loopback, while the service disk at `/var/data` holds the worker, case, and
authentication SQLite files. Render free web services cannot attach a
persistent disk; changing the blueprint to `plan: free` would make this state
ephemeral and is not an acceptable production-proof configuration. See the
[Render persistent disk documentation](https://render.com/docs/disks) and
[free instance limitations](https://render.com/docs/free).

Before applying the blueprint, fill every `sync: false` value in Render's
environment UI. At minimum this means the public URL/origin, operator allowlist,
a provider-owned Sepolia RPC, a funded disposable CC3 worker key, and the
Groq-compatible model key. Keep deployment keys and the separate agent signer
out of this hosted service; no hosted signing or transaction submission is
implemented by this release.

The blueprint is preparation only until the exact verified release commit is
available in a Git remote. After that external gate, validate it with:

```bash
render whoami -o json
render blueprints validate
```

## Networks and manifests

The current target is:

| Network                |   Chain ID | Explorer                                                           |
| ---------------------- | ---------: | ------------------------------------------------------------------ |
| Ethereum Sepolia       | `11155111` | [Sepolia Etherscan](https://sepolia.etherscan.io)                  |
| Creditcoin CC3 testnet |   `102031` | [Creditcoin Blockscout](https://creditcoin-testnet.blockscout.com) |

The deployment scripts write the single source of truth for deployed addresses to:

```text
docs/deployments/source-deployment.json
docs/deployments/creditcoin-deployment.json
docs/deployments/source-order.json
```

Those files are deliberately absent until a real run succeeds. They contain public addresses, transaction hashes, block numbers, wiring checks, and the Git commit used when each artifact was generated; they must never contain private keys.

## Source chain

Build the source contracts and provide a funded Sepolia operator account:

```bash
forge build --root contracts/source
corepack pnpm deploy:source
```

`deploy:source` checks chain ID `11155111`, deploys the test-only `MockUSDC` and `OrderGuaranteeEscrow`, waits for both receipts, and writes the source deployment manifest.

## Creditcoin

Provide a funded CC3 deployer account. The script reads the source escrow address from the source deployment manifest:

```bash
forge build --root contracts/creditcoin
corepack pnpm deploy:creditcoin
```

`deploy:creditcoin` checks chain ID `102031`, deploys the USC decoder library plus `FacilityRegistry`, `SandboxCapitalVault`, `RiskGuard`, and linked `TradeEvidenceUSC`, wires the permissions and approved agent signer, reads the wiring back, and fails if any relationship is incorrect. `CREDITCOIN_AGENT_SIGNER_ADDRESS` is optional for the first deployment and defaults to the deployer; set a separate service signer and matching `CREDITCOIN_AGENT_PRIVATE_KEY` before using the real quote path. `SANDBOX_LIQUIDITY_MINOR` may be set for explicit test liquidity; it defaults to zero.

For the recorded order, the deployment manifest contains enough accounting-only
sandbox liquidity to support RiskGuard's maximum advance while respecting its
buyer-concentration cap. `submission:preflight` verifies that relationship from
the recorded order and deployment manifests; a nonzero balance alone is not
sufficient.

If the deployer balance is zero, request CTC EVM test tokens through the
[official Creditcoin testnet faucet instructions](https://docs.creditcoin.org/wallets/using-testnet-faucet)
in the Creditcoin Discord `token-faucet` channel. The deployment command is
intentionally fail-closed and does not attempt any transaction until the
balance is non-zero.

The native USC verifier defaults to the current v2 precompile address `0x0000000000000000000000000000000000000FD2`. Set `USC_VERIFIER_ADDRESS` only when the selected Creditcoin environment requires a different verifier.

## One real source event

After both source deployment and the supplier/commitment values are configured:

```bash
corepack pnpm seed:source-order
```

This mints the test-only settlement units to the source operator, approves the escrow, and submits one real `OrderGuaranteed` transaction. The script parses the receipt and writes `source-order.json`; it does not accept a manually supplied transaction hash.

The default order is `$10,000` test units with a `$2,000` buyer guarantee and a 40-day deadline. Override the `SOURCE_*` seed fields for a different testnet order. Commitments are required because they are opaque inputs, not claims that the prototype should invent.

## Worker handoff

### Identity separation gate

The testnet can be bootstrapped with disposable operator accounts, but a
serious deployment must use four distinct identities. The separation is a
control boundary, not a naming convention:

| Identity        | Secret                            | Allowed responsibility                                     |
| --------------- | --------------------------------- | ---------------------------------------------------------- |
| Source operator | `SOURCE_OPERATOR_PRIVATE_KEY`     | Creates the source-chain test order and lifecycle actions  |
| CC3 deployer    | `CREDITCOIN_DEPLOYER_PRIVATE_KEY` | Deploys and wires the CC3 contracts                        |
| Worker operator | `CREDITCOIN_WALLET_PRIVATE_KEY`   | Pays worker transaction fees and submits verified evidence |
| Agent signer    | `CREDITCOIN_AGENT_PRIVATE_KEY`    | Signs the EIP-712 quote accepted by `RiskGuard`            |

The web process receives none of these secrets. The agent signer must derive
the address recorded in `CREDITCOIN_AGENT_SIGNER_ADDRESS` or the deployment
manifest, and the worker must never be used as the model signer by default.
`submission:preflight` derives public addresses in memory without printing
secrets and blocks when roles are reused or incomplete. Do not rotate keys in the
repository: provision fresh disposable testnet accounts out of band, update
the corresponding allowlist and deployment manifest, then run the preflight
again.

The worker still requires its own runtime configuration:

```text
SOURCE_CHAIN_RPC_URL
CREDITCOIN_RPC_URL
PROOF_BUILDER_URL
SOURCE_CHAIN_KEY
SOURCE_ESCROW_ADDRESS
TRADE_EVIDENCE_USC_ADDRESS
CREDITCOIN_WALLET_PRIVATE_KEY
SOURCE_DEPLOYMENT_MANIFEST
CREDITCOIN_DEPLOYMENT_MANIFEST
WORKER_START_BLOCK
CREDITCOIN_START_BLOCK
```

The worker defaults to the two public deployment manifest paths and resolves `SOURCE_ESCROW_ADDRESS` and `TRADE_EVIDENCE_USC_ADDRESS` from them when explicit address overrides are blank. Keep `CREDITCOIN_WALLET_PRIVATE_KEY` only in the long-lived worker environment. The web process does not need it and `/api/health` reports worker secrets as `not-applicable`. Configure the web-side read-only feed proxy with `LIVE_EVIDENCE_API_URL`; the browser calls same-origin `/api/live-evidence` so it does not need direct access to the worker host. `NEXT_PUBLIC_LIVE_EVIDENCE_API_URL` remains a local compatibility fallback.

On an empty worker database, startup hydrates the independently recorded testnet proof from `RECORDED_EVIDENCE_MANIFEST` and `RECORDED_SOURCE_ORDER_MANIFEST`. This recovery is local, deterministic, and read-only: it neither calls a proof provider nor submits a transaction. The status API labels that row `RECORDED_TESTNET`; a newly observed watcher event is labeled `WORKER_LIVE`. Keep both manifests public, versioned, and consistent with the configured source escrow. Render's persistent disk remains required for new case, worker, and authentication state after that baseline recovery.

`CREDITCOIN_START_BLOCK` bounds receipt-log reconciliation after a worker crash. When blank, the worker derives the earliest deployment block from the Creditcoin manifest.

## User-submitted source cases

The web `/review` page now has a separate **Real source intake** form. It accepts
only a source transaction hash and requested terms. The requested advance and
delivery tenor are stored as case inputs; they never overwrite or become proof
fields from the source receipt.

The authenticated operator action calls the worker's loopback-only mutation
route:

```text
POST /v1/intakes
GET  /v1/intakes/:requestId
```

The web service creates the request ID before calling the worker and persists
it with the case. The worker requires that caller-owned ID, canonicalizes the
source transaction hash, and atomically reuses an existing intake for the same
source transaction. A second case cannot silently take over an in-flight
request: it receives `SOURCE_TRANSACTION_ALREADY_TRACKED` and the existing
public intake status instead.

The status response contains both the current event and a chronological
`history` array for the matched order. A verified `OrderGuaranteed` event also
includes a `sourceOrder` snapshot decoded from the source receipt: buyer,
supplier, settlement token, order value, guarantee, delivery deadline, and
nonce. These are source facts; the case's requested advance and delivery tenor
remain separate operator inputs. Later cancellation, dispute, or settlement
events stay in the same history and block a new proposal until the order is no
longer eligible.

If a worker restart leaves an intake in `PROCESSING`, the status API reopens it
as `FAILED_RETRYABLE` after ten minutes without an active in-process job. The
operator can then retry the same durable request ID; an active job is never
requeued by this recovery path.

The worker accepts only the configured source escrow and the expected
`OrderGuaranteed` event, then runs the existing durable USC/CC3 processor. The
case status is one of `ACCEPTED`, `PROCESSING`, `COMPLETED`,
`FAILED_RETRYABLE`, or `FAILED_TERMINAL`. A `COMPLETED` case means that the
source receipt, USC proof path, CC3 verification transaction, and registry
read-back succeeded. It does not mean a loan was approved or capital moved.

When a case reaches `COMPLETED`, its detail page exposes a separate
**Generate bounded proposal** action. That action calls the worker's
loopback-only proposal route:

```text
POST /v1/proposals
```

The web server supplies the durable request ID, source transaction, and the
terms saved with the case; the browser cannot replace them. The worker rebuilds
the evidence packet from the verified event, invokes the configured
OpenAI-compatible model only when `MODEL_API_KEY` is available, and validates
the structured quote against the shared schema and the requested terms. The
public response contains the provider host, model name, quote, deterministic
policy checks, and signing status, but never the raw model response, API key,
signature, or private key. Missing model configuration returns `REFER`; a
fixture artifact is rejected at this boundary.

The case page does not expose a proposal button merely because a case has a
durable `COMPLETED` status. It requires a current worker response containing a
`LIVE_VERIFIED` event, a registry evidence ID, and the completed intake state.
If that read-back is temporarily unavailable, the case remains inspectable but
proposal generation stays stopped until it is refreshed.

This proposal endpoint does not sign, submit, reserve capital, or create a
loan. A future signing flow must remain a separately authenticated human
action with a distinct allowlisted agent signer and a fresh evidence state.

The status server refuses intake mutations when it is bound to a non-loopback
interface. The Render launcher keeps the worker status API on `127.0.0.1` and
the browser reaches it only through authenticated same-origin web routes.
The normal `dev` command remains read-only so local startup cannot silently
begin chain processing. To intentionally run the live local worker, with a
funded testnet worker and human present, use:

```bash
corepack pnpm worker:watch:embedded
```

That command may submit a real CC3 testnet verification transaction. It is not
required for the Policy Lab or for the recorded proof walkthrough.

The worker then observes the source transaction and submits the USC proof through the existing durable path:

```bash
corepack pnpm worker:watch
```

After a successful worker run, generate the committed evidence bundle from
the persisted row and independent CC3 reads:

```bash
corepack pnpm evidence:manifest
```

This writes `docs/demo-evidence.json` and `docs/demo-evidence.md`; it refuses
fixture or partially processed state and never accepts a manually supplied
hash. The current recorded run is linked from those files.

After the worker reaches `VERIFIED`, build the model input from the worker row
and independent CC3 reads. The command refuses fixture or partially processed
state and prints a `LIVE_VERIFIED` packet:

Use a newly registered facility whose on-chain state is still
`EVIDENCE_VERIFIED` for a fresh quote. The recorded demo order is already
`RESERVED` (shown in the product as `SANDBOX_RESERVED`) because its historical approval receipt is part of the evidence
bundle; the agent and contract paths intentionally reject a new quote against
that order.

```bash
corepack pnpm build:evidence-packet --packet-only > /tmp/loomcredit-evidence.json
corepack pnpm --filter @loomcredit/agent quote /tmp/loomcredit-evidence.json --sign > /tmp/loomcredit-signed-quote.json
corepack pnpm evidence:manifest --agent-quote /tmp/loomcredit-signed-quote.json
corepack pnpm submit:quote /tmp/loomcredit-signed-quote.json --dry-run
corepack pnpm submit:quote /tmp/loomcredit-signed-quote.json > /tmp/loomcredit-riskguard-receipt.json
corepack pnpm evidence:manifest \
  --agent-quote /tmp/loomcredit-signed-quote.json \
  --riskguard-receipt /tmp/loomcredit-riskguard-receipt.json
```

`evidence:manifest --agent-quote` validates the CLI artifact against the same
`LIVE_VERIFIED` order/evidence packet and records only a reduced public summary.
For a signed artifact it also invokes `submit:quote --dry-run` to validate the
EIP-712 payload without broadcasting; the normal submit command remains the
separate live mutation. `--riskguard-receipt` attaches the reduced public
receipt after the live transaction and dates quote-expiry validation at the
receipt's mined block, so a later evidence rebuild does not incorrectly reject
an already-mined historical quote. Without `--agent-quote`, the generated bundle
explicitly records `agent.status: NOT_RUN`.

The initial prototype has no historical settlement index, so the packet
explicitly starts those counters at zero for a newly registered order. That is
an implementation boundary, not a claim about a buyer's off-chain history.

## Safe reruns

Deployment manifests are not overwritten by default. If a deliberate redeployment should replace an existing manifest, set:

```bash
ALLOW_MANIFEST_OVERWRITE=true
```

Do not use that flag to conceal an existing deployment. Review the old manifest and the new receipts first.
