# LoomCredit product design brief

## Product and audience

LoomCredit is an operator workspace for lenders and marketplace finance teams. It turns a buyer-backed source order into a reviewable financing case: verified source evidence is registered on Creditcoin, an AI model proposes bounded terms, and RiskGuard decides whether the request can advance to an action gate.

The primary user is a risk or operations person who needs to answer three questions quickly:

1. Is this order real and independently verifiable?
2. What financing terms were requested, and what does the model propose?
3. What did deterministic policy allow, reject, or send to human review?

## Primary screen job

The case page is the operational center. It should make the next safe action obvious without requiring the operator to understand wallet mechanics, chain IDs, or contract internals. Business facts and state come first; cryptographic receipts, hashes, and raw payloads remain available through progressive disclosure.

## Emotional tone

- Tone: calm, accountable, precise, and quietly confident.
- Adjectives: evidence-led, legible, trustworthy, controlled, useful.
- Anti-adjectives: speculative, casino-like, noisy, futuristic, salesy, opaque.

## Materials and motifs

Use the existing paper, cloud, ink, teal, and gold palette as a restrained operations ledger. Thin rules, numbered stages, receipt links, and compact status pills communicate auditability. Use hard edges and modest shadows for structure, not decoration. Avoid crypto-market charts, token-price language, glowing gradients, and ornamental motion.

## Signature interaction

The signature interaction is the proof rail: Ethereum source event → Attestcoin / USC proof → Creditcoin verification → registered evidence → AI proposal → RiskGuard decision. Each step has a human-readable status and a direct receipt or case link where one exists.

The product boundary must remain visible: AI proposes; deterministic RiskGuard decides; a wallet connection never grants custody or silently authorizes a transaction.

## Visual system

- Color roles: ink for primary structure, teal for verified/available states, gold for attention and the next safe gate, red only for rejection or a blocking error, paper/cloud for surfaces.
- Typography roles: large editorial heading for the product promise; compact semibold labels for operational facts; monospaced text only for hashes, codes, and raw protocol values.
- Spacing: preserve the existing generous section rhythm and compact case-card rhythm. Keep related values grouped and separate operator-entered terms from verified source facts.
- Radius and depth: use the existing restrained card radii and low shadows; hierarchy should come from layout and contrast before effects.

## Composition and responsive behavior

Desktop should lead with the operator action and the evidence summary, then provide the technical inspection path. The case view should keep order value, guarantee, requested advance, recommendation, policy ceiling, evidence state, decision, and lifecycle visible before identifiers.

On tablet, collapse multi-column summaries into readable two-column groups. On mobile, stack the proof path in source order, keep primary actions full-width, preserve receipt links, and avoid horizontal scrolling. Long addresses and error messages must wrap or be progressively disclosed.

Honor `prefers-reduced-motion`. Motion is limited to state transitions that help the operator understand progress; never animate a result into existence.

## References and principles

- Root design contract: `../../DESIGN.md`.
- Product workflow and boundaries: `docs/customer-workflow.md`, `docs/ai-underwriting-boundary.md`, and `docs/Threat_Model_and_Test_Plan.md`.
- Accessibility baseline: semantic controls, visible keyboard focus, skip navigation, live regions for asynchronous status, readable contrast, and labels tied to every input.

## Rejected patterns

- A separate judge-only application or presentation flow.
- Decorative AI panels that do not produce a real, validated proposal.
- Treating recorded testnet evidence as a live lending product.
- Hiding the requested terms or policy ceiling behind technical details.
- Calling a missing provider, missing evidence, or unavailable transaction a success.
