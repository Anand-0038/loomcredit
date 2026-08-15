import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { ConfigError, loadConfig, publicConfig } from "../src/config.js";
import { createEvent } from "../src/event.js";
import { TerminalWorkerError } from "../src/errors.js";
import { InvalidStageTransitionError } from "../src/stages.js";
import {
  isTerminalProcessingError,
  processTransaction,
  type ProcessorDependencies,
} from "../src/processor.js";
import type { SourceInspection, SourceProof } from "../src/proof.js";
import {
  loadStatusServerOptions,
  startStatusServer,
  toPublicEventStatus,
} from "../src/status-server.js";
import { EventStore } from "../src/store.js";

const validEnvironment = {
  SOURCE_CHAIN_RPC_URL: "https://rpc.example.test",
  CREDITCOIN_RPC_URL: "https://creditcoin.example.test",
  PROOF_BUILDER_URL: "https://proof.example.test",
  SOURCE_CHAIN_KEY: "1",
  SOURCE_ESCROW_ADDRESS: `0x${"11".repeat(20)}`,
  TRADE_EVIDENCE_USC_ADDRESS: `0x${"22".repeat(20)}`,
  CREDITCOIN_WALLET_PRIVATE_KEY: `0x${"33".repeat(32)}`,
};

const tempPaths: string[] = [];

afterEach(() => {
  for (const path of tempPaths.splice(0))
    rmSync(path, { recursive: true, force: true });
});

describe("worker configuration", () => {
  it("parses live integration configuration without exposing the wallet key", () => {
    const config = loadConfig(validEnvironment);
    const summary = publicConfig(config);
    expect(summary.walletConfigured).toBe(true);
    expect(JSON.stringify(summary)).not.toContain(
      validEnvironment.CREDITCOIN_WALLET_PRIVATE_KEY,
    );
  });

  it("normalizes a private key without a 0x prefix for the worker wallet", () => {
    const config = loadConfig({
      ...validEnvironment,
      CREDITCOIN_WALLET_PRIVATE_KEY: "33".repeat(32),
    });

    expect(config.creditcoinWalletPrivateKey).toBe(`0x${"33".repeat(32)}`);
  });

  it("rejects incomplete configuration", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
  });

  it("resolves deployed addresses from public manifests when overrides are absent", () => {
    const directory = mkdtempSync(join(tmpdir(), "loomcredit-manifests-"));
    tempPaths.push(directory);
    const sourceManifest = join(directory, "source.json");
    const creditcoinManifest = join(directory, "creditcoin.json");
    writeFileSync(
      sourceManifest,
      JSON.stringify({
        contracts: {
          OrderGuaranteeEscrow: { address: `0x${"44".repeat(20)}` },
        },
      }),
    );
    writeFileSync(
      creditcoinManifest,
      JSON.stringify({
        contracts: {
          TradeEvidenceUSC: {
            address: `0x${"55".repeat(20)}`,
            deploymentBlock: 55,
          },
        },
      }),
    );

    const config = loadConfig({
      ...validEnvironment,
      SOURCE_ESCROW_ADDRESS: "",
      TRADE_EVIDENCE_USC_ADDRESS: "",
      SOURCE_DEPLOYMENT_MANIFEST: sourceManifest,
      CREDITCOIN_DEPLOYMENT_MANIFEST: creditcoinManifest,
    });

    expect(config.sourceEscrowAddress).toBe(`0x${"44".repeat(20)}`);
    expect(config.tradeEvidenceUscAddress).toBe(`0x${"55".repeat(20)}`);
    expect(config.creditcoinStartBlock).toBe(55);
  });
});

describe("event store", () => {
  it("persists monotonic stage transitions and rejects skipped stages", () => {
    const directory = mkdtempSync(join(tmpdir(), "loomcredit-worker-"));
    tempPaths.push(directory);
    const store = new EventStore(join(directory, "events.sqlite"));
    const hash = `0x${"aa".repeat(32)}`;
    store.upsert(createEvent(hash, 1, `0x${"bb".repeat(32)}`, 10, 2, 0));
    expect(store.get(hash)?.stageTimestamps.DETECTED).toBeTruthy();
    store.updateStage(hash, "WAITING_FOR_ATTESTATION");
    expect(
      store.get(hash)?.stageTimestamps.WAITING_FOR_ATTESTATION,
    ).toBeTruthy();
    expect(() => store.updateStage(hash, "VERIFIED")).toThrow(
      InvalidStageTransitionError,
    );
    expect(store.updateStage(hash, "PROOF_REQUESTED").stage).toBe(
      "PROOF_REQUESTED",
    );
    store.updateStage(hash, "PROOF_READY");
    expect(store.updateStage(hash, "WAITING_FOR_ATTESTATION").stage).toBe(
      "WAITING_FOR_ATTESTATION",
    );
    store.updateStage(hash, "FAILED_RETRYABLE");
    expect(store.updateStage(hash, "CREDITCOIN_SUBMITTED").stage).toBe(
      "CREDITCOIN_SUBMITTED",
    );
    expect(store.getCursor()).toBeNull();
    store.setCursor(42);
    expect(store.getCursor()).toBe(42);
    store.close();
  });

  it("refreshes a discovered block log index from the mined receipt position", () => {
    const directory = mkdtempSync(join(tmpdir(), "loomcredit-position-"));
    tempPaths.push(directory);
    const store = new EventStore(join(directory, "events.sqlite"));
    const hash = `0x${"ef".repeat(32)}`;
    store.upsert(createEvent(hash, 1, `0x${"12".repeat(32)}`, 10, 2, 786));

    const updated = store.updateSourcePosition(hash, {
      blockHeight: 10,
      txIndex: 2,
      logIndex: 1,
    });

    expect(updated.logIndex).toBe(1);
    expect(store.get(hash)?.logIndex).toBe(1);
    store.close();
  });

  it("persists the source emitter while retaining legacy tx-hash lookup", () => {
    const directory = mkdtempSync(join(tmpdir(), "loomcredit-identity-"));
    tempPaths.push(directory);
    const store = new EventStore(join(directory, "events.sqlite"));
    const hash = `0x${"ef".repeat(32)}`;
    const emitter = `0x${"12".repeat(20)}`;
    store.upsert(
      createEvent(hash, 1, `0x${"34".repeat(32)}`, 10, 2, 1, emitter),
    );

    expect(store.get(hash)).toMatchObject({
      sourceChainKey: 1,
      sourceTxHash: hash,
      sourceEmitter: emitter,
      logIndex: 1,
    });
    store.close();
  });

  it("keeps two relevant events from one source transaction separate", () => {
    const directory = mkdtempSync(join(tmpdir(), "loomcredit-multi-event-"));
    tempPaths.push(directory);
    const store = new EventStore(join(directory, "events.sqlite"));
    const hash = "0x" + "ef".repeat(32);
    const emitter = "0x" + "12".repeat(20);
    const first = createEvent(
      hash,
      1,
      "0x" + "34".repeat(32),
      10,
      2,
      1,
      emitter,
    );
    const second = createEvent(
      hash,
      1,
      "0x" + "56".repeat(32),
      10,
      2,
      2,
      emitter,
    );

    store.upsert(first);
    store.upsert(second);

    expect(store.list()).toHaveLength(2);
    expect(store.getBySourceEventKey(first.sourceEventKey)?.orderId).toBe(
      first.orderId,
    );
    expect(store.getBySourceEventKey(second.sourceEventKey)?.orderId).toBe(
      second.orderId,
    );
    store.close();
  });

  it("keeps lifecycle transitions for one order separate", () => {
    const directory = mkdtempSync(
      join(tmpdir(), "loomcredit-lifecycle-identity-"),
    );
    tempPaths.push(directory);
    const store = new EventStore(join(directory, "events.sqlite"));
    const hash = "0x" + "ef".repeat(32);
    const emitter = "0x" + "12".repeat(20);
    const orderId = "0x" + "34".repeat(32);

    const guaranteed = createEvent(hash, 1, orderId, 10, 2, 1, emitter);
    const cancelled = createEvent(
      hash,
      1,
      orderId,
      10,
      2,
      2,
      emitter,
      "ORDER_CANCELLED",
    );

    store.upsert(guaranteed);
    store.upsert(cancelled);

    expect(store.list()).toHaveLength(2);
    expect(
      store.getBySourceEventKey(guaranteed.sourceEventKey)?.eventType,
    ).toBe("ORDER_GUARANTEED");
    expect(store.getBySourceEventKey(cancelled.sourceEventKey)?.eventType).toBe(
      "ORDER_CANCELLED",
    );
    store.close();
  });

  it("adds stage timestamps when opening a legacy worker database", () => {
    const directory = mkdtempSync(join(tmpdir(), "loomcredit-legacy-"));
    tempPaths.push(directory);
    const databasePath = join(directory, "events.sqlite");
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE cross_chain_events (
        source_tx_hash TEXT PRIMARY KEY,
        source_chain_key INTEGER NOT NULL,
        block_height INTEGER,
        tx_index INTEGER,
        log_index INTEGER NOT NULL,
        order_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        evidence_id TEXT,
        creditcoin_tx_hash TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    const hash = `0x${"ab".repeat(32)}`;
    const orderId = `0x${"cd".repeat(32)}`;
    const timestamp = new Date().toISOString();
    legacy
      .prepare(
        `INSERT INTO cross_chain_events (
          source_tx_hash, source_chain_key, block_height, tx_index, log_index,
          order_id, stage, retry_count, evidence_id, creditcoin_tx_hash,
          last_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        hash,
        1,
        10,
        2,
        0,
        orderId,
        "DETECTED",
        0,
        null,
        null,
        null,
        timestamp,
        timestamp,
      );
    legacy.close();

    const store = new EventStore(databasePath);
    expect(store.get(hash)?.stageTimestamps).toEqual({});
    expect(
      store.updateStage(hash, "WAITING_FOR_ATTESTATION").stageTimestamps,
    ).toMatchObject({ WAITING_FOR_ATTESTATION: expect.any(String) });
    store.upsert(
      createEvent(
        hash,
        1,
        "0x" + "ef".repeat(32),
        10,
        2,
        2,
        "0x" + "34".repeat(20),
      ),
    );
    expect(store.list()).toHaveLength(2);
    store.close();
  });

  it("allows only one watcher owner until its lease expires", () => {
    const directory = mkdtempSync(join(tmpdir(), "loomcredit-lease-"));
    tempPaths.push(directory);
    const databasePath = join(directory, "events.sqlite");
    const first = new EventStore(databasePath);
    const second = new EventStore(databasePath);

    expect(first.acquireLease("source-watcher", "first", 1_000, 10_000)).toBe(
      true,
    );
    expect(second.acquireLease("source-watcher", "second", 1_000, 10_500)).toBe(
      false,
    );
    expect(second.acquireLease("source-watcher", "second", 1_000, 11_001)).toBe(
      true,
    );

    first.releaseLease("source-watcher", "first");
    second.releaseLease("source-watcher", "second");
    first.close();
    second.close();
  });
});

describe("CC3 submission recovery", () => {
  it("reuses a broadcast hash after the first process fails before mining", async () => {
    const directory = mkdtempSync(join(tmpdir(), "loomcredit-recovery-"));
    tempPaths.push(directory);
    const store = new EventStore(join(directory, "events.sqlite"));
    const sourceTxHash = `0x${"aa".repeat(32)}`;
    const orderId = `0x${"bb".repeat(32)}`;
    const sourceEmitter = `0x${"11".repeat(20)}`;
    const creditcoinTxHash = `0x${"cc".repeat(32)}`;
    const evidenceId = `0x${"dd".repeat(32)}`;

    store.upsert(
      createEvent(sourceTxHash, 1, orderId, 10, 2, 0, sourceEmitter),
    );

    const inspection: SourceInspection = {
      receipt: { blockNumber: 10 } as never,
      event: {
        eventType: "ORDER_GUARANTEED",
        sourceTxHash,
        sourceEmitter,
        blockHeight: 10,
        txIndex: 2,
        logIndex: 0,
        orderId,
        buyer: `0x${"22".repeat(20)}`,
        supplier: `0x${"33".repeat(20)}`,
        settlementToken: `0x${"44".repeat(20)}`,
        orderValue: 1n,
        guaranteeAmount: 1n,
        deliveryDeadline: 100,
        termsCommitment: `0x${"55".repeat(32)}`,
        buyerIdentityCommitment: `0x${"66".repeat(32)}`,
        supplierIdentityCommitment: `0x${"77".repeat(32)}`,
        nonce: 1,
      },
    };
    const proof: SourceProof = {
      chainKey: 1,
      blockHeight: 10,
      txIndex: 2,
      encodedTransaction: "0x",
      merkleRoot: `0x${"88".repeat(32)}`,
      siblings: [],
      lowerEndpointDigest: `0x${"99".repeat(32)}`,
      continuityRoots: [`0x${"aa".repeat(32)}`],
    };
    let submitCalls = 0;
    let confirmCalls = 0;
    const dependencies: ProcessorDependencies = {
      createProofClient: () => ({
        inspectTransaction: async () => inspection,
        getProof: async (_inspection, onStatus) => {
          onStatus?.("WAITING_FOR_ATTESTATION");
          onStatus?.("PROOF_REQUESTED");
          return proof;
        },
      }),
      createSubmitter: () => ({
        findExisting: async () => null,
        confirm: async (transactionHash: string, confirmedOrderId: string) => {
          confirmCalls += 1;
          expect(transactionHash).toBe(creditcoinTxHash);
          expect(confirmedOrderId).toBe(orderId);
          return { transactionHash, evidenceId };
        },
        submit: async (_proof, _event, onBroadcast) => {
          submitCalls += 1;
          await onBroadcast?.(creditcoinTxHash);
          throw new Error("receipt wait interrupted after broadcast");
        },
      }),
    };
    const config = loadConfig(validEnvironment);
    const logger = { log: () => {}, error: () => {} };

    expect(
      await processTransaction(
        sourceTxHash,
        config,
        store,
        logger,
        dependencies,
      ),
    ).toBe(1);
    expect(store.get(sourceTxHash)).toMatchObject({
      stage: "FAILED_RETRYABLE",
      creditcoinTxHash,
      evidenceId: null,
    });

    expect(
      await processTransaction(
        sourceTxHash,
        config,
        store,
        logger,
        dependencies,
      ),
    ).toBe(0);
    expect(submitCalls).toBe(1);
    expect(confirmCalls).toBe(1);
    expect(store.get(sourceTxHash)).toMatchObject({
      stage: "VERIFIED",
      creditcoinTxHash,
      evidenceId,
    });
    store.close();
  });
});

describe("worker error classification", () => {
  it("stops retrying invalid source or verified-receipt mismatches", () => {
    expect(
      isTerminalProcessingError(
        new TerminalWorkerError("Source transaction failed: 0xdead"),
      ),
    ).toBe(true);
    expect(
      isTerminalProcessingError(
        new TerminalWorkerError(
          "Creditcoin receipt omitted OrderEvidenceVerified: 0xbeef",
        ),
      ),
    ).toBe(true);
    expect(
      isTerminalProcessingError(new Error("Source transaction failed: 0xdead")),
    ).toBe(false);
    expect(isTerminalProcessingError(new Error("fetch failed"))).toBe(false);
  });
});

describe("public status boundary", () => {
  it("exposes only sanitized lifecycle fields", () => {
    const event = createEvent(
      `0x${"aa".repeat(32)}`,
      1,
      `0x${"bb".repeat(32)}`,
      123,
      4,
      2,
    );
    const publicStatus = toPublicEventStatus({
      ...event,
      stage: "VERIFIED",
      evidenceId: `0x${"cc".repeat(32)}`,
      creditcoinTxHash: `0x${"dd".repeat(32)}`,
    });

    expect(publicStatus).toEqual(
      expect.objectContaining({
        sourceChainKey: 1,
        txIndex: 4,
        logIndex: 2,
        proofStatus: "LIVE_VERIFIED",
        evidenceId: `0x${"cc".repeat(32)}`,
        creditcoinTxHash: `0x${"dd".repeat(32)}`,
        stageTimestamps: expect.objectContaining({
          DETECTED: expect.any(String),
        }),
      }),
    );
    expect(JSON.stringify(publicStatus)).not.toContain("private");
  });

  it("uses a local read-only status server default", () => {
    expect(loadStatusServerOptions({})).toEqual({
      host: "127.0.0.1",
      port: 8787,
    });
  });

  it("documents status endpoints at the server root", async () => {
    const directory = mkdtempSync(join(tmpdir(), "loomcredit-status-"));
    tempPaths.push(directory);
    const store = new EventStore(join(directory, "status.sqlite"));
    const server = await startStatusServer(store, {
      host: "127.0.0.1",
      port: 0,
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("status server did not expose a TCP address");
      }
      const body = await new Promise<{ statusCode?: number; body: string }>(
        (resolve, reject) => {
          const request = get(
            {
              host: "127.0.0.1",
              port: address.port,
              path: "/",
            },
            (response) => {
              let responseBody = "";
              response.setEncoding("utf8");
              response.on("data", (chunk: string) => {
                responseBody += chunk;
              });
              response.on("end", () =>
                resolve({
                  statusCode: response.statusCode ?? 0,
                  body: responseBody,
                }),
              );
            },
          );
          request.on("error", reject);
        },
      );

      expect(body.statusCode).toBe(200);
      expect(JSON.parse(body.body)).toEqual(
        expect.objectContaining({
          boundary: "LIVE_EVIDENCE_STATUS_API",
          service: "loomcredit-worker-status",
          endpoints: {
            health: "/health",
            orders: "/v1/orders",
            evidence: "/v1/evidence/:evidenceId",
          },
        }),
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      store.close();
    }
  });
});
