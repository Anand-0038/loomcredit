import { spawn } from "node:child_process";

const corepack = process.platform === "win32" ? "corepack.cmd" : "corepack";
const workspace = process.cwd();
const environment = { ...process.env };

// The web app reads .env.local, while the worker status process intentionally
// needs only a database path. Keep local development pointed at this checkout
// unless the operator explicitly supplies another path.
if (!environment.WORKER_DATABASE_PATH?.trim()) {
  environment.WORKER_DATABASE_PATH = "./worker/data/worker.db";
}

const children = [];
let shuttingDown = false;

function stop(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(exitCode), 2_000).unref();
}

function start(label, args) {
  const child = spawn(corepack, args, {
    cwd: workspace,
    env: environment,
    stdio: "inherit",
  });
  children.push(child);
  child.once("error", (error) => {
    console.error(`[loomcredit] ${label} failed to start: ${error.message}`);
    stop(1);
  });
  child.once("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(
      `[loomcredit] ${label} stopped (${signal ?? `exit ${code ?? 1}`})`,
    );
    stop(code ?? 1);
  });
}

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));

console.log("[loomcredit] worker status: http://127.0.0.1:8787");
console.log("[loomcredit] web console: http://127.0.0.1:3000");

start("worker status", ["pnpm", "--filter", "@loomcredit/worker", "status"]);
start("web console", [
  "pnpm",
  "--filter",
  "@loomcredit/web",
  "exec",
  "next",
  "dev",
  "--hostname",
  "127.0.0.1",
]);
