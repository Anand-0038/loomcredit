# Security policy

LoomCredit is a testnet prototype and must not be used with real customer
funds, production lending decisions, or unreviewed production credentials.

## Safe testing boundary

- Use disposable testnet accounts and test data only.
- Never publish private keys, API credentials, signed payloads, customer data,
  or unredacted provider responses.
- Do not probe third-party RPC, proof-builder, or Creditcoin infrastructure
  outside its documented testnet use and applicable program rules.
- The local demo and fixture API do not authorize capital or represent a live
  transaction.

## Reporting a vulnerability

Do not open a public issue containing an exploitable detail or secret. Use the
repository host's private vulnerability-reporting mechanism when it is enabled,
or contact the project maintainer through a private channel before disclosure.
Include the affected boundary, a minimal reproduction, impact, and the
environment used. Redact credentials and customer data.

The repository does not promise a bounty, response time, production support, or
security warranty. The public threat model and security page describe the
current prototype scope and known limitations. Authentication nonces are
single-use, short-lived, and pruned when new sign-in requests arrive; deployed
multi-instance environments still require a shared database and distributed
rate limiter.
