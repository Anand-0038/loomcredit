# Environment verification

Originally checked on 2026-08-08 UTC while implementing the worker and refreshed
against the recorded evidence bundle on 2026-08-15 UTC. This file records
external integration facts and separates them from local repository verification.

## Official references checked

The official USC documentation describes a Creditcoin-side precompile/contract architecture for querying and verifying source-chain data. The official examples repository contains the proof-builder and worker patterns used by this project:

- [USC architecture overview](https://docs.creditcoin.org/usc/overview/usc-architecture-overview)
- [Query proof and verification](https://docs.creditcoin.org/usc/creditcoin-oracle-subsystems/query-proof-and-verification)
- [USC migration guide](https://docs.creditcoin.org/usc/migration-guide)
- [Official bridge examples](https://github.com/gluwa/usc-testnet-bridge-examples)
- [Official example `package.json`](https://raw.githubusercontent.com/gluwa/usc-testnet-bridge-examples/main/package.json)

From the official example package and source files checked during implementation:

- `@gluwa/usc-sdk` version `0.18.0`;
- `@gluwa/usc-contracts` version `0.1.2`;
- `ethers` version family `6.x`;
- the service API is constructed with `proofProvider.service.ProofBuilder`;
- the worker waits for attestation before requesting a proof;
- the proof response carries a chain key, header number, transaction bytes, Merkle proof, and continuity proof;
- the current native verifier shape used by the examples includes `verifyAndEmit` and `calculateTxIndex` at the CC3 precompile boundary.

The repository pins the package versions above and keeps the native verifier interface local because the published contracts package does not expose the complete state-changing interface required by the current CC3 example path.

## Testnet endpoints used by configuration

The worker configuration shape is aligned with the current official testnet example:

```text
CREDITCOIN_RPC_URL=https://rpc.cc3-testnet.creditcoin.network
PROOF_BUILDER_URL=https://prover.cc3-testnet.creditcoin.network
SOURCE_CHAIN_KEY=1
```

The current official testnet page also lists EVM chain ID `102031` and the Blockscout explorer at `https://creditcoin-testnet.blockscout.com/`. The web health route does not use these worker variables and never reads `CREDITCOIN_WALLET_PRIVATE_KEY`; it reports only whether the server-side read-only feed proxy is configured and labels worker secrets `not-applicable`. Prefer `LIVE_EVIDENCE_API_URL`; `NEXT_PUBLIC_LIVE_EVIDENCE_API_URL` remains a local compatibility fallback. The browser calls same-origin `/api/live-evidence` so it does not need direct access to the worker host.

The source RPC and deployed source escrow are intentionally blank in `.env.example`. They depend on the selected source deployment and must be supplied by the operator. The same is true of `TRADE_EVIDENCE_USC_ADDRESS` and `CREDITCOIN_WALLET_PRIVATE_KEY`. The deployment and worker scripts load the repository-root `.env` automatically when present; the web app keeps its public-only URL in `web/.env.local`.

## Current live run boundary

On 2026-08-08 UTC, the source deployment path was exercised against Ethereum Sepolia using a funded testnet operator. The public deployment records are committed under `docs/deployments/`:

- `MockUSDC`: `0x4374DB785Ba089A443A9aBD52546178733304f0c`;
- `OrderGuaranteeEscrow`: `0xc8c0C33761C89979e7a090D8B9361Ce6C6930cE4`;
- source deployment receipts are mined and contain bytecode;
- the seeded `OrderGuaranteed` receipt succeeded at block `11443299` and its decoded fields match `source-order.json`;
- source transaction: [0x61462a792651b360e7247becafbd33b446d3fea1a3680c589adbe6625be5e70d](https://sepolia.etherscan.io/tx/0x61462a792651b360e7247becafbd33b446d3fea1a3680c589adbe6625be5e70d).

On 2026-08-08 UTC, the worker's real `UscProofClient` fetched a successful proof for that transaction. The response matched source block `11443299`, transaction index `106`, and returned seven Merkle siblings plus two continuity roots. The worker then submitted that proof to the deployed `TradeEvidenceUSC` contract on CC3.

The funded Creditcoin account `0xFB76C4B6912bCF358752Fb4b4b15B959EfaDD915` deployed and wired the CC3 contracts. The native USC verification receipt succeeded at [0x1beddb24fc145fbb00b0d477fa008f0507d8fa8cd6c7775dd5c685f6487b81b9](https://creditcoin-testnet.blockscout.com/tx/0x1beddb24fc145fbb00b0d477fa008f0507d8fa8cd6c7775dd5c685f6487b81b9), emitted `OrderEvidenceVerified`, and registered evidence ID `0xfed7def6e6d23052735cd35d968d9bca6895077d3a223e418a7c1530575320d9`. The initial registry read-back was `EVIDENCE_VERIFIED`; the later recorded RiskGuard approval moved this accounting-only facility to raw `RESERVED` state, shown in the product as `SANDBOX_RESERVED` with `NO_CAPITAL_MOVED`. See [`docs/demo-evidence.md`](demo-evidence.md) for the complete bundle and measured stages.

## What is verified locally

The local Foundry tests validate the decoder shape, successful receipt requirement, trusted emitter requirement, exact event matching, query replay rejection, policy rejection, nonce replay rejection, buyer concentration, reservation exposure release, and source escrow lifecycle. The worker tests validate config rejection, secret-free public summaries, SQLite persistence, stage transition rules, source-log decoding, bounded log discovery, and durable cursor storage.

## What remains an external gate

The source-evidence path and configured proof request are complete for the recorded `OrderGuaranteed` event. The current bundle also includes a schema-valid model quote, dedicated signer, and successful accounting-only RiskGuard approval. It does not include a live 80% rejection receipt, a fresh live cancellation/dispute/settlement receipt, or the newer `QuoteDecisionAudited` event on the existing deployment. Run `worker:config`, `worker:process`, or `worker:watch` only in a separately controlled environment with real values; the watcher additionally requires an operator-chosen starting block. On hosts with broken IPv6 routing, set `LOOMCREDIT_FORCE_IPV4=true`; it is an opt-in transport workaround, not a protocol requirement.
