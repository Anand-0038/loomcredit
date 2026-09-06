# AI underwriting boundary

LoomCredit keeps three decisions separate:

> Cryptography determines what happened. AI recommends what to do. RiskGuard determines what is allowed.

## Inputs

The model adapter accepts only the typed `EvidencePacket` schema from `shared/src/schemas.ts`. It receives an evidence ID, order and guarantee amounts, the exact source-chain delivery deadline, commitments, lifecycle state, settlement counters, exposure, total and available sandbox liquidity, policy version, and proof status. Money, exposure, deadlines, timestamps, counts, and quote integers must remain JavaScript safe integers at the schema boundary; the shared policy engine performs basis-point arithmetic with `bigint` before returning bounded display numbers. The off-chain policy uses the exact deadline and the same vault total-liquidity capacity that RiskGuard uses on-chain; it does not reconstruct a deadline from a rounded tenor or receive arbitrary purchase-order text or a private key.

The packet must identify the source and execution networks explicitly. `LIVE_VERIFIED` is the only status that represents a completed live evidence path; `LOCAL_FIXTURE`, `PENDING`, and `FAILED` remain visibly bounded states.

## Output and failure behavior

The model must return a JSON `FacilityQuote` matching the strict schema. Its decision, advance, fee, risk tier, reason codes, evidence IDs, policy version, and model version are validated before the result is used. The shared policy cap is 1,000 fee basis points (10%), and infrastructure normalizes an actionable quote to a 60–300 second freshness window; the provider does not control expiry.

The adapter uses a 15-second request timeout and fails closed:

```text
missing model configuration → REFER / MODEL_UNAVAILABLE
network or HTTP failure     → REFER / MODEL_UNAVAILABLE
invalid JSON                 → REFER / MODEL_UNAVAILABLE
schema failure               → REFER / MODEL_UNAVAILABLE
missing or unverified proof  → REFER / EVIDENCE_MISSING
evidence ID mismatch         → quote rejected before policy evaluation
zero-value APPROVE quote     → rejected by policy; no signing or vault call
```

No malformed financial field is repaired with a guess.

## Reproduce the real model boundary

Provide `MODEL_BASE_URL`, `MODEL_API_KEY`, and `MODEL_NAME` only to the agent/worker environment, then pass a JSON evidence packet:

The packet must represent a newly registered `EVIDENCE_VERIFIED` facility for a
fresh quote. The recorded demo packet is already `SANDBOX_RESERVED` (raw
contract state `RESERVED`) after its historical
`QuoteApproved` receipt and is intentionally not reusable for another quote.

```bash
corepack pnpm --filter @loomcredit/agent quote --help
corepack pnpm --filter @loomcredit/agent quote ./path/to/evidence-packet.json
# Request an EIP-712 payload for an APPROVE result.
corepack pnpm --filter @loomcredit/agent quote ./path/to/evidence-packet.json --sign > signed-quote.json
# Attach the validated model/signer summary to the evidence bundle; no broadcast.
corepack pnpm evidence:manifest --agent-quote signed-quote.json
# Submit that signed payload from the funded worker/operator environment.
corepack pnpm submit:quote signed-quote.json --dry-run
corepack pnpm submit:quote signed-quote.json
```

With no model configuration the command still produces an explicit `REFER` result. That is a fail-closed response, not a local success claim. The local UI fixture remains available only in the separately labelled adversarial/demo boundary.

The local policy lab marks the signer check as `NOT_APPLICABLE` because it does
not request a wallet signature or a RiskGuard transaction. A live agent quote
must instead pass the allowlisted-signer check before it can be signed; the
fixture's green policy result must never be read as signer authorization.

The same rule applies to an unsigned `MODEL_TYPED_EVIDENCE` CLI result: its
deterministic terms may be approved, but the signer check remains
`NOT_APPLICABLE` until the CLI has actually produced a signature. The emitted
signed artifact re-evaluates that check with the recovered signer before it is
eligible for the mutation-free submit validation.

## Signature and contract boundary

The `--sign` path produces an EIP-712 signature over the order, decision, advance, fee, expiry, evidence ID, reason-code hash, policy version, model version, nonce, chain ID, and verifying contract. It requires `CREDITCOIN_AGENT_PRIVATE_KEY`, `CREDITCOIN_RPC_URL`, and `RISK_GUARD_ADDRESS` (or a deployed manifest); before emitting a signed artifact it reads `RiskGuard.approvedSigners(signer)` and fails if the derived signer is not allowlisted. `submit:quote` uses the worker/operator wallet only to pay the CC3 transaction fee; it does not use that wallet as the model signer by default. `RiskGuard` accepts only the signed `APPROVE` decision; `REFER` and `REJECT` can never reserve capital. Neither private key is sent to the model provider or browser.

`evidence:manifest --agent-quote` validates the model CLI output against the
same live packet and records a reduced `MODEL_QUOTE_VERIFIED` or
`SIGNED_QUOTE_VERIFIED` summary. For a signed artifact it runs the same
mutation-free EIP-712 validation as `submit:quote --dry-run`; it deliberately
recomputes the decision, reason-code, policy-version, model-version, and nonce
bindings, and requires the deterministic policy result to be `APPROVED`. It
deliberately excludes the raw response and signature from the generated public
bundle. The normal submit command performs the external mutation only after
that validation succeeds.

The repository regression path `corepack pnpm submit-quote:test` generates an
ephemeral test signer at runtime and verifies help, valid dry-run validation,
and rejection of non-live evidence. It never stores a key, contacts an RPC,
or broadcasts a transaction.

`RiskGuard` independently checks the recovered signer, evidence binding, nonce, expiry, policy versions, advance and fee caps, positive reservation amount, guarantee ratio, exact delivery deadline, buyer concentration, lifecycle state, and available liquidity before reserving sandbox capital. A model response is therefore a proposal, not an authorization.

Successful submissions emit the backwards-compatible `QuoteApproved` receipt and,
in the updated source, a `QuoteDecisionAudited` receipt containing the complete
signed decision terms: decision, amount, advance, fee, expiry, reason-code hash,
policy/model versions, nonce, and quote hash. `scripts/submit-quote.mjs` verifies
both the signed quote hash and every field in the extended audit event when that
event exists. The currently recorded CC3 deployment predates this extended event,
so its submission output truthfully reports `NOT_AVAILABLE_ON_DEPLOYED_BYTECODE`
until the source is redeployed and independently read back.
