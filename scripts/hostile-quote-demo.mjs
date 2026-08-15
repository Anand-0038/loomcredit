#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const submitScript = resolve(root, "scripts/submit-quote.mjs");
const usage =
  "Usage: node scripts/hostile-quote-demo.mjs <signed-quote.json> [order-mismatch | chain-mismatch | contract-mismatch | signature-rot | all] [--live-replay] [--chain-check]";

function normalizeHex32() {
  const bytes = randomBytes(32);
  return `0x${bytes.toString("hex")}`;
}

function normalizeAddress() {
  const bytes = randomBytes(20);
  return `0x${bytes.toString("hex")}`;
}

function writeScenarioPayload(payload, scenario) {
  const directory = mkdtempSync(join(tmpdir(), "loomcredit-hostile-"));
  const outputPath = join(directory, `signed-quote-${scenario}.json`);
  writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
  return { directory, outputPath };
}

function runSubmit(path, dryRun = true, chainCheck = false) {
  const result = spawnSync(
    process.execPath,
    [
      submitScript,
      path,
      ...(dryRun ? ["--dry-run"] : []),
      ...(chainCheck ? ["--chain-check"] : []),
    ],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  return result;
}

function scenarioMismatch(payload) {
  const scenario = structuredClone(payload);
  scenario.orderId = normalizeHex32();
  if (!scenario.signing?.riskGuardQuote) return scenario;
  scenario.signing.riskGuardQuote.orderId = normalizeHex32();
  return scenario;
}

function scenarioChain(payload) {
  const scenario = structuredClone(payload);
  if (typeof scenario.signing?.chainId === "number") {
    scenario.signing.chainId += 1;
    return scenario;
  }
  if (
    typeof scenario.signing?.chainId === "string" &&
    /^\d+$/.test(scenario.signing.chainId)
  ) {
    scenario.signing.chainId = Number(scenario.signing.chainId) + 1;
    return scenario;
  }
  return scenario;
}

function scenarioContract(payload) {
  const scenario = structuredClone(payload);
  if (scenario.signing) {
    scenario.signing.verifyingContract = normalizeAddress();
  }
  return scenario;
}

function scenarioSignature(payload) {
  const scenario = structuredClone(payload);
  if (scenario.signing) {
    scenario.signing.signature = `0x${"11".repeat(65)}`;
  }
  return scenario;
}

const liveReplayRequested = process.argv.includes("--live-replay");
const chainCheckRequested = process.argv.includes("--chain-check");
const positionalArgs = process.argv
  .slice(3)
  .filter((argument) => !argument.startsWith("--"));
const requestedScenario = positionalArgs[0] || "all";

function runScenario(name, makePayload) {
  const payload = readSignedQuote();
  if (!payload) {
    return;
  }
  const mutated = makePayload(payload);
  const { directory, outputPath } = writeScenarioPayload(mutated, name);
  try {
    const result = runSubmit(outputPath, true, chainCheckRequested);
    console.log(
      JSON.stringify(
        {
          scenario: name,
          status:
            result.status === 0 ? "UNEXPECTED_SUCCESS" : "EXPECTED_FAILURE",
          exitCode: result.status,
          stdout: result.stdout?.trim() || "",
          stderr: result.stderr?.trim() || "",
        },
        null,
        2,
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runReplay(signedPayload) {
  const { directory, outputPath } = writeScenarioPayload(
    signedPayload,
    "replay",
  );
  try {
    const first = runSubmit(
      outputPath,
      !liveReplayRequested,
      chainCheckRequested,
    );
    const second = runSubmit(
      outputPath,
      !liveReplayRequested,
      chainCheckRequested,
    );
    console.log(
      JSON.stringify(
        {
          scenario: "replay-dry-run",
          status: liveReplayRequested
            ? "LIVE_REPLAY_ATTEMPT"
            : "DRY_RUN_REPLAYS_IDENTICAL",
          attempts: [
            {
              pass: first.status === 0,
              exitCode: first.status,
              stderr: first.stderr?.trim(),
            },
            {
              pass: second.status === 0,
              exitCode: second.status,
              stderr: second.stderr?.trim(),
            },
          ],
          note: liveReplayRequested
            ? "Replay protection is enforced by RiskGuard nonce state during live submission."
            : "Replay is only enforced on-chain in submit; dry-run validates schema only.",
        },
        null,
        2,
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function readSignedQuote() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error(`USAGE_ERROR: missing signed quote path\n\n${usage}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(inputPath, "utf8"));
  } catch {
    console.error(`INPUT_INVALID: unable to parse ${inputPath}`);
    return null;
  }
}

function main() {
  const inputPath = process.argv[2];
  if (process.argv.includes("-h") || process.argv.includes("--help")) {
    console.log(usage);
    return;
  }
  if (!inputPath) {
    console.error(`USAGE_ERROR: missing signed quote path\n\n${usage}`);
    process.exitCode = 1;
    return;
  }

  const scenario = requestedScenario;
  const requested =
    scenario === "all"
      ? [
          "order-mismatch",
          "chain-mismatch",
          "contract-mismatch",
          "signature-rot",
        ]
      : [scenario];
  const handlers = {
    "order-mismatch": scenarioMismatch,
    "chain-mismatch": scenarioChain,
    "contract-mismatch": scenarioContract,
    "signature-rot": scenarioSignature,
    all: () => null,
  };

  const unknown = requested.find((name) => !handlers[name]);
  if (unknown) {
    console.error(`USAGE_ERROR: unknown scenario "${unknown}"\n\n${usage}`);
    process.exitCode = 1;
    return;
  }
  const extraPositional = positionalArgs.slice(1);
  if (extraPositional.length > 0) {
    console.error(
      `USAGE_ERROR: too many positional args \"${extraPositional.join(", ")}\".\n\n${usage}`,
    );
    process.exitCode = 1;
    return;
  }

  const payload = readSignedQuote();
  if (!payload) {
    process.exitCode = 1;
    return;
  }

  if (requested[0] === "all") {
    runScenario("order-mismatch", scenarioMismatch);
    runScenario("chain-mismatch", scenarioChain);
    runScenario("contract-mismatch", scenarioContract);
    runScenario("signature-rot", scenarioSignature);
    runReplay(payload);
  } else {
    const handler = handlers[requested[0]];
    runScenario(requested[0], handler);
  }
}

main();
