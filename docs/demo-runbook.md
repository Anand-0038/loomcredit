# LoomCredit judge demo runbook

This is the shortest truthful path for the current checkout. A deliberate
judge walkthrough takes about two minutes and keeps recorded testnet evidence
separate from the local policy fixture.

## Product path before the judge walkthrough

For a user-facing product tour, open `/review` first. The primary panel is
**Real source intake**: it accepts an operator-submitted source transaction and
runs the worker's live verification path when the embedded worker is
configured. The recorded case appears below it as a read-only proof reference
for understanding the completed chain. An unknown reference must remain
`EVIDENCE_NOT_FOUND`; do not replace it with the local fixture.

The `/demo` route is a policy test surface, not the main lending workflow. It is
useful after the case review because it shows how a safe, unsafe, cancelled, and
operator-shaped proposal are handled by deterministic controls.

The live intake action is deliberately explicit. It may submit a USC
verification transaction on CC3 testnet, but it does not create a loan, invoke a
model, sign a quote, reserve capital, or move funds. The next model and
RiskGuard gates remain separate.

## 0:00 — State the wedge

Open the homepage and say:

> LoomCredit verifies a buyer-backed trade event before an AI proposal can
> reach deterministic policy. The model proposes; RiskGuard decides.

Open the **Recorded testnet artifact** card. Point out that the source receipt,
CC3 verification receipt, evidence ID, and `QuoteApproved`
RiskGuard receipt are linked to explorer pages. Explain that the resulting
`SANDBOX_RESERVED` is the product label for the raw `RESERVED` state. It is
accounting-only testnet state and `NO_CAPITAL_MOVED`; it is not a loan.

## 0:20 — Show the proof boundary

Open the linked proof console. Walk the judge through:

1. Sepolia `OrderGuaranteed` receipt;
2. Attestcoin/USC proof retrieval boundary;
3. native CC3 verification and registry read-back; and
4. the recorded signed RiskGuard approval, whose receipt is linked separately
   and whose deployed bytecode exposes `QuoteApproved` but not
   the newer `QuoteDecisionAudited` event.

Do not call the proof-builder response a Creditcoin verification. The CC3
receipt and emitted evidence ID are the verification boundary.

## 0:45 — Show the failure boundary

Open `/demo` and keep the `LOCAL_FIXTURE` label visible.

- Run **Safe proposal** and show the policy checks passing.
- Run **Unsafe proposal** and show the 80% request rejected against the 40%
  cap.
- Run **Cancelled order** and show the lifecycle check rejecting the action.

Say explicitly:

> These scenarios are deterministic local policy tests. They do not call a
> model, submit a transaction, or turn fixture data into live evidence.

## 1:15 — Close with the limitation

Close with:

> The verified testnet path is real. The model-to-RiskGuard transaction is
> recorded as a bounded accounting-only approval. The deployed bytecode still
> lacks the extended decision-term audit event, and this is not a real loan.

The remaining proof upgrade is a live 80% rejection receipt tied to the same
evidence ID. Do not edit the current evidence bundle by hand to imply that
result. Regenerate the bundle from the worker row and attach the CLI output so
the AI state is recorded mechanically:

```bash
corepack pnpm evidence:manifest --agent-quote /tmp/loomcredit-signed-quote.json
corepack pnpm submit:quote /tmp/loomcredit-signed-quote.json --dry-run
```

The manifest records only a reduced quote/signing summary; the submit dry-run
performs the cryptographic payload checks and still performs no mutation.

## Record a local take

The repository includes a local Playwright recorder for the flow above. It
opens the recorded testnet proof, then runs the safe, unsafe, and cancelled
policy fixtures. The browser also supports a custom local proposal after case
review. It records the actual UI labels and waits for each result; it
does not call a model, submit a transaction, upload a video, or publish a URL.

With the web app running locally:

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
corepack pnpm demo:record
```

The recorder creates a timestamped `.webm` file under `/tmp`. Set
`DEMO_RECORDING_DIR` to choose another local directory, or set
`PLAYWRIGHT_EXECUTABLE_PATH` when using a system browser. Each scene is held for
five seconds by default so there is room for narration; set
`DEMO_SCENE_SECONDS` to adjust the pace. Review the recording
and add any external video link only through the submission process; the
repository intentionally does not contain personal go-to-market or submission
strategy notes.
