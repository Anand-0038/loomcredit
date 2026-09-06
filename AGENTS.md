# LoomCredit repository guidance

## Documentation boundaries

Keep public documentation focused on the product and its integration contract:

- README, architecture, API, worker, CLI, security, threat model, deployment,
  whitepaper, evidence, and demo-runbook material may be published.
- Founder strategy, customer lists, pricing experiments, outreach drafts,
  submission operations, judge notes, and pre-mortems belong under the ignored
  `private/founder/` directory and must not be added to GitHub, the website,
  `llms.txt`, demo bundles, or public issues.
- Agent-readable content must describe verified product facts and safe API
  boundaries. It must not expose private strategy, credentials, customer data,
  or unsupported claims.

## Truth boundaries

- `LIVE_VERIFIED` means a recorded source event has a successful native
  Creditcoin verification and independent registry read-back.
- `LOCAL_FIXTURE_ONLY` means deterministic demonstration data with no live
  transaction.
- A model proposal is not a lending decision. RiskGuard and the configured
  signer/policy boundary control any action.
- Never claim production lending, custody, repayment performance, partnership,
  funding, or public deployment without current evidence.

## Verification

After changes, run the relevant checks and report exact results:

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
corepack pnpm submit-quote:test
python scripts/browser-smoke.py
```

Preserve unrelated worktree changes. Do not commit, push, publish, send
outreach, or use credentials without explicit authorization.
