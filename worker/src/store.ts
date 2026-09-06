import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { assertTransition, EVENT_STAGES, type EventStage } from "./stages.js";
import type { SourceEventType } from "./event.js";

export const INTAKE_STATUSES = [
  "ACCEPTED",
  "PROCESSING",
  "COMPLETED",
  "FAILED_RETRYABLE",
  "FAILED_TERMINAL",
] as const;

export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export const INTAKE_PROCESSING_STALE_MS = 10 * 60 * 1_000;

const INTAKE_STATUS_TRANSITIONS: Record<IntakeStatus, readonly IntakeStatus[]> =
  {
    ACCEPTED: [
      "ACCEPTED",
      "PROCESSING",
      "COMPLETED",
      "FAILED_RETRYABLE",
      "FAILED_TERMINAL",
    ],
    PROCESSING: [
      "PROCESSING",
      "COMPLETED",
      "FAILED_RETRYABLE",
      "FAILED_TERMINAL",
    ],
    COMPLETED: ["COMPLETED"],
    FAILED_RETRYABLE: [
      "FAILED_RETRYABLE",
      "PROCESSING",
      "COMPLETED",
      "FAILED_TERMINAL",
    ],
    FAILED_TERMINAL: ["FAILED_TERMINAL"],
  };

export function canTransitionIntakeStatus(
  from: IntakeStatus,
  to: IntakeStatus,
): boolean {
  return INTAKE_STATUS_TRANSITIONS[from].includes(to);
}

export interface IntakeRequest {
  requestId: string;
  sourceTxHash: string;
  expectedOrderId: string | null;
  expectedEventType: SourceEventType;
  status: IntakeStatus;
  failureCode: "PROCESSING_FAILED" | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourceOrderDetails {
  buyer: string;
  supplier: string;
  settlementToken: string;
  orderValueMinor: string;
  guaranteeAmountMinor: string;
  deliveryDeadline: number;
  nonce: number;
}

export const EVIDENCE_PROVENANCES = [
  "WORKER_LIVE",
  "RECORDED_TESTNET",
] as const;
export type EvidenceProvenance = (typeof EVIDENCE_PROVENANCES)[number];

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
  sourceOrder: SourceOrderDetails | null;
  provenance: EvidenceProvenance;
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

function parseSourceOrderDetails(value: unknown): SourceOrderDetails | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new Error("Invalid source order storage value");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Invalid source order JSON in worker storage");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Invalid source order object in worker storage");
  }

  const candidate = parsed as Record<string, unknown>;
  const addressFields = ["buyer", "supplier", "settlementToken"] as const;
  for (const field of addressFields) {
    if (
      typeof candidate[field] !== "string" ||
      !/^0x[a-fA-F0-9]{40}$/.test(candidate[field])
    ) {
      throw new Error(`Invalid source order ${field} in worker storage`);
    }
  }
  const amountFields = ["orderValueMinor", "guaranteeAmountMinor"] as const;
  for (const field of amountFields) {
    if (
      typeof candidate[field] !== "string" ||
      !/^\d+$/.test(candidate[field])
    ) {
      throw new Error(`Invalid source order ${field} in worker storage`);
    }
  }
  for (const field of ["deliveryDeadline", "nonce"] as const) {
    if (
      typeof candidate[field] !== "number" ||
      !Number.isSafeInteger(candidate[field]) ||
      candidate[field] < 0
    ) {
      throw new Error(`Invalid source order ${field} in worker storage`);
    }
  }

  return {
    buyer: candidate.buyer as string,
    supplier: candidate.supplier as string,
    settlementToken: candidate.settlementToken as string,
    orderValueMinor: candidate.orderValueMinor as string,
    guaranteeAmountMinor: candidate.guaranteeAmountMinor as string,
    deliveryDeadline: candidate.deliveryDeadline as number,
    nonce: candidate.nonce as number,
  };
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
    sourceOrder: parseSourceOrderDetails(row.source_order_json),
    provenance:
      row.provenance === "RECORDED_TESTNET"
        ? "RECORDED_TESTNET"
        : "WORKER_LIVE",
    stageTimestamps: parseStageTimestamps(row.stage_timestamps),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToIntakeRequest(row: StoredRow | undefined): IntakeRequest | null {
  if (!row) return null;
  const status = String(row.status) as IntakeStatus;
  if (!(INTAKE_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Invalid intake status stored: ${status}`);
  }
  const expectedEventType = String(
    row.expected_event_type ?? "ORDER_GUARANTEED",
  ) as SourceEventType;
  if (
    ![
      "ORDER_GUARANTEED",
      "ORDER_CANCELLED",
      "ORDER_DISPUTED",
      "ORDER_SETTLED",
    ].includes(expectedEventType)
  ) {
    throw new Error(`Invalid intake event type stored: ${expectedEventType}`);
  }
  const failureCode = row.failure_code;
  if (
    failureCode !== null &&
    failureCode !== undefined &&
    failureCode !== "PROCESSING_FAILED"
  ) {
    throw new Error("Invalid intake failure code stored");
  }
  return {
    requestId: String(row.request_id),
    sourceTxHash: String(row.source_tx_hash),
    expectedOrderId:
      row.expected_order_id === null || row.expected_order_id === undefined
        ? null
        : String(row.expected_order_id),
    expectedEventType,
    status,
    failureCode:
      failureCode === null || failureCode === undefined
        ? null
        : "PROCESSING_FAILED",
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
    this.database.exec("PRAGMA busy_timeout = 5000;");
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
        source_order_json TEXT,
        provenance TEXT NOT NULL DEFAULT 'WORKER_LIVE',
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
      CREATE TABLE IF NOT EXISTS source_intake_requests (
        request_id TEXT PRIMARY KEY,
        source_tx_hash TEXT NOT NULL UNIQUE,
        expected_order_id TEXT,
        expected_event_type TEXT NOT NULL DEFAULT 'ORDER_GUARANTEED',
        status TEXT NOT NULL,
        failure_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS source_intake_requests_updated_idx
        ON source_intake_requests(updated_at);
      `);
    this.ensureStageTimestampColumn();
    this.ensureSourceEmitterColumn();
    this.ensureEventTypeColumn();
    this.ensureSourceOrderColumn();
    this.ensureProvenanceColumn();
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

  private ensureSourceOrderColumn(): void {
    const columns = this.database
      .prepare("PRAGMA table_info(cross_chain_events)")
      .all() as Array<{ name?: unknown }>;
    if (columns.some((column) => column.name === "source_order_json")) return;
    this.database.exec(
      "ALTER TABLE cross_chain_events ADD COLUMN source_order_json TEXT;",
    );
  }

  private ensureProvenanceColumn(): void {
    const columns = this.database
      .prepare("PRAGMA table_info(cross_chain_events)")
      .all() as Array<{ name?: unknown }>;
    if (columns.some((column) => column.name === "provenance")) return;
    this.database.exec(
      "ALTER TABLE cross_chain_events ADD COLUMN provenance TEXT NOT NULL DEFAULT 'WORKER_LIVE';",
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
          source_order_json TEXT,
          provenance TEXT NOT NULL DEFAULT 'WORKER_LIVE',
          stage_timestamps TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO cross_chain_events_v2 (
          source_event_key, source_tx_hash, source_chain_key, source_emitter,
          block_height, tx_index, log_index, order_id, event_type, stage, retry_count,
          evidence_id, creditcoin_tx_hash, last_error, source_order_json, provenance,
          stage_timestamps,
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
          source_order_json,
          'WORKER_LIVE',
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
          last_error, source_order_json, provenance, stage_timestamps, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          source_order_json = excluded.source_order_json,
          provenance = excluded.provenance,
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
        event.sourceOrder ? JSON.stringify(event.sourceOrder) : null,
        event.provenance,
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

  updateSourceOrderDetailsBySourceEventKey(
    eventKey: string,
    sourceOrder: SourceOrderDetails,
  ): CrossChainEvent {
    const current = this.getBySourceEventKey(eventKey);
    if (!current) throw new Error(`Event not found: ${eventKey}`);
    return this.upsert({
      ...current,
      sourceOrder,
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

  listByOrderId(orderId: string, limit = 100): CrossChainEvent[] {
    if (!orderId.trim()) throw new Error("Order ID is required");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new Error(
        "Order history limit must be an integer between 1 and 1000",
      );
    }
    const rows = this.database
      .prepare(
        `
          SELECT * FROM cross_chain_events
           WHERE lower(order_id) = lower(?)
           ORDER BY
             block_height IS NULL,
             block_height ASC,
             tx_index IS NULL,
             tx_index ASC,
             log_index ASC,
             created_at ASC,
             source_event_key ASC
           LIMIT ?
        `,
      )
      .all(orderId, limit) as StoredRow[];
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

  findEventForIntake(
    intake: Pick<
      IntakeRequest,
      "sourceTxHash" | "expectedOrderId" | "expectedEventType"
    >,
  ): CrossChainEvent | null {
    const conditions = ["lower(source_tx_hash) = lower(?)", "event_type = ?"];
    const parameters: string[] = [
      intake.sourceTxHash,
      intake.expectedEventType,
    ];
    if (intake.expectedOrderId) {
      conditions.push("lower(order_id) = lower(?)");
      parameters.push(intake.expectedOrderId);
    }
    const row = this.database
      .prepare(
        `
          SELECT * FROM cross_chain_events
           WHERE ${conditions.join(" AND ")}
           ORDER BY updated_at DESC, block_height DESC, log_index DESC
           LIMIT 1
        `,
      )
      .get(...parameters) as StoredRow | undefined;
    return rowToEvent(row);
  }

  createIntakeRequest(input: {
    requestId: string;
    sourceTxHash: string;
    expectedOrderId?: string | null;
    expectedEventType?: SourceEventType;
  }): IntakeRequest {
    const sourceTxHash = input.sourceTxHash.trim().toLowerCase();
    const now = new Date().toISOString();
    this.database
      .prepare(
        `
        INSERT INTO source_intake_requests (
          request_id, source_tx_hash, expected_order_id, expected_event_type,
          status, failure_code, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'ACCEPTED', NULL, ?, ?)
        ON CONFLICT(source_tx_hash) DO NOTHING
        `,
      )
      .run(
        input.requestId,
        sourceTxHash,
        input.expectedOrderId ?? null,
        input.expectedEventType ?? "ORDER_GUARANTEED",
        now,
        now,
      );
    const intake = this.getIntakeRequestBySourceTxHash(sourceTxHash);
    if (!intake) {
      throw new Error(`Intake request was not created: ${sourceTxHash}`);
    }
    return intake;
  }

  getIntakeRequest(requestId: string): IntakeRequest | null {
    const row = this.database
      .prepare("SELECT * FROM source_intake_requests WHERE request_id = ?")
      .get(requestId) as StoredRow | undefined;
    return rowToIntakeRequest(row);
  }

  getIntakeRequestBySourceTxHash(sourceTxHash: string): IntakeRequest | null {
    const row = this.database
      .prepare(
        "SELECT * FROM source_intake_requests WHERE lower(source_tx_hash) = lower(?)",
      )
      .get(sourceTxHash) as StoredRow | undefined;
    return rowToIntakeRequest(row);
  }

  updateIntakeRequest(
    requestId: string,
    status: IntakeStatus,
    failureCode: IntakeRequest["failureCode"] = null,
  ): IntakeRequest {
    if (!(INTAKE_STATUSES as readonly string[]).includes(status)) {
      throw new Error(`Invalid intake status: ${status}`);
    }
    const current = this.getIntakeRequest(requestId);
    if (!current) throw new Error(`Intake request not found: ${requestId}`);
    // A delayed worker callback must not move a completed or terminal intake
    // back into an actionable state after a restart or retry.
    if (!canTransitionIntakeStatus(current.status, status)) return current;
    const updatedAt = new Date().toISOString();
    const result = this.database
      .prepare(
        `
        UPDATE source_intake_requests
           SET status = ?, failure_code = ?, updated_at = ?
         WHERE request_id = ?
        `,
      )
      .run(status, failureCode, updatedAt, requestId);
    if (Number(result.changes) !== 1) {
      throw new Error(`Intake request not found: ${requestId}`);
    }
    return this.getIntakeRequest(requestId)!;
  }

  recoverStaleIntake(
    requestId: string,
    staleBefore = new Date(
      Date.now() - INTAKE_PROCESSING_STALE_MS,
    ).toISOString(),
  ): IntakeRequest {
    const updatedAt = new Date().toISOString();
    this.database
      .prepare(
        `
        UPDATE source_intake_requests
           SET status = 'FAILED_RETRYABLE',
               failure_code = 'PROCESSING_FAILED',
               updated_at = ?
         WHERE request_id = ?
           AND status = 'PROCESSING'
           AND updated_at < ?
        `,
      )
      .run(updatedAt, requestId, staleBefore);
    const intake = this.getIntakeRequest(requestId);
    if (!intake) throw new Error(`Intake request not found: ${requestId}`);
    return intake;
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
