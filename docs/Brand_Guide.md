# LoomCredit Brand Guide

## Brand idea

LoomCredit connects separate threads—buyer commitment, cryptographic proof, underwriting policy, and supplier capital—into one inspectable workflow. The primary roundel uses a dark Harbor Ink field and an interwoven infinity thread, echoing the supplied `L∞omCredit` reference without looking like a generic finance badge.

## Positioning

**Name:** LoomCredit  
**Tagline:** Verified trade events. Bounded AI. Testnet underwriting controls.
**Descriptor:** Attested trade-credit infrastructure  
**Personality:** precise, calm, credible, modern, non-speculative

## Color palette

| Name             | Hex       | Use                                  |
| ---------------- | --------- | ------------------------------------ |
| Harbor Ink       | `#123447` | Primary backgrounds, headings        |
| Attestation Teal | `#19C6B3` | Primary action, verified status      |
| Capital Gold     | `#F4B860` | Economic highlight, guarantee/amount |
| Slate            | `#5D6B78` | Secondary text                       |
| Cloud            | `#F4F7F8` | Light background                     |
| White            | `#FFFFFF` | Cards and reverse text               |
| Risk Red         | `#D95C5C` | Rejected/unsafe state only           |
| Pending Blue     | `#4E7DD9` | In-progress state                    |

Do not use a rainbow Web3 palette or neon gradients.

## Typography

Recommended open/system-safe stack:

- Headlines: **Clear Sans Bold** or **Cabin SemiBold**
- Body: **Clear Sans** or **Carlito**
- Data/addresses: **DejaVu Sans Mono**

Web fallback:

```css
font-family:
  Inter,
  "Clear Sans",
  system-ui,
  -apple-system,
  sans-serif;
```

## Logo files

- `loomcredit-logo.png` - primary circular `L∞omCredit` lockup supplied by the founder, with a transparent background and Harbor Ink recolor
- `loomcredit-mark.svg` - compact circular fallback mark for small surfaces
- `loomcredit-wordmark.svg` - horizontal vector lockup
- `favicon.svg` - compact browser mark
- `loomcredit-og.svg` / `loomcredit-og.png` - 1200x630 social card source/export
- `loomcredit-x-banner.svg` / `loomcredit-x-banner.png` - 1500x500 header source/export

The social cards use the current circular mark and explicitly say **testnet
prototype**. They must not say “production capital,” “live lending,” or imply
custody, repayment performance, or a public deployment.

## Clear space

Keep clear space equal to the width of one teal strand around the mark. Do not place the logo directly over complex screenshots.

## Status language

Use consistent words:

| Status                      | Label    |
| --------------------------- | -------- |
| Source transaction observed | Detected |
| Finalized state recorded    | Attested |
| Proof accepted              | Verified |
| Agent output created        | Quoted   |
| Policy passed               | Approved |
| Test liquidity locked       | Reserved |
| Policy failure              | Rejected |
| Commercial challenge        | Disputed |

Avoid “confirmed” when you specifically mean attested or verified.

## UI principles

1. Lead with order, guarantee, advance, and state—not wallet address.
2. Keep proof details one click away.
3. Every green “Verified” label must link to evidence.
4. Display AI reasons beside deterministic policy checks.
5. Show failed attacks as first-class evidence, not hidden test logs.
6. Mark all test amounts as sandbox/testnet.

## Illustration style

Use geometric lines, ledger cards, proof chains, and woven connections. Avoid coins flying through space, robot heads, generic handshakes, and photorealistic bankers.

## Voice examples

**Good:** “The local policy lab shows that an 80% quote violates the 40% policy cap and is rejected.”

**Bad:** “Our revolutionary AI unlocks instant trustless capital for everyone.”

## Mandatory disclaimer

> Testnet prototype. LoomCredit does not originate real loans or provide financial advice.
