# LoomCredit Threat Model and Test Plan

## 1. Assets to protect

- integrity of verified order evidence;
- uniqueness of a financed commercial order;
- correctness of lifecycle state;
- sandbox capital reservations;
- lender policy limits;
- buyer and supplier commercial privacy;
- availability and recoverability of the worker;
- auditability of AI-generated quotes;
- credibility of the public demo.

## 2. Trust boundaries

| Boundary            | Trusted for                                                  | Not trusted for                                               |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| Attestcoin verifier | Transaction inclusion and finalized-chain continuity         | Transaction success, legal meaning, physical delivery         |
| Source escrow       | Emitting allowed lifecycle events if code/address is trusted | Buyer identity or off-chain contract enforceability by itself |
| Proof worker        | Availability, proof retrieval, transaction submission        | Ability to bypass on-chain validation                         |
| AI provider         | Generating a structured recommendation                       | Final authority over capital or policy                        |
| RiskGuard           | Enforcing encoded limits                                     | Judging off-chain fraud not represented in evidence           |
| Admin/multisig      | Managing allowlists and emergency pause                      | Claiming decentralization without disclosure                  |
| Marketplace/lender  | KYB, legal agreement, dispute process                        | Cryptographic source-chain truth without proof                |

## 3. Threat register

| ID  | Threat                         | Attack                                                    | Control                                                 | Demo/Test                                   |
| --- | ------------------------------ | --------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| T01 | Fake emitter                   | Attacker emits identical event from another contract      | Trusted source-contract allowlist                       | `testRejectsUntrustedEmitter`               |
| T02 | Failed transaction             | Included but reverted transaction is treated as valid     | Explicit receipt-status validation                      | `testRejectsFailedReceipt`                  |
| T03 | Proof replay                   | Same query processed twice                                | `queryKey` replay map                                   | `testRejectsReplay`                         |
| T04 | Duplicate commercial order     | Same PO committed via a new transaction                   | Order fingerprint lock                                  | `testRejectsDuplicateFingerprint`           |
| T05 | Terms substitution             | Genuine proof paired with altered terms                   | Compare exact `termsCommitment` and fields              | `testRejectsTermsMismatch`                  |
| T06 | Cancellation race              | Quote accepted after cancellation                         | Registry state and quote evidence freshness             | `testCancellationInvalidatesQuote`          |
| T07 | Malicious AI                   | Agent proposes 80% advance                                | Hard maximum in `RiskGuard`                             | `testRejectsUnsafeAdvance`                  |
| T19 | Zero-value approval            | Agent proposes an approval with no reservation amount     | Positive amount check in policy and `RiskGuard`         | `testRejectsZeroAdvanceQuote`               |
| T08 | Stale quote                    | Old quote used after policy/evidence change               | TTL, nonce, policy version                              | `testRejectsExpiredQuote`                   |
| T09 | Model impersonation            | Unauthorized signer submits quote                         | Approved agent signer registry/EIP-712                  | `testRejectsUnknownSigner`                  |
| T10 | Buyer concentration            | Agent overallocates to one buyer                          | On-chain exposure cap                                   | `testRejectsBuyerConcentration`             |
| T11 | Reentrancy                     | External call reenters reserve path                       | CEI + guard                                             | Foundry invariant/fuzz test                 |
| T12 | Worker crash                   | Event lost between detection and submission               | Persistent idempotent state + reconciliation            | Kill/restart integration test               |
| T13 | Proof API outage               | Hosted proof service unavailable                          | Retry, backoff, no trusted fallback approval            | Failure-injection test                      |
| T14 | Source reorg before finality   | Event acted on too early                                  | Wait for finalized/attested state                       | Integration test against attestation status |
| T15 | Privacy dictionary attack      | Unsalted predictable PO hash reversed                     | Salted commitments and access-controlled document store | Static review/test vector                   |
| T16 | Admin abuse                    | Owner changes limits or allowlist silently                | Multisig, timelock where practical, events              | Governance event test                       |
| T17 | Physical non-performance       | Supplier never delivers                                   | Limited claim; dispute/freeze process                   | Q&A and state-machine demo                  |
| T18 | Off-network double finance     | Same order financed elsewhere                             | Explicit scope limitation; future registry integrations | Claim audit, not code-only fix              |
| T20 | Zero identity commitment       | Source order omits buyer or supplier identity binding     | Source escrow rejects zero identity commitments         | `testRejectsZeroIdentityCommitment`         |
| T21 | Lifecycle payload substitution | Valid event topic is paired with altered lifecycle fields | USC verifier compares the complete expected payload     | `testRejectsLifecyclePayloadMismatch`       |
| T22 | Excessive quote fee            | Model inflates the fee while staying below advance limits | Shared 10% cap and on-chain `MAX_FEE_BPS`               | `testRejectsFeeAbovePolicyMaximum`          |

## 4. Contract unit tests

### `OrderGuaranteeEscrow`

- creates valid order;
- rejects zero guarantee;
- rejects guarantee above order value;
- rejects expired deadline;
- rejects zero terms commitment;
- rejects zero buyer or supplier identity commitments;
- buyer-only cancellation;
- invalid transition reverts;
- settlement amount bounds;
- event field integrity.

### `TradeEvidenceUSC`

- valid proof registers evidence;
- unsupported chain key reverts;
- malformed proof reverts;
- failed receipt reverts;
- incorrect source address reverts;
- wrong event signature reverts;
- topic/data mismatch reverts;
- replay reverts;
- duplicate fingerprint reverts;
- cancellation, dispute, and settlement proofs compare every decoded lifecycle field;
- direct settlement and disputed cancellation follow the source lifecycle; terminal states cannot reopen;
- state mutation occurs before external call.

### `RiskGuard`

- accepts valid quote;
- rejects a zero-value approval before vault mutation;
- rejects excess advance;
- rejects insufficient guarantee;
- validates the settlement token as part of the exact USC evidence fields;
- rejects quote past TTL;
- rejects a fee above the 10% policy cap;
- rejects cancelled/disputed order;
- rejects wrong model signer;
- rejects wrong policy version;
- rejects buyer concentration limits and tracks supplier exposure release;
- rejects insufficient sandbox liquidity.

## 5. Property and invariant tests

- A `Cancelled`, `Disputed`, or `Settled` facility can never return to `Reserved`.
- Total reserved capital never exceeds vault assets.
- One order fingerprint maps to at most one active facility.
- One source query key is processed at most once.
- Accepted advance never exceeds `MAX_ADVANCE_BPS * orderValue`.
- A quote can never outlive its evidence or policy version.
- Quote expiry is infrastructure-owned and stays inside the 60–300 second window.
- Only verified evidence can create a quoteable facility.

Use Foundry fuzzing for amount, deadline, nonce, log index, and lifecycle transition inputs.

## 6. Worker tests

- detects source event from checkpoint;
- stores event before proof request;
- resumes after process kill;
- handles duplicate logs idempotently;
- waits for attestation;
- records each benchmark timestamp;
- retries transient proof failures with capped exponential backoff;
- sends no Creditcoin transaction when local validation fails;
- reconciles source and target state;
- alerts on permanently failed event.

## 7. Agent tests

- JSON schema validation;
- strict-object and cross-field schema validation (`guarantee <= order value`, available liquidity <= total liquidity, and positive approvals);
- deterministic test fixtures;
- no free-form amount parsing;
- evidence IDs copied exactly;
- reason-code allowlist;
- refusal when required evidence is missing;
- prompt injection inside commercial text cannot modify policy fields;
- model outage routes to `REFER`, not auto-approval;
- 80% malicious recommendation is rejected by the local deterministic policy
  lab; the approved model-to-RiskGuard path has a recorded `QuoteApproved`
  receipt, while a live unsafe-rejection receipt remains a release gate.

## 8. Demo evidence bundle

Record and publish:

- deployed contract addresses;
- exact chain IDs and RPC labels;
- source and Creditcoin transaction hashes;
- decoded source event;
- attestation height;
- proof request and response identifiers;
- accepted quote JSON;
- rejected quote JSON;
- replay/fake-emitter/cancellation transaction receipts;
- ten-run latency table;
- commit SHA and release tag;
- three-minute demo video.

## 9. Claim review gate

Before recording, search all copy for these forbidden phrases:

```text
instant finality
15-second end-to-end
trustless trade finance
AI predicts default
globally prevents duplicate financing
production-ready lending
secured by the purchase order
supports all chains
```

Replace them with measured, scoped language.
