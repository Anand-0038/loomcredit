# Demo Evidence Manifest Template

Fill this after deployment. Never invent values.

## Release

```yaml
project: LoomCredit
release_tag: v0.1.0-buidl-ctc
commit_sha: <SHA>
recorded_at_utc: <ISO8601>
source_chain: Ethereum Sepolia
execution_chain: Creditcoin CC3 Testnet
```

## Environment

```yaml
source_chain_id: <value>
source_chain_key: <value from SDK>
creditcoin_chain_id: <value>
source_rpc_label: <provider label, no secret>
creditcoin_rpc: <URL>
source_explorer: <URL>
creditcoin_explorer: <URL>
proof_api: <URL>
usc_sdk_version: <version>
usc_contracts_version: <version>
verifier_precompile: 0x0000000000000000000000000000000000000FD2
```

## Deployments

| Contract             | Chain   | Address     | Deployment transaction |
| -------------------- | ------- | ----------- | ---------------------- |
| MockUSDC             | Sepolia | `<address>` | `<tx>`                 |
| OrderGuaranteeEscrow | Sepolia | `<address>` | `<tx>`                 |
| TradeEvidenceUSC     | CC3     | `<address>` | `<tx>`                 |
| FacilityRegistry     | CC3     | `<address>` | `<tx>`                 |
| RiskGuard            | CC3     | `<address>` | `<tx>`                 |
| SandboxCapitalVault  | CC3     | `<address>` | `<tx>`                 |

## Happy path

```yaml
order_id: <bytes32>
order_value: 10000 test USD
buyer_guarantee: 2000 test USD
source_tx: <hash>
source_block: <height>
attested_height_observed: <height>
proof_request_id: <id>
creditcoin_verification_tx: <hash>
evidence_id: <bytes32>
agent_quote_hash: <hash>
quote_advance_bps: 3000
riskguard_result: APPROVED
facility_reservation: 3000 test USD
reservation_tx: <hash>
```

## Attack evidence

| Attack                | Transaction/test | Expected | Actual     | Explorer/log |
| --------------------- | ---------------- | -------- | ---------- | ------------ |
| Fake emitter          | `<id>`           | Reject   | `<result>` | `<link>`     |
| Failed receipt        | `<id>`           | Reject   | `<result>` | `<link>`     |
| Replay                | `<id>`           | Reject   | `<result>` | `<link>`     |
| Duplicate fingerprint | `<id>`           | Reject   | `<result>` | `<link>`     |
| Terms substitution    | `<id>`           | Reject   | `<result>` | `<link>`     |
| Unsafe 80% quote      | `<id>`           | Reject   | `<result>` | `<link>`     |
| Stale quote           | `<id>`           | Reject   | `<result>` | `<link>`     |
| Cancellation race     | `<id>`           | Reject   | `<result>` | `<link>`     |

## Latency benchmark

Record at least ten fresh runs.

| Run | Mine | Finality | Attestation wait | Proof generation | CC3 verification | End-to-end |
| --: | ---: | -------: | ---------------: | ---------------: | ---------------: | ---------: |
|   1 |      |          |                  |                  |                  |            |
|   2 |      |          |                  |                  |                  |            |
|   3 |      |          |                  |                  |                  |            |
|   4 |      |          |                  |                  |                  |            |
|   5 |      |          |                  |                  |                  |            |
|   6 |      |          |                  |                  |                  |            |
|   7 |      |          |                  |                  |                  |            |
|   8 |      |          |                  |                  |                  |            |
|   9 |      |          |                  |                  |                  |            |
|  10 |      |          |                  |                  |                  |            |
| p50 |      |          |                  |                  |                  |            |
| p95 |      |          |                  |                  |                  |            |

## Validation evidence

```yaml
supplier_interviews: <number>
buyer_or_aggregator_interviews: <number>
lender_or_scf_interviews: <number>
prototype_testers: <number>
written_design_partner_interest: <number>
redacted_real_workflow_reviewed: true|false
```

Store names and personal data privately. Publish only permissioned quotes or anonymized aggregates.
