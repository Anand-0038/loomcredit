import {
  ConfigError,
  defaultWorkerDatabasePath,
  loadConfig,
  publicConfig,
} from "./config.js";
import { processTransaction } from "./processor.js";
import { loadStatusServerOptions, startStatusServer } from "./status-server.js";
import { EventStore } from "./store.js";
import { SourceEventWatcher } from "./watcher.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function checkConfig(): Promise<number> {
  try {
    console.log(JSON.stringify(publicConfig(loadConfig()), null, 2));
    return 0;
  } catch (error) {
    console.error(`CONFIG_INVALID: ${errorMessage(error)}`);
    return 1;
  }
}

async function processTransactionCommand(
  sourceTxHash: string,
): Promise<number> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(`CONFIG_INVALID: ${errorMessage(error)}`);
    return 1;
  }

  const store = new EventStore(config.workerDatabasePath);
  try {
    return await processTransaction(sourceTxHash, config, store);
  } finally {
    store.close();
  }
}

async function watchSource(once: boolean): Promise<number> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(`CONFIG_INVALID: ${errorMessage(error)}`);
    return 1;
  }

  const store = new EventStore(config.workerDatabasePath);
  if (config.workerStartBlock === null) {
    store.close();
    console.error("CONFIG_INVALID: WORKER_START_BLOCK is required for watch");
    return 1;
  }
  const watcher = new SourceEventWatcher(config, store);
  let statusServer: Awaited<ReturnType<typeof startStatusServer>> | undefined;
  try {
    if (process.env.EVIDENCE_API_EMBEDDED === "true") {
      statusServer = await startStatusServer(store, loadStatusServerOptions());
      console.log(
        JSON.stringify({
          boundary: "LIVE_EVIDENCE_STATUS_API",
          status: "listening",
          address: statusServer.address(),
          embedded: true,
        }),
      );
    }
    if (once) {
      console.log(JSON.stringify(await watcher.scanOnce(), null, 2));
      return 0;
    }
    await watcher.run();
    return 0;
  } catch (error) {
    console.error(`WATCH_FAILED: ${errorMessage(error)}`);
    return 1;
  } finally {
    const server = statusServer;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    watcher.close();
    store.close();
  }
}

async function serveStatus(): Promise<number> {
  const store = new EventStore(defaultWorkerDatabasePath());
  try {
    const server = await startStatusServer(store, loadStatusServerOptions());
    console.log(
      JSON.stringify(
        {
          boundary: "LIVE_EVIDENCE_STATUS_API",
          status: "listening",
          address: server.address(),
        },
        null,
        2,
      ),
    );
    await new Promise<void>((resolve) => {
      const shutdown = () => server.close(() => resolve());
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    });
    return 0;
  } finally {
    store.close();
  }
}

const [command, argument] = process.argv.slice(2);
const exitCode =
  command === "check-config"
    ? await checkConfig()
    : command === "process-tx"
      ? await processTransactionCommand(argument ?? "")
      : command === "watch"
        ? await watchSource(argument === "--once")
        : command === "status"
          ? await serveStatus()
          : (console.error(
              "USAGE: check-config | process-tx <source-tx-hash> | watch [--once] | status",
            ),
            1);

process.exitCode = exitCode;
