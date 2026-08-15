import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { assertTransition, EVENT_STAGES, type EventStage } from "./stages.js";
import type { SourceEventType } from "./event.js";

export interface CrossChainEvent {
  sourceEventKey: string;
  sourceTxHash: string;
  sourceChainKey: number;
  /** The source contract that emitted the event; nullable for legacy rows. */
  sourceEmitter: string | null;
  blockHeight: number | null;
  txIndex: number | null;
  logIndex: number;
  orderId: string;
  eventType: SourceEventType;
  stage: EventStage;
  retryCount: number;
  evidenceId: string | null;
  creditcoinTxHash: string | null;
  lastError: string | null;
  stageTimestamps: Partial<Record<EventStage, string>>;
  createdAt: string;
  updatedAt: string;
}

type StoredRow = Record<string, unknown>;

const SOURCE_CURSOR = "source-orders";

function parseStageTimestamps(
  value: unknown,
): CrossChainEvent["stageTimestamps"] {
  if (value === null || value === undefined || value === "") return {};
  if (typeof value !== "string") {
    throw new Error("Invalid stage timestamp storage value");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Invalid stage timestamp JSON in worker storage");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Invalid stage timestamp object in worker storage");
  }

  const timestamps: CrossChainEvent["stageTimestamps"] = {};
  for (const [stage, timestamp] of Object.entries(parsed)) {
    if (
      (EVENT_STAGES as readonly string[]).includes(stage) &&
      typeof timestamp === "string"
    ) {
      timestamps[stage as EventStage] = timestamp;
    }
  }
  return timestamps;
}

function rowToEvent(row: StoredRow | undefined): CrossChainEvent | null {
  if (!row) return null;
  return {
    sourceEventKey: String(row.source_event_key),
    sourceTxHash: String(row.source_tx_hash),
    sourceChainKey: Number(row.source_chain_key),
    sourceEmitter:
      row.source_emitter === null || row.source_emitter === undefined
        ? null
        : String(row.source_emitter),
    blockHeight: row.block_height === null ? null : Number(row.block_height),
    txIndex: row.tx_index === null ? null : Number(row.tx_index),
    logIndex: Number(row.log_index),
    orderId: String(row.order_id),
    eventType: String(row.event_type ?? "ORDER_GUARANTEED") as SourceEventType,
    stage: String(row.stage) as EventStage,
    retryCount: Number(row.retry_count),
    evidenceId: row.evidence_id === null ? null : String(row.evidence_id),
    creditcoinTxHash:
      row.creditcoin_tx_hash === null ? null : String(row.creditcoin_tx_hash),
    lastError: row.last_error === null ? null : String(row.last_error),
    stageTimestamps: parseStageTimestamps(row.stage_timestamps),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class EventStore {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA journal_mode = WAL;");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS cross_chain_events (
        source_event_key TEXT PRIMARY KEY,
        source_tx_hash TEXT NOT NULL,
        source_chain_key INTEGER NOT NULL,
        source_emitter TEXT,
        block_height INTEGER,
        tx_index INTEGER,
        log_index INTEGER NOT NULL,
        order_id TEXT NOT NULL,
        event_type TEXT NOT NULL DEFAULT 'ORDER_GUARANTEED',
        stage TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        evidence_id TEXT,
        creditcoin_tx_hash TEXT,
        last_error TEXT,
        stage_timestamps TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS cross_chain_events_stage_idx
        ON cross_chain_events(stage);
      CREATE TABLE IF NOT EXISTS worker_cursors (
        cursor_name TEXT PRIMARY KEY,
        next_block INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS worker_leases (
        lease_name TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      `);
    this.ensureStageTimestampColumn();
    this.ensureSourceEmitterColumn();
    this.ensureEventTypeColumn();
    this.migrateLegacyEventIdentity();
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS cross_chain_events_stage_idx
        ON cross_chain_events(stage);
      CREATE INDEX IF NOT EXISTS cross_chain_events_source_identity_idx
        ON cross_chain_events(
          source_chain_key, source_tx_hash, source_emitter, order_id
        );
      CREATE INDEX IF NOT EXISTS cross_chain_events_source_tx_idx
        ON cross_chain_events(source_tx_hash);
    `);
  }

  private ensureStageTimestampColumn(): void {
    const columns = this.database
      .prepare("PRAGMA table_info(cross_chain_events)")
      .all() as Array<{ name?: unknown }>;
    if (columns.some((column) => column.name === "stage_timestamps")) return;
    this.database.exec(
      "ALTER TABLE cross_chain_events ADD COLUMN stage_timestamps TEXT NOT NULL DEFAULT '{}';",
    );
  }

  private ensureSourceEmitterColumn(): void {
    const columns = this.database
      .prepare("PRAGMA table_info(cross_chain_events)")
      .all() as Array<{ name?: unknown }>;
    if (columns.some((column) => column.name === "source_emitter")) return;
    this.database.exec(
      "ALTER TABLE cross_chain_events ADD COLUMN source_emitter TEXT;",
    );
  }

  private ensureEventTypeColumn(): void {
    const columns = this.database
      .prepare("PRAGMA table_info(cross_chain_events)")
      .all() as Array<{ name?: unknown }>;
    if (columns.some((column) => column.name === "event_type")) return;
    this.database.exec(
      "ALTER TABLE cross_chain_events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'ORDER_GUARANTEED';",
    );
  }

  private migrateLegacyEventIdentity(): void {
    const columns = this.database
      .prepare("PRAGMA table_info(cross_chain_events)")
      .all() as Array<{ name?: unknown; pk?: unknown }>;
    const hasEventKey = columns.some(
      (column) => column.name === "source_event_key",
    );
    const txHashIsPrimaryKey = columns.some(
      (column) => column.name === "source_tx_hash" && Number(column.pk) > 0,
    );
    if (hasEventKey && !txHashIsPrimaryKey) return;

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database.exec(`
        CREATE TABLE cross_chain_events_v2 (
          source_event_key TEXT PRIMARY KEY,
          source_tx_hash TEXT NOT NULL,
          source_chain_key INTEGER NOT NULL,
          source_emitter TEXT,
          block_height INTEGER,
          tx_index INTEGER,
          log_index INTEGER NOT NULL,
          order_id TEXT NOT NULL,
          event_type TEXT NOT NULL DEFAULT 'ORDER_GUARANTEED',
          stage TEXT NOT NULL,
          retry_count INTEGER NOT NULL DEFAULT 0,
          evidence_id TEXT,
          creditcoin_tx_hash TEXT,
          last_error TEXT,
          stage_timestamps TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO cross_chain_events_v2 (
          source_event_key, source_tx_hash, source_chain_key, source_emitter,
          block_height, tx_index, log_index, order_id, event_type, stage, retry_count,
          evidence_id, creditcoin_tx_hash, last_error, stage_timestamps,
          created_at, updated_at
        )
        SELECT
          printf(
            '%d:%s:%s:%s',
            source_chain_key,
            lower(source_tx_hash),
            lower(coalesce(source_emitter, 'unknown-emitter')),
            lower(order_id)
          ),
          source_tx_hash,
          source_chain_key,
          source_emitter,
          block_height,
          tx_index,
          log_index,
          order_id,
          coalesce(event_type, 'ORDER_GUARANTEED'),
          stage,
          retry_count,
          evidence_id,
          creditcoin_tx_hash,
          last_error,
          coalesce(stage_timestamps, '{}'),
          created_at,
          updated_at
        FROM cross_chain_events;
        DROP TABLE cross_chain_events;
        ALTER TABLE cross_chain_events_v2 RENAME TO cross_chain_events;
      `);
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  get(sourceTxHash: string): CrossChainEvent | null {
    const row = this.database
      .prepare(
        "SELECT * FROM cross_chain_events WHERE lower(source_tx_hash) = lower(?) ORDER BY updated_at DESC LIMIT 1",
      )
      .get(sourceTxHash) as StoredRow | undefined;
    return rowToEvent(row);
  }

  getBySourceEventKey(eventKey: string): CrossChainEvent | null {
    const row = this.database
      .prepare("SELECT * FROM cross_chain_events WHERE source_event_key = ?")
      .get(eventKey) as StoredRow | undefined;
    return rowToEvent(row);
  }

  rekeyEvent(
    previousEventKey: string,
    event: CrossChainEvent,
  ): CrossChainEvent {
    if (previousEventKey === event.sourceEventKey) return this.upsert(event);
    if (this.getBySourceEventKey(event.sourceEventKey)) {
      throw new Error("Event identity already exists: " + event.sourceEventKey);
    }
    const result = this.database
      .prepare(
        "UPDATE cross_chain_events SET source_event_key = ?, source_emitter = ?, updated_at = ? WHERE source_event_key = ?",
      )
      .run(
        event.sourceEventKey,
        event.sourceEmitter,
        new Date().toISOString(),
        previousEventKey,
      );
    if (Number(result.changes) !== 1) {
      throw new Error("Event not found: " + previousEventKey);
    }
    return this.upsert(event);
  }

  upsert(event: CrossChainEvent): CrossChainEvent {
    this.database
      .prepare(
        `
        INSERT INTO cross_chain_events (
          source_event_key, source_tx_hash, source_chain_key, source_emitter,
          block_height, tx_index, log_index,
          order_id, event_type, stage, retry_count, evidence_id, creditcoin_tx_hash,
          last_error, stage_timestamps, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_event_key) DO UPDATE SET
          source_tx_hash = excluded.source_tx_hash,
          source_chain_key = excluded.source_chain_key,
          source_emitter = excluded.source_emitter,
          block_height = excluded.block_height,
          tx_index = excluded.tx_index,
          log_index = excluded.log_index,
          order_id = excluded.order_id,
          event_type = excluded.event_type,
          stage = excluded.stage,
          retry_count = excluded.retry_count,
          evidence_id = excluded.evidence_id,
          creditcoin_tx_hash = excluded.creditcoin_tx_hash,
          last_error = excluded.last_error,
          stage_timestamps = excluded.stage_timestamps,
          updated_at = excluded.updated_at
      `,
      )
      .run(
        event.sourceEventKey,
        event.sourceTxHash,
        event.sourceChainKey,
        event.sourceEmitter,
        event.blockHeight,
        event.txIndex,
        event.logIndex,
        event.orderId,
        event.eventType,
        event.stage,
        event.retryCount,
        event.evidenceId,
        event.creditcoinTxHash,
        event.lastError,
        JSON.stringify(event.stageTimestamps),
        event.createdAt,
        event.updatedAt,
      );
    return event;
  }

  updateStage(
    sourceTxHash: string,
    nextStage: EventStage,
    patch: Partial<
      Pick<CrossChainEvent, "evidenceId" | "creditcoinTxHash" | "lastError">
    > = {},
  ): CrossChainEvent {
    const current = this.get(sourceTxHash);
    if (!current) throw new Error(`Event not found: ${sourceTxHash}`);
    return this.updateStageBySourceEventKey(
      current.sourceEventKey,
      nextStage,
      patch,
    );
  }

  updateStageBySourceEventKey(
    eventKey: string,
    nextStage: EventStage,
    patch: Partial<
      Pick<CrossChainEvent, "evidenceId" | "creditcoinTxHash" | "lastError">
    > = {},
  ): CrossChainEvent {
    const current = this.getBySourceEventKey(eventKey);
    if (!current) throw new Error(`Event not found: ${eventKey}`);
    assertTransition(current.stage, nextStage);
    const updatedAt = new Date().toISOString();
    const updated: CrossChainEvent = {
      ...current,
      ...patch,
      stage: nextStage,
      retryCount:
        nextStage === "FAILED_RETRYABLE"
          ? current.retryCount + 1
          : current.retryCount,
      stageTimestamps: {
        ...current.stageTimestamps,
        [nextStage]: updatedAt,
      },
      updatedAt,
    };
    return this.upsert(updated);
  }

  updateSourcePosition(
    sourceTxHash: string,
    position: Pick<CrossChainEvent, "blockHeight" | "txIndex" | "logIndex"> &
      Partial<Pick<CrossChainEvent, "sourceEmitter">>,
  ): CrossChainEvent {
    const current = this.get(sourceTxHash);
    if (!current) throw new Error(`Event not found: ${sourceTxHash}`);
    return this.updateSourcePositionBySourceEventKey(
      current.sourceEventKey,
      position,
    );
  }

  updateSourcePositionBySourceEventKey(
    eventKey: string,
    position: Pick<CrossChainEvent, "blockHeight" | "txIndex" | "logIndex"> &
      Partial<Pick<CrossChainEvent, "sourceEmitter">>,
  ): CrossChainEvent {
    const current = this.getBySourceEventKey(eventKey);
    if (!current) throw new Error(`Event not found: ${eventKey}`);
    return this.upsert({
      ...current,
      ...position,
      updatedAt: new Date().toISOString(),
    });
  }

  list(): CrossChainEvent[] {
    const rows = this.database
      .prepare("SELECT * FROM cross_chain_events ORDER BY updated_at DESC")
      .all() as StoredRow[];
    return rows
      .map((row) => rowToEvent(row))
      .filter((event): event is CrossChainEvent => event !== null);
  }

  listRecent(limit = 100): CrossChainEvent[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new Error(
        "Event status limit must be an integer between 1 and 1000",
      );
    }
    const rows = this.database
      .prepare(
        "SELECT * FROM cross_chain_events ORDER BY updated_at DESC LIMIT ?",
      )
      .all(limit) as StoredRow[];
    return rows
      .map((row) => rowToEvent(row))
      .filter((event): event is CrossChainEvent => event !== null);
  }

  findByOrderId(orderId: string): CrossChainEvent | null {
    const row = this.database
      .prepare(
        "SELECT * FROM cross_chain_events WHERE lower(order_id) = lower(?) ORDER BY updated_at DESC LIMIT 1",
      )
      .get(orderId) as StoredRow | undefined;
    return rowToEvent(row);
  }

  findByEvidenceId(evidenceId: string): CrossChainEvent | null {
    const row = this.database
      .prepare(
        "SELECT * FROM cross_chain_events WHERE lower(evidence_id) = lower(?) ORDER BY updated_at DESC LIMIT 1",
      )
      .get(evidenceId) as StoredRow | undefined;
    return rowToEvent(row);
  }

  count(): number {
    const row = this.database
      .prepare("SELECT COUNT(*) AS event_count FROM cross_chain_events")
      .get() as { event_count: number };
    return Number(row.event_count);
  }

  getCursor(cursorName = SOURCE_CURSOR): number | null {
    const row = this.database
      .prepare("SELECT next_block FROM worker_cursors WHERE cursor_name = ?")
      .get(cursorName) as StoredRow | undefined;
    if (!row) return null;
    const nextBlock = Number(row.next_block);
    if (!Number.isSafeInteger(nextBlock) || nextBlock < 0) {
      throw new Error(`Invalid worker cursor stored for ${cursorName}`);
    }
    return nextBlock;
  }

  setCursor(nextBlock: number, cursorName = SOURCE_CURSOR): void {
    if (!Number.isSafeInteger(nextBlock) || nextBlock < 0) {
      throw new Error("Worker cursor must be a non-negative safe integer");
    }
    this.database
      .prepare(
        `
        INSERT INTO worker_cursors (cursor_name, next_block, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(cursor_name) DO UPDATE SET
          next_block = excluded.next_block,
          updated_at = excluded.updated_at
      `,
      )
      .run(cursorName, nextBlock, new Date().toISOString());
  }

  acquireLease(
    leaseName: string,
    ownerId: string,
    ttlMs: number,
    now = Date.now(),
  ): boolean {
    if (!leaseName.trim() || !ownerId.trim()) {
      throw new Error("Worker lease name and owner are required");
    }
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) {
      throw new Error("Worker lease TTL must be a positive safe integer");
    }
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new Error("Worker lease clock must be a non-negative safe integer");
    }
    const result = this.database
      .prepare(
        `
        INSERT INTO worker_leases (lease_name, owner_id, expires_at)
        VALUES (?, ?, ?)
        ON CONFLICT(lease_name) DO UPDATE SET
          owner_id = excluded.owner_id,
          expires_at = excluded.expires_at
        WHERE worker_leases.expires_at <= ?
           OR worker_leases.owner_id = ?
        `,
      )
      .run(leaseName, ownerId, now + ttlMs, now, ownerId);
    return Number(result.changes) === 1;
  }

  releaseLease(leaseName: string, ownerId: string): void {
    this.database
      .prepare(
        "DELETE FROM worker_leases WHERE lease_name = ? AND owner_id = ?",
      )
      .run(leaseName, ownerId);
  }

  close(): void {
    this.database.close();
  }
}
