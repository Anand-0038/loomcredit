# LoomCredit Technical Claims Verification

**Verified on:** 8 August 2026  
**Purpose:** Prevent stale USC claims from entering the README, deck, demo, or judge Q&A.

## Executive correction

The current USC system is materially faster than the old v1 STARK workflow, but two different latency concepts must not be collapsed:

1. **Source finality and Attestcoin attestation:** the source block must first be finalized and attested on Creditcoin.
2. **On-chain proof verification:** once the required attestation exists and the proof has been generated, the native verifier checks the proof synchronously in the same Creditcoin transaction, normally within approximately one Creditcoin block (~15 seconds).

Therefore, the safe claim is:

> **USC verifies an already-attested source-chain transaction synchronously in one Creditcoin block (~15 seconds). LoomCredit records the complete source-event-to-Creditcoin-execution latency for each demo run instead of claiming a universal 15-second end-to-end time.**

Do **not** say “buyer commits an order and credit always unlocks in 15 seconds” until the deployed system has measured source finality, attestation, proof generation, submission, and execution under the actual hackathon environment.

## Claims approved for public use

| Claim                                    | Status                           | Exact wording to use                                                                                                                                               |
| ---------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native verifier address                  | Confirmed                        | “LoomCredit calls Creditcoin’s native query verifier precompile at `0x0000000000000000000000000000000000000FD2`.”                                                  |
| Verification model                       | Confirmed                        | “Merkle and continuity proofs are verified synchronously in the same Creditcoin transaction.”                                                                      |
| Verification latency                     | Confirmed with qualifier         | “Once a source block is finalized and attested, proof verification completes in approximately one Creditcoin block (~15 seconds).”                                 |
| Transaction success                      | Confirmed limitation             | “The precompile proves inclusion and chain continuity; LoomCredit separately validates the source receipt status.”                                                 |
| Batch verification                       | Confirmed                        | “The current USC documentation supports batches of up to ten queries sharing a continuity proof.”                                                                  |
| Source-side contract design              | Confirmed                        | “Source contracts should remain minimal and emit purpose-built events containing every field required by Creditcoin logic.”                                        |
| Worker requirement                       | Confirmed                        | “A worker still monitors events, waits for attestation, obtains proofs, retries safely, and submits the Creditcoin transaction.”                                   |
| Mainnet readability                      | Confirmed                        | “USC readability for Ethereum mainnet went live on Creditcoin mainnet on 18 June 2026.”                                                                            |
| Mainnet writeability                     | Not confirmed                    | Do not claim Creditcoin can currently write back to Ethereum through USC.                                                                                          |
| Hackathon test path                      | Confirmed from official examples | “The testnet prototype uses Ethereum Sepolia as the source chain and Creditcoin Testnet/CC3 as the execution chain.”                                               |
| Supported chains beyond Ethereum/Sepolia | Not sufficiently confirmed       | Query the SDK and ask at the AMA before promising Arbitrum, Base, Polygon, Solana, or Bitcoin support.                                                             |
| End-to-end 15-second unlock              | Not confirmed                    | The first run recorded a 15,313 ms CC3 submission/inclusion segment and a 22,015 ms final attempt after attestation; this is one run, not a percentile or promise. |

## Current architecture

```text
Ethereum/Sepolia source event
        ↓
Source block finality
        ↓
Attestor quorum records finalized source-chain state on Creditcoin
        ↓
Proof Generation API or worker creates Merkle + continuity proofs
        ↓
LoomCredit USC calls 0x0FD2
        ↓
Same-transaction verification + receipt/event validation
        ↓
RiskGuard executes Creditcoin business logic
```

## Why the old 8–12 minute number appeared

USC v1 used prover contracts and STARK proving. The current migration guide states that v2 replaced that architecture with a native query-verification precompile and removed the separate STARK and prover-contract flow. Older documentation still describes average proving times near 12 minutes; those pages are marked outdated. The current documentation describes synchronous native verification.

The presence of a **15-minute worker timeout** also must not be interpreted as the expected transaction latency. A timeout is a failure ceiling, not a median.

## Required benchmark instrumentation

The worker must record these timestamps independently:

```text
t_source_tx_submitted
t_source_tx_mined
t_source_block_finalized
t_target_height_attested
t_proof_request_started
t_proof_received
t_creditcoin_tx_submitted
t_creditcoin_tx_mined
t_business_state_updated
```

Publish:

- source confirmation/finality time;
- attestation wait time;
- proof-generation time;
- Creditcoin inclusion/verification time;
- complete end-to-end time; and
- p50/p95 values over at least ten test runs.

The first recorded live run is in [`docs/demo-evidence.md`](demo-evidence.md).
It reports the attestation-wait boundary, proof-generation segment,
CC3 submission/inclusion segment, and final attempt after the attestation
boundary. The wall-clock total includes five retryable failed submissions from
the initial receipt-log-index bug and is therefore not presented as a clean
median.

## Environment values to verify on day one

Do not hard-code from memory. Run the SDK/environment command and record:

- supported source chains and `chainKey` values;
- Creditcoin Testnet RPC;
- EVM chain ID;
- Blockscout explorer;
- proof-generation endpoint;
- deployed verifier/precompile address;
- attestation status method;
- current SDK and contracts package versions; and
- faucet procedure.

## Source references

1. Creditcoin USC product overview: https://docs.creditcoin.org/usc
2. USC architecture overview: https://docs.creditcoin.org/usc/overview/usc-architecture-overview
3. Universal Smart Contracts contract guide: https://docs.creditcoin.org/usc/dapp-builder-infrastructure/universal-smart-contracts
4. Migration guide: https://docs.creditcoin.org/usc/migration-guide
5. Attestation subsystem: https://docs.creditcoin.org/usc/creditcoin-oracle-subsystems/attestation
6. Query, proof and verification: https://docs.creditcoin.org/usc/creditcoin-oracle-subsystems/proving
7. Source-chain contract guidance: https://docs.creditcoin.org/usc/dapp-builder-infrastructure/source-chain-smart-contracts
8. Official examples: https://github.com/gluwa/usc-testnet-bridge-examples
9. Mainnet readability announcement: https://creditcoin.org/blog/universal-smart-contracts-are-live-on-creditcoin-mainnet/
10. Creditcoin Testnet environment: https://docs.creditcoin.org/environments/testnet

## Public wording blacklist

Never publish these without new evidence:

- “instant cross-chain finality”
- “15-second end-to-end lending”
- “supports every chain”
- “moves assets between Ethereum and Creditcoin”
- “proves delivery of physical goods”
- “fully trustless trade finance”
- “production-ready lending”
- “AI predicts default”
- “globally eliminates duplicate financing”
