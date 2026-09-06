# Contributing to LoomCredit

LoomCredit is a testnet-oriented prototype. Contributions should improve the
verified evidence path, the bounded underwriting boundary, developer
experience, or the clarity of the public product documentation.

## Before opening a change

```bash
corepack pnpm install
corepack pnpm format:check
corepack pnpm typecheck
corepack pnpm test
corepack pnpm lint
corepack pnpm build
corepack pnpm test:contracts
corepack pnpm secret-scan
corepack pnpm secret-scan:test
```

Run the browser smoke test when changing the web app:

```bash
python scripts/browser-smoke.py
```

Foundry, Node.js 22+, Corepack, pnpm, and a Chromium-capable Playwright
installation are required for the complete local gate.

## Change boundaries

- Keep `LIVE_VERIFIED`, `LOCAL_FIXTURE_ONLY`, and production claims distinct.
- Do not add private keys, API credentials, customer data, or provider output
  containing sensitive information.
- Do not turn a local fixture into a live receipt or call a blockchain from the
  browser demo.
- Keep founder strategy, pricing experiments, outreach drafts, judge notes,
  and submission operations under the ignored `private/founder/` directory.
- Update the relevant public documentation when commands, schemas, APIs, or
  truth boundaries change.

Prefer focused changes with a regression test. External deployments,
transactions, public releases, and outreach require explicit human approval.
