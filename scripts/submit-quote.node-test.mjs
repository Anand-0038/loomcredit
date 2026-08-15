import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Wallet, keccak256, toUtf8Bytes } from "ethers";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const submitScript = resolve(root, "scripts/submit-quote.mjs");
const evidence = JSON.parse(
  readFileSync(resolve(root, "docs/demo-evidence.json"), "utf8"),
);
const deployment = JSON.parse(
  readFileSync(
    resolve(root, "docs/deployments/creditcoin-deployment.json"),
    "utf8",
  ),
);
const chainId = Number(process.env.CREDITCOIN_CHAIN_ID || 102031);
const canSpawnNode = (() => {
  const probe = spawnSync(process.execPath, ["--version"], {
    encoding: "utf8",
  });
  return !probe.error;
})();

function runSubmit(args) {
  return spawnSync(process.execPath, [submitScript, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env },
  });
}

function runSubmitWithEnv(args, env = {}) {
  return spawnSync(process.execPath, [submitScript, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  });
}

function writeTempJson(object) {
  const directory = mkdtempSync(join(tmpdir(), "loomcredit-submit-"));
  const path = join(
    directory,
    `payload-${Math.random().toString(16).slice(2)}.json`,
  );
  writeFileSync(path, JSON.stringify(object), "utf8");
  return { directory, path };
}

if (!canSpawnNode) {
  test("submit-quote.mjs subprocess tests are skipped in spawn-restricted environments", () => {
    assert.ok(true);
  });
} else {
  test("submit quote help is successful and mutation-free", () => {
    const result = runSubmit(["--help"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /--dry-run/);
    assert.match(result.stdout, /--chain-check/);
    assert.equal(result.stderr, "");
  });

  test("payload chain mismatch fails before chain-check RPC", () => {
    const { directory, path } = writeTempJson({
      proofStatus: "LIVE_VERIFIED",
      orderId: evidence.source.orderId,
      evidenceId: evidence.creditcoin.evidenceId,
      signing: {
        status: "SIGNED",
        signer: "0x" + "22".repeat(20),
        signature: `0x${"11".repeat(65)}`,
        chainId,
        verifyingContract: deployment.contracts.RiskGuard.address,
        riskGuardQuote: {
          orderId: evidence.source.orderId,
          decision: keccak256(toUtf8Bytes("APPROVE")),
          advanceBps: 2_000,
          feeBps: 100,
          expiresAt: String(Math.floor(Date.now() / 1_000) + 600),
          evidenceId: evidence.creditcoin.evidenceId,
          reasonCodesHash: keccak256(toUtf8Bytes("BUYER_GUARANTEE_VERIFIED")),
          policyVersion: keccak256(toUtf8Bytes("2026-08-demo-v1")),
          modelVersion: keccak256(toUtf8Bytes("structured-agent-v1")),
          nonce: "0",
        },
      },
    });
    try {
      const manifest = { chainId: 111_111, contracts: {} };
      const manifestPath = join(directory, "bad-chain-manifest.json");
      writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
      const result = runSubmitWithEnv([path, "--dry-run"], {
        CREDITCOIN_DEPLOYMENT_MANIFEST: manifestPath,
      });
      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        /CREDITCOIN_CHAIN_ID .* does not match deployment manifest chain 111111/,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("configured chain-id mismatch with manifest fails before signing validation", () => {
    const { directory, path } = writeTempJson({
      proofStatus: "LIVE_VERIFIED",
      orderId: evidence.source.orderId,
      evidenceId: evidence.creditcoin.evidenceId,
      signing: {
        status: "SIGNED",
        signer: "0x" + "22".repeat(20),
        signature: `0x${"11".repeat(65)}`,
        chainId,
        verifyingContract: deployment.contracts.RiskGuard.address,
        riskGuardQuote: {
          orderId: evidence.source.orderId,
          decision: keccak256(toUtf8Bytes("APPROVE")),
          advanceBps: 2_000,
          feeBps: 100,
          expiresAt: String(Math.floor(Date.now() / 1_000) + 600),
          evidenceId: evidence.creditcoin.evidenceId,
          reasonCodesHash: keccak256(toUtf8Bytes("BUYER_GUARANTEE_VERIFIED")),
          policyVersion: keccak256(toUtf8Bytes("2026-08-demo-v1")),
          modelVersion: keccak256(toUtf8Bytes("structured-agent-v1")),
          nonce: "0",
        },
      },
    });
    try {
      const manifest = {
        chainId: chainId,
        contracts: {
          RiskGuard: { address: deployment.contracts.RiskGuard.address },
        },
      };
      const manifestPath = join(directory, "matching-manifest.json");
      writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
      const result = runSubmitWithEnv([path, "--dry-run"], {
        CREDITCOIN_DEPLOYMENT_MANIFEST: manifestPath,
        CREDITCOIN_CHAIN_ID: `${chainId + 1}`,
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /does not match deployment manifest chain/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("dry-run validates a signed live payload without an RPC provider", async () => {
    const wallet = Wallet.createRandom();
    const orderId = evidence.source.orderId;
    const evidenceId = evidence.creditcoin.evidenceId;
    const verifyingContract = deployment.contracts.RiskGuard.address;
    const quote = {
      orderId,
      decision: keccak256(toUtf8Bytes("APPROVE")),
      advanceBps: 2_000,
      feeBps: 100,
      expiresAt: String(Math.floor(Date.now() / 1_000) + 600),
      evidenceId,
      reasonCodesHash: keccak256(toUtf8Bytes("BUYER_GUARANTEE_VERIFIED")),
      policyVersion: keccak256(toUtf8Bytes("2026-08-demo-v1")),
      modelVersion: keccak256(toUtf8Bytes("structured-agent-v1")),
      nonce: "0",
    };
    const signature = await wallet.signTypedData(
      {
        name: "LoomCredit RiskGuard",
        version: "1",
        chainId,
        verifyingContract,
      },
      {
        FacilityQuote: [
          { name: "orderId", type: "bytes32" },
          { name: "decision", type: "bytes32" },
          { name: "advanceBps", type: "uint16" },
          { name: "feeBps", type: "uint16" },
          { name: "expiresAt", type: "uint64" },
          { name: "evidenceId", type: "bytes32" },
          { name: "reasonCodesHash", type: "bytes32" },
          { name: "policyVersion", type: "bytes32" },
          { name: "modelVersion", type: "bytes32" },
          { name: "nonce", type: "uint64" },
        ],
      },
      quote,
    );
    const directory = mkdtempSync(join(tmpdir(), "loomcredit-submit-"));
    try {
      const payloadPath = join(directory, "signed-quote.json");
      writeFileSync(
        payloadPath,
        JSON.stringify({
          proofStatus: "LIVE_VERIFIED",
          orderId,
          evidenceId,
          signing: {
            status: "SIGNED",
            signer: wallet.address,
            signature,
            chainId,
            verifyingContract,
            riskGuardQuote: quote,
          },
        }),
      );
      const result = runSubmit([payloadPath, "--dry-run"]);
      assert.equal(result.status, 0, result.stderr);
      const output = JSON.parse(result.stdout);
      assert.deepEqual(
        {
          boundary: output.boundary,
          status: output.status,
          mutation: output.mutation,
          signer: output.signer,
          riskGuard: output.riskGuard,
          evidenceId: output.evidenceId,
        },
        {
          boundary: "RISKGUARD_SUBMISSION_DRY_RUN",
          status: "VALIDATED",
          mutation: "NONE",
          signer: wallet.address,
          riskGuard: verifyingContract,
          evidenceId,
        },
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("non-live payloads fail before signing validation or provider access", () => {
    const directory = mkdtempSync(join(tmpdir(), "loomcredit-submit-"));
    try {
      const payloadPath = join(directory, "fixture.json");
      writeFileSync(
        payloadPath,
        JSON.stringify({ proofStatus: "LOCAL_FIXTURE" }),
      );
      const result = runSubmit([payloadPath, "--dry-run"]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /only LIVE_VERIFIED evidence/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
