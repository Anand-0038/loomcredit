# LoomCredit live demo evidence

Generated from the persisted worker row and independent CC3 state reads on 2026-08-15T10:51:40.336Z.

This is a **testnet evidence bundle**, not proof of production lending, physical delivery, repayment capacity, or custody. It was generated before the current lifecycle, identity, fee, and quote-expiry hardening in the working tree; the deployed addresses below must be redeployed and re-read before the corrected source can be described as live.

## Cross-chain result

| Boundary          | Result                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Source            | [Sepolia OrderGuaranteed transaction](https://sepolia.etherscan.io/tx/0x61462a792651b360e7247becafbd33b446d3fea1a3680c589adbe6625be5e70d)       |
| Attestation/proof | Worker retrieved the proof for source block 11443299, transaction 106, receipt log 1                                                            |
| Creditcoin        | [CC3 verification transaction](https://creditcoin-testnet.blockscout.com/tx/0x1beddb24fc145fbb00b0d477fa008f0507d8fa8cd6c7775dd5c685f6487b81b9) |
| Evidence ID       | `0xfed7def6e6d23052735cd35d968d9bca6895077d3a223e418a7c1530575320d9`                                                                            |
| Facility state    | `SANDBOX_RESERVED` (raw contract state: `RESERVED`; `NO_CAPITAL_MOVED`)                                                                         |
| Worker stage      | `VERIFIED`                                                                                                                                      |

## Public deployment addresses

- TradeEvidenceUSC: [0x1eb7Bc536aFd2cc28602d289A6F47DbDC3b9445f](https://creditcoin-testnet.blockscout.com/address/0x1eb7Bc536aFd2cc28602d289A6F47DbDC3b9445f)
- FacilityRegistry: [0x8aC72a4B26e973FCdD7dAadd960Ae0eC635b4197](https://creditcoin-testnet.blockscout.com/address/0x8aC72a4B26e973FCdD7dAadd960Ae0eC635b4197)
- RiskGuard: [0xE876276d6Ed8160e9a075FA5B651D494046078dD](https://creditcoin-testnet.blockscout.com/address/0xE876276d6Ed8160e9a075FA5B651D494046078dD)
- SandboxCapitalVault: [0x83a8EdF32C44732D5f19af2582845Ea941Ba3854](https://creditcoin-testnet.blockscout.com/address/0x83a8EdF32C44732D5f19af2582845Ea941Ba3854)

## Recorded order

- Order ID: `0x2a3f897f0f2a4daae050a72cac472a0afbb20d041f69d83de72ff0ba825043f1`
- Order value: 10000000000 minor units
- Buyer guarantee: 2000000000 minor units
- Source escrow: `0xc8c0C33761C89979e7a090D8B9361Ce6C6930cE4`
- Source chain key: `1`
- Receipt-local log index used by USC: `1`
- Block-wide explorer log index: `786`

## Worker timings

| Stage                   | Timestamp                |
| ----------------------- | ------------------------ |
| DETECTED                | 2026-08-08T07:22:27.865Z |
| WAITING_FOR_ATTESTATION | 2026-08-08T07:24:58.295Z |
| PROOF_REQUESTED         | 2026-08-08T07:25:04.136Z |
| PROOF_READY             | 2026-08-08T07:25:04.993Z |
| FAILED_RETRYABLE        | 2026-08-08T07:24:48.291Z |
| CREDITCOIN_SUBMITTED    | 2026-08-08T07:25:20.306Z |
| VERIFIED                | 2026-08-08T07:25:20.310Z |

| Measurement                                         |  Duration |
| --------------------------------------------------- | --------: |
| Attestation wait boundary                           |   5841 ms |
| Proof generation                                    |    857 ms |
| CC3 submission and mining                           |  15313 ms |
| Final attempt from attestation wait to verification |  22015 ms |
| Total observed worker run                           | 172445 ms |

The worker retried 5 time(s) before the final verified state; failed submissions are retained in its audit timestamps.

## AI boundary

A signed model quote was submitted to RiskGuard and the receipt was verified against the same live order, evidence ID, signer, target, and quote hash. The deployed bytecode emitted QuoteApproved but not the newer QuoteDecisionAudited event.

Generated at Git commit `1c5f9628e36ce6eec98d166c937edd2db7158c1e`. This historical commit is the source of the recorded receipts; it is not a release identifier for the current dirty checkout.
