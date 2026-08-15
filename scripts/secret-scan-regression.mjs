import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scanner = join(process.cwd(), "scripts", "secret-scan.mjs");
const fixtureRoot = mkdtempSync(join(tmpdir(), "loomcredit-secret-scan-"));

function runScan() {
  return execFileSync(process.execPath, [scanner], {
    cwd: process.cwd(),
    env: { ...process.env, SECRET_SCAN_ROOT: fixtureRoot },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function git(...args) {
  return execFileSync(
    "git",
    [
      "-c",
      "user.name=secret-scan-test",
      "-c",
      "user.email=secret-scan-test@example.invalid",
      ...args,
    ],
    { cwd: fixtureRoot, encoding: "utf8" },
  );
}

git("init", "--quiet");
writeFileSync(join(fixtureRoot, "safe.env"), "MODEL_API_KEY=\n");
git("add", "safe.env");
git("commit", "--quiet", "-m", "safe fixture");
runScan();

const hexFixture = "a".repeat(64);
writeFileSync(
  join(fixtureRoot, "leaked.env"),
  `CREDITCOIN_PRIVATE_KEY=0x${hexFixture}\n`,
);
git("add", "leaked.env");
git("commit", "--quiet", "-m", "leaked fixture");

try {
  runScan();
  throw new Error("secret-scan regression: matching fixture returned zero");
} catch (error) {
  if (error?.status !== 1) throw error;
  if (error.stderr.includes(hexFixture)) {
    throw new Error("secret-scan regression: scanner printed secret contents");
  }
}

git("rm", "--quiet", "leaked.env");
git("commit", "--quiet", "-m", "remove leaked fixture");
try {
  runScan();
  throw new Error("secret-scan regression: historical fixture returned zero");
} catch (error) {
  if (error?.status !== 1) throw error;
  if (error.stderr.includes(hexFixture)) {
    throw new Error(
      "secret-scan regression: history scan printed secret contents",
    );
  }
}

console.log("secret-scan regression: pass");
