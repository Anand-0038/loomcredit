import { spawn } from "node:child_process";
import { withoutPrivateRuntimeSecrets } from "./runtime-env.mjs";

const corepack = process.platform === "win32" ? "corepack.cmd" : "corepack";
const workspace = process.cwd();
const port = process.env.PORT?.trim();
const statusPort = process.env.EVIDENCE_API_PORT?.trim() || "8787";

if (!port || !/^\d+$/.test(port)) {
  console.error("CONFIG_INVALID: Render PORT must be a valid TCP port");
  process.exitCode = 1;
} else {
  const environment = {
    ...process.env,
    EVIDENCE_API_HOST: process.env.EVIDENCE_API_HOST?.trim() || "127.0.0.1",
    EVIDENCE_API_PORT: statusPort,
    LIVE_EVIDENCE_API_URL:
      process.env.LIVE_EVIDENCE_API_URL?.trim() ||
      `http://127.0.0.1:${statusPort}`,
    WORKER_DATABASE_PATH:
      process.env.WORKER_DATABASE_PATH?.trim() || "/var/data/worker.sqlite",
    AUTH_DATABASE_PATH:
      process.env.AUTH_DATABASE_PATH?.trim() || "/var/data/auth.sqlite",
  };
  const webEnvironment = withoutPrivateRuntimeSecrets(environment);
  const workerEnvironment = {
    ...environment,
    EVIDENCE_API_EMBEDDED: "true",
  };

  function withHeapLimit(childEnvironment, megabytes) {
    const existing = childEnvironment.NODE_OPTIONS?.trim();
    return {
      ...childEnvironment,
      NODE_OPTIONS: [existing, `--max-old-space-size=${megabytes}`]
        .filter(Boolean)
        .join(" "),
    };
  }

  const boundedWebEnvironment = withHeapLimit(webEnvironment, 256);
  const boundedWorkerEnvironment = withHeapLimit(workerEnvironment, 128);

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

  function start(label, args, childEnvironment = environment) {
    const child = spawn(corepack, args, {
      cwd: workspace,
      env: childEnvironment,
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

  console.log(
    JSON.stringify({
      boundary: "LOOMCREDIT_RENDER_RUNTIME",
      webPort: Number(port),
      evidenceApi: `http://127.0.0.1:${statusPort}`,
      workerDatabasePath: environment.WORKER_DATABASE_PATH,
      authDatabasePath: environment.AUTH_DATABASE_PATH,
      statusApiMode: "embedded-in-worker",
    }),
  );

  start(
    "source watcher",
    ["pnpm", "--filter", "@loomcredit/worker", "watch"],
    boundedWorkerEnvironment,
  );
  start(
    "web console",
    [
      "pnpm",
      "--filter",
      "@loomcredit/web",
      "exec",
      "next",
      "start",
      "--hostname",
      "0.0.0.0",
      "--port",
      port,
    ],
    boundedWebEnvironment,
  );
}
