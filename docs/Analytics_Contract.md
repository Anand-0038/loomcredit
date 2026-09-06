# LoomCredit analytics contract

Status: implemented locally, disabled by default, and not a claim that a
PostHog project is receiving traffic.

## Why this exists

LoomCredit needs a small amount of product evidence beyond code and screenshots:
which surface a visitor reached, whether the deterministic demo was exercised,
whether the read-only evidence feed was available, and where the optional wallet
flow stopped. This is product feedback, not underwriting data and not a source
of truth for blockchain state.

The current PostHog project has no LoomCredit events yet. The browser layer is
ready for a controlled opt-in deployment, but ingestion still requires the
operator to configure a public project token and host, deploy the web build, and
have a visitor accept the analytics banner.

## Enablement and privacy boundary

Analytics is enabled only when all of these are true:

1. `NEXT_PUBLIC_ANALYTICS_ENABLED=true` (or `1`) is configured by the operator.
2. `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` is present.
3. A visitor explicitly selects **Allow analytics** in the optional banner.

The current integration deliberately uses:

- custom events only; automatic pageviews and autocapture are disabled;
- no session recording, person profiles, console capture, or performance capture;
- in-memory PostHog persistence with browser persistence disabled;
- `ip: false` and a `before_send` allow-list that strips every property except
  the bounded event fields below;
- no `identify`, `group`, wallet address, order ID, evidence ID, transaction
  hash, raw quote, raw prompt, provider payload, or URL/query-string property.

The consent choice is stored as the first-party local-storage key
`loomcredit_analytics_consent`; the PostHog SDK itself is not allowed to create
cookies or persistent browser state. Before enabling this in a public market,
the operator must complete the legal, vendor, retention, transfer, and consent
review described by the privacy and cookie pages.

## Event dictionary

| Event                                  | Properties                       | Product question                                                                            |
| -------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------- |
| `loomcredit_page_viewed`               | `surface`                        | Which bounded product surface is being reached?                                             |
| `loomcredit_demo_scenario_run`         | `mode`, `outcome`, `boundary`    | Do visitors exercise the safe path, custom proposal path, and visible rejection path?       |
| `loomcredit_feed_status_viewed`        | `status`                         | Is the read-only evidence feed connected, empty, unavailable, or unconfigured?              |
| `loomcredit_feed_refreshed`            | `status`                         | Are visitors retrying a feed that is not ready?                                             |
| `loomcredit_wallet_flow`               | `stage`, `outcome`               | Does wallet connection or sign-in create observable friction without collecting an address? |
| `loomcredit_analytics_consent_granted` | `source` (`banner` or `privacy`) | Was optional analytics accepted through the banner or privacy controls?                     |

Allowed values are source-controlled enums. If a future event needs an ID,
financial value, raw model content, or a new personal-data category, it must be
reviewed as a separate privacy and product decision rather than appended to this
contract.

## Useful analyses after the first real events

Create these in PostHog only after the event names and properties have been
verified in the target project:

1. **Demo engagement** — unique visitors with
   `loomcredit_demo_scenario_run` divided by visitors with
   `loomcredit_page_viewed` where `surface = demo`.
2. **Safety-path mix** — scenario runs broken down by `mode` and `outcome`.
   A healthy prototype should make the safe pass and unsafe/cancelled stops
   both visible; this is not a business approval-rate metric.
3. **Evidence-feed readiness** — `loomcredit_feed_status_viewed` by `status`
   and day. This identifies deployment/configuration friction without claiming
   that a record exists on-chain.
4. **Wallet friction** — `loomcredit_wallet_flow` by `stage` and `outcome`.
   This should remain a UX diagnostic, never an authorization or identity
   record.

Do not infer users, lending demand, repayment performance, underwriting quality,
or public-chain settlement from these events. Those claims require separate,
authoritative evidence.
