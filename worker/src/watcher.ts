import { randomUUID } from "node:crypto";
import { JsonRpcProvider, type Log } from "ethers";

import { createEvent, sourceEventKey, type SourceEventType } from "./event.js";
import type { WorkerConfig } from "./config.js";
import { sourceInterface } from "./proof.js";
import { processTransaction, type ProcessLogger } from "./processor.js";
import { EventStore } from "./store.js";
import { configureRpcTransport } from "./network.js";

const MAX_BLOCK_RANGE = 2_000;
const CURSOR_NAME = "source-orders";
const WATCHER_LEASE_NAME = "source-watcher";
const WATCHER_LEASE_TTL_MS = 5 * 60 * 1_000;
const orderGuaranteedTopic =
  sourceInterface.getEvent("OrderGuaranteed")!.topicHash;
const sourceEventNames: Array<[string, SourceEventType]> = [
  ["OrderGuaranteed", "ORDER_GUARANTEED"],
  ["OrderCancelled", "ORDER_CANCELLED"],
  ["OrderDisputed", "ORDER_DISPUTED"],
  ["OrderSettled", "ORDER_SETTLED"],
];
const sourceEventTopics = sourceEventNames.map(
  ([eventName]) => sourceInterface.getEvent(eventName)!.topicHash,
);

export interface DiscoveredSourceOrder {
  sourceTxHash: string;
  sourceEmitter: string;
  blockHeight: number;
  txIndex: number;
  logIndex: number;
  orderId: string;
  eventType: SourceEventType;
}

function safeNumber(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`Source log ${field} is not a safe non-negative integer`);
  return value;
}

export function decodeOrderGuaranteedLog(
  log: Pick<
    Log,
    | "address"
    | "blockNumber"
    | "transactionHash"
    | "transactionIndex"
    | "index"
    | "topics"
    | "data"
  >,
  sourceEscrowAddress: string,
): DiscoveredSourceOrder | null {
  if (log.address.toLowerCase() !== sourceEscrowAddress.toLowerCase())
    return null;
  let parsed;
  try {
    parsed = sourceInterface.parseLog({ topics: log.topics, data: log.data });
  } catch {
    return null;
  }
  if (!parsed || parsed.name !== "OrderGuaranteed") return null;
  return {
    eventType: "ORDER_GUARANTEED",
    sourceTxHash: log.transactionHash,
    sourceEmitter: log.address,
    blockHeight: safeNumber(log.blockNumber, "blockNumber"),
    txIndex: safeNumber(log.transactionIndex, "transactionIndex"),
    logIndex: safeNumber(log.index, "logIndex"),
    orderId: String(parsed.args[0]),
  };
}

export function decodeSourceEventLog(
  log: Parameters<typeof decodeOrderGuaranteedLog>[0],
  sourceEscrowAddress: string,
): DiscoveredSourceOrder | null {
  if (log.address.toLowerCase() !== sourceEscrowAddress.toLowerCase())
    return null;
  let parsed;
  try {
    parsed = sourceInterface.parseLog({ topics: log.topics, data: log.data });
  } catch {
    return null;
  }
  if (!parsed) return null;
  const eventType = sourceEventNames.find(
    ([eventName]) => eventName === parsed.name,
  )?.[1];
  if (!eventType) return null;
  return {
    sourceTxHash: log.transactionHash,
    sourceEmitter: log.address,
    blockHeight: safeNumber(log.blockNumber, "blockNumber"),
    txIndex: safeNumber(log.transactionIndex, "transactionIndex"),
    logIndex: safeNumber(log.index, "logIndex"),
    orderId: String(parsed.args[0]),
    eventType,
  };
}

export async function discoverSourceEvents(
  provider: Pick<JsonRpcProvider, "getLogs">,
  config: WorkerConfig,
  fromBlock: number,
  toBlock: number,
): Promise<DiscoveredSourceOrder[]> {
  if (fromBlock > toBlock) return [];
  const logs = await provider.getLogs({
    address: config.sourceEscrowAddress,
    topics: [sourceEventTopics],
    fromBlock,
    toBlock,
  });
  return logs
    .map((log) => decodeSourceEventLog(log, config.sourceEscrowAddress))
    .filter((event): event is DiscoveredSourceOrder => event !== null)
    .sort(
      (left, right) =>
        left.blockHeight - right.blockHeight ||
        left.txIndex - right.txIndex ||
        left.logIndex - right.logIndex,
    );
}

export async function discoverSourceOrders(
  provider: Pick<JsonRpcProvider, "getLogs">,
  config: WorkerConfig,
  fromBlock: number,
  toBlock: number,
): Promise<DiscoveredSourceOrder[]> {
  if (fromBlock > toBlock) return [];
  const logs = await provider.getLogs({
    address: config.sourceEscrowAddress,
    topics: [orderGuaranteedTopic],
    fromBlock,
    toBlock,
  });
  return logs
    .map((log) => decodeOrderGuaranteedLog(log, config.sourceEscrowAddress))
    .filter((event): event is DiscoveredSourceOrder => event !== null)
    .sort(
      (left, right) =>
        left.blockHeight - right.blockHeight ||
        left.txIndex - right.txIndex ||
        left.logIndex - right.logIndex,
    );
}

export interface WatchScanResult {
  fromBlock: number;
  toBlock: number | null;
  discovered: number;
  processed: number;
  failed: number;
}

export class SourceEventWatcher {
  private readonly provider: JsonRpcProvider;
  private readonly instanceId = randomUUID();

  constructor(
    private readonly config: WorkerConfig,
    private readonly store: EventStore,
    private readonly logger: ProcessLogger = console,
  ) {
    configureRpcTransport();
    this.provider = new JsonRpcProvider(config.sourceChainRpcUrl);
  }

  async scanOnce(): Promise<WatchScanResult> {
    const configuredStart = this.config.workerStartBlock;
    if (configuredStart === null) {
      throw new Error("WORKER_START_BLOCK is required for source watching");
    }

    if (
      !this.store.acquireLease(
        WATCHER_LEASE_NAME,
        this.instanceId,
        WATCHER_LEASE_TTL_MS,
      )
    ) {
      throw new Error(
        "WATCHER_LEASE_UNAVAILABLE: another worker instance owns the source watcher",
      );
    }

    try {
      return await this.scanOnceWithLease(configuredStart);
    } finally {
      this.store.releaseLease(WATCHER_LEASE_NAME, this.instanceId);
    }
  }

  private async scanOnceWithLease(
    configuredStart: number,
  ): Promise<WatchScanResult> {
    await this.retryPending();
    const latestBlock = await this.provider.getBlockNumber();
    const safeLatest = latestBlock - this.config.workerConfirmations;
    const fromBlock = this.store.getCursor(CURSOR_NAME) ?? configuredStart;
    if (fromBlock > safeLatest) {
      return {
        fromBlock,
        toBlock: null,
        discovered: 0,
        processed: 0,
        failed: 0,
      };
    }

    const toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE - 1, safeLatest);
    const discovered = await discoverSourceEvents(
      this.provider,
      this.config,
      fromBlock,
      toBlock,
    );
    let processed = 0;
    let failed = 0;
    for (const sourceEvent of discovered) {
      const existing = this.store.getBySourceEventKey(
        sourceEventKey(
          this.config.sourceChainKey,
          sourceEvent.sourceTxHash,
          sourceEvent.orderId,
          sourceEvent.sourceEmitter,
          sourceEvent.eventType,
        ),
      );
      if (!existing) {
        this.store.upsert(
          createEvent(
            sourceEvent.sourceTxHash,
            this.config.sourceChainKey,
            sourceEvent.orderId,
            sourceEvent.blockHeight,
            sourceEvent.txIndex,
            sourceEvent.logIndex,
            sourceEvent.sourceEmitter,
            sourceEvent.eventType,
          ),
        );
      }
      const result = await processTransaction(
        sourceEvent.sourceTxHash,
        this.config,
        this.store,
        this.logger,
        undefined,
        sourceEvent.orderId,
        sourceEvent.eventType,
      );
      if (result === 0) processed += 1;
      else failed += 1;
    }
    this.store.setCursor(toBlock + 1, CURSOR_NAME);
    return {
      fromBlock,
      toBlock,
      discovered: discovered.length,
      processed,
      failed,
    };
  }

  async run(): Promise<never> {
    while (true) {
      try {
        const result = await this.scanOnce();
        this.logger.log(
          JSON.stringify({ boundary: "LIVE_SOURCE_WATCHER", ...result }),
        );
      } catch (error) {
        this.logger.error(
          `WATCH_FAILED_RETRYABLE: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, this.config.workerPollIntervalMs);
      });
    }
  }

  close(): void {
    this.store.releaseLease(WATCHER_LEASE_NAME, this.instanceId);
    this.provider.destroy();
  }

  private async retryPending(): Promise<void> {
    const pending = this.store
      .list()
      .filter(
        (event) =>
          event.stage !== "VERIFIED" && event.stage !== "FAILED_TERMINAL",
      );
    for (const event of pending) {
      await processTransaction(
        event.sourceTxHash,
        this.config,
        this.store,
        this.logger,
        undefined,
        event.orderId,
        event.eventType,
      );
    }
  }
}
