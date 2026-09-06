import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CASE_ROLES = ["lender", "marketplace", "supplier"] as const;
export type CaseRole = (typeof CASE_ROLES)[number];

export const CASE_STATUSES = [
  "SUBMITTED",
  "PROCESSING",
  "COMPLETED",
  "FAILED_RETRYABLE",
  "FAILED_TERMINAL",
  "WORKER_UNAVAILABLE",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_REVIEW_DECISIONS = [
  "ACCEPT_RECOMMENDATION",
  "REFER_FOR_INFORMATION",
  "DECLINE_CASE",
] as const;
export type CaseReviewDecision = (typeof CASE_REVIEW_DECISIONS)[number];

export interface CaseReviewEvent {
  reviewId: string;
  caseId: string;
  decision: CaseReviewDecision;
  note: string | null;
  actorAccountId: string;
  actorAddress: string;
  proposalEvidenceId: string;
  proposalFingerprint: string | null;
  proposalDecision: "APPROVED" | "REJECTED" | "REFER";
  createdAt: string;
}

const CASE_STATUS_TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  SUBMITTED: [
    "SUBMITTED",
    "PROCESSING",
    "COMPLETED",
    "FAILED_RETRYABLE",
    "FAILED_TERMINAL",
    "WORKER_UNAVAILABLE",
  ],
  PROCESSING: [
    "PROCESSING",
    "COMPLETED",
    "FAILED_RETRYABLE",
    "FAILED_TERMINAL",
    "WORKER_UNAVAILABLE",
  ],
  COMPLETED: ["COMPLETED"],
  FAILED_RETRYABLE: [
    "FAILED_RETRYABLE",
    "PROCESSING",
    "COMPLETED",
    "FAILED_TERMINAL",
    "WORKER_UNAVAILABLE",
  ],
  FAILED_TERMINAL: ["FAILED_TERMINAL"],
  WORKER_UNAVAILABLE: [
    "WORKER_UNAVAILABLE",
    "PROCESSING",
    "COMPLETED",
    "FAILED_RETRYABLE",
    "FAILED_TERMINAL",
  ],
};

export function canTransitionCaseStatus(
  from: CaseStatus,
  to: CaseStatus,
): boolean {
  return CASE_STATUS_TRANSITIONS[from].includes(to);
}

export interface FinanceCase {
  caseId: string;
  workerRequestId: string;
  sourceTxHash: string;
  requestedAdvanceBps: number;
  deliveryDays: number;
  role: CaseRole;
  accountId: string;
  address: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
}

type StoredRow = Record<string, unknown>;

const MAX_STORED_PROPOSAL_BYTES = 256 * 1024;

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function defaultCaseDatabasePath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.CASE_DATABASE_PATH?.trim();
  if (!configured) return resolve(workspaceRoot, "web/data/cases.sqlite");
  return isAbsolute(configured)
    ? configured
    : resolve(workspaceRoot, configured);
}

function rowToCase(row: StoredRow | undefined): FinanceCase | null {
  if (!row) return null;
  const role = String(row.role) as CaseRole;
  const status = String(row.status) as CaseStatus;
  if (!(CASE_ROLES as readonly string[]).includes(role)) {
    throw new Error(`Invalid case role stored: ${role}`);
  }
  if (!(CASE_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Invalid case status stored: ${status}`);
  }
  return {
    caseId: String(row.case_id),
    workerRequestId: String(row.worker_request_id),
    sourceTxHash: String(row.source_tx_hash),
    requestedAdvanceBps: Number(row.requested_advance_bps),
    deliveryDays: Number(row.delivery_days),
    role,
    accountId: String(row.account_id),
    address: String(row.address),
    status,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToReview(row: StoredRow | undefined): CaseReviewEvent | null {
  if (!row) return null;
  const decision = String(row.decision) as CaseReviewDecision;
  if (!(CASE_REVIEW_DECISIONS as readonly string[]).includes(decision)) {
    throw new Error(`Invalid case review decision stored: ${decision}`);
  }
  const proposalDecision = String(row.proposal_decision) as
    "APPROVED" | "REJECTED" | "REFER";
  if (!["APPROVED", "REJECTED", "REFER"].includes(proposalDecision)) {
    throw new Error(`Invalid proposal decision stored: ${proposalDecision}`);
  }
  return {
    reviewId: String(row.review_id),
    caseId: String(row.case_id),
    decision,
    note: typeof row.note === "string" ? row.note : null,
    actorAccountId: String(row.actor_account_id),
    actorAddress: String(row.actor_address),
    proposalEvidenceId: String(row.proposal_evidence_id),
    proposalFingerprint:
      typeof row.proposal_fingerprint === "string"
        ? row.proposal_fingerprint
        : null,
    proposalDecision,
    createdAt: String(row.created_at),
  };
}

export class CaseStore {
  private readonly database: DatabaseSync;

  constructor(databasePath = defaultCaseDatabasePath()) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA journal_mode = WAL;");
    this.database.exec("PRAGMA busy_timeout = 5000;");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS finance_cases (
        case_id TEXT PRIMARY KEY,
        worker_request_id TEXT NOT NULL UNIQUE,
        source_tx_hash TEXT NOT NULL UNIQUE,
        requested_advance_bps INTEGER NOT NULL,
        delivery_days INTEGER NOT NULL,
        role TEXT NOT NULL,
        account_id TEXT NOT NULL,
        address TEXT NOT NULL,
        status TEXT NOT NULL,
        proposal_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS finance_cases_account_idx
        ON finance_cases(account_id, updated_at);
      CREATE INDEX IF NOT EXISTS finance_cases_updated_idx
        ON finance_cases(updated_at);
      CREATE TABLE IF NOT EXISTS case_review_events (
        review_id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN (
          'ACCEPT_RECOMMENDATION', 'REFER_FOR_INFORMATION', 'DECLINE_CASE'
        )),
        note TEXT,
        actor_account_id TEXT NOT NULL,
        actor_address TEXT NOT NULL,
        proposal_evidence_id TEXT NOT NULL,
        proposal_fingerprint TEXT NOT NULL,
        proposal_decision TEXT NOT NULL CHECK (proposal_decision IN (
          'APPROVED', 'REJECTED', 'REFER'
        )),
        created_at TEXT NOT NULL,
        FOREIGN KEY (case_id) REFERENCES finance_cases(case_id)
      );
      CREATE INDEX IF NOT EXISTS case_review_events_case_idx
        ON case_review_events(case_id, created_at DESC, review_id DESC);
    `);
    this.ensureProposalColumn();
    this.ensureReviewFingerprintColumn();
  }

  private ensureProposalColumn(): void {
    const columns = this.database
      .prepare("PRAGMA table_info(finance_cases)")
      .all() as Array<{ name?: unknown }>;
    if (columns.some((column) => column.name === "proposal_json")) return;
    this.database.exec(
      "ALTER TABLE finance_cases ADD COLUMN proposal_json TEXT;",
    );
  }

  private ensureReviewFingerprintColumn(): void {
    const columns = this.database
      .prepare("PRAGMA table_info(case_review_events)")
      .all() as Array<{ name?: unknown }>;
    if (columns.some((column) => column.name === "proposal_fingerprint"))
      return;
    // Existing review rows predate exact-proposal binding. A nullable migration
    // intentionally leaves them historical; they will never match a current
    // proposal in the operator queue.
    this.database.exec(
      "ALTER TABLE case_review_events ADD COLUMN proposal_fingerprint TEXT;",
    );
  }

  create(input: {
    caseId: string;
    sourceTxHash: string;
    requestedAdvanceBps: number;
    deliveryDays: number;
    role: CaseRole;
    accountId: string;
    address: string;
  }): FinanceCase {
    const now = new Date().toISOString();
    this.database
      .prepare(
        `
        INSERT INTO finance_cases (
          case_id, worker_request_id, source_tx_hash, requested_advance_bps,
          delivery_days, role, account_id, address, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?, ?)
        `,
      )
      .run(
        input.caseId,
        input.caseId,
        input.sourceTxHash.trim().toLowerCase(),
        input.requestedAdvanceBps,
        input.deliveryDays,
        input.role,
        input.accountId,
        input.address,
        now,
        now,
      );
    return this.get(input.caseId)!;
  }

  get(caseId: string): FinanceCase | null {
    const row = this.database
      .prepare("SELECT * FROM finance_cases WHERE case_id = ?")
      .get(caseId) as StoredRow | undefined;
    return rowToCase(row);
  }

  findBySourceTxHash(sourceTxHash: string): FinanceCase | null {
    const row = this.database
      .prepare(
        "SELECT * FROM finance_cases WHERE lower(source_tx_hash) = lower(?)",
      )
      .get(sourceTxHash) as StoredRow | undefined;
    return rowToCase(row);
  }

  listForAccount(accountId: string, limit = 50): FinanceCase[] {
    if (!accountId.trim()) throw new Error("Account ID is required");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Case list limit must be an integer between 1 and 100");
    }
    const rows = this.database
      .prepare(
        `
          SELECT * FROM finance_cases
           WHERE account_id = ?
           ORDER BY updated_at DESC, created_at DESC, case_id DESC
           LIMIT ?
        `,
      )
      .all(accountId, limit) as StoredRow[];
    return rows
      .map((row) => rowToCase(row))
      .filter(
        (financeCase): financeCase is FinanceCase => financeCase !== null,
      );
  }

  latestReview(caseId: string): CaseReviewEvent | null {
    const row = this.database
      .prepare(
        `SELECT * FROM case_review_events
          WHERE case_id = ?
          ORDER BY created_at DESC, review_id DESC
          LIMIT 1`,
      )
      .get(caseId) as StoredRow | undefined;
    return rowToReview(row);
  }

  listReviews(caseId: string, limit = 50): CaseReviewEvent[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Review list limit must be an integer between 1 and 100");
    }
    return (
      this.database
        .prepare(
          `SELECT * FROM case_review_events
            WHERE case_id = ?
            ORDER BY created_at DESC, review_id DESC
            LIMIT ?`,
        )
        .all(caseId, limit) as StoredRow[]
    )
      .map((row) => rowToReview(row))
      .filter((review): review is CaseReviewEvent => review !== null);
  }

  appendReview(input: {
    reviewId: string;
    caseId: string;
    decision: CaseReviewDecision;
    note?: string | null;
    actorAccountId: string;
    actorAddress: string;
    proposalEvidenceId: string;
    proposalFingerprint: string;
    proposalDecision: "APPROVED" | "REJECTED" | "REFER";
  }): CaseReviewEvent {
    if (!this.get(input.caseId))
      throw new Error(`Case not found: ${input.caseId}`);
    if (
      !(CASE_REVIEW_DECISIONS as readonly string[]).includes(input.decision)
    ) {
      throw new Error(`Invalid case review decision: ${input.decision}`);
    }
    const note = input.note?.trim() || null;
    if (note && note.length > 1_000) {
      throw new Error("Review note exceeds the allowed size");
    }
    const now = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `INSERT INTO case_review_events (
            review_id, case_id, decision, note, actor_account_id,
            actor_address, proposal_evidence_id, proposal_fingerprint,
            proposal_decision, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.reviewId,
          input.caseId,
          input.decision,
          note,
          input.actorAccountId,
          input.actorAddress,
          input.proposalEvidenceId,
          input.proposalFingerprint,
          input.proposalDecision,
          now,
        );
      this.database
        .prepare("UPDATE finance_cases SET updated_at = ? WHERE case_id = ?")
        .run(now, input.caseId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return this.latestReview(input.caseId)!;
  }

  getProposal(caseId: string): unknown | null {
    const row = this.database
      .prepare("SELECT proposal_json FROM finance_cases WHERE case_id = ?")
      .get(caseId) as StoredRow | undefined;
    if (!row || typeof row.proposal_json !== "string") return null;
    try {
      return JSON.parse(row.proposal_json) as unknown;
    } catch {
      return null;
    }
  }

  hasProposal(caseId: string): boolean {
    const row = this.database
      .prepare(
        "SELECT proposal_json FROM finance_cases WHERE case_id = ? AND proposal_json IS NOT NULL",
      )
      .get(caseId) as StoredRow | undefined;
    return Boolean(row);
  }

  saveProposal(caseId: string, proposal: unknown): FinanceCase {
    const existing = this.get(caseId);
    if (!existing) throw new Error(`Case not found: ${caseId}`);
    const serialized = JSON.stringify(proposal);
    if (
      serialized === undefined ||
      serialized.length > MAX_STORED_PROPOSAL_BYTES
    ) {
      throw new Error("Stored proposal exceeds the allowed size");
    }
    const result = this.database
      .prepare(
        "UPDATE finance_cases SET proposal_json = ?, updated_at = ? WHERE case_id = ?",
      )
      .run(serialized, new Date().toISOString(), caseId);
    if (Number(result.changes) !== 1) {
      throw new Error(`Case not found: ${caseId}`);
    }
    return this.get(caseId)!;
  }

  clearProposal(caseId: string): FinanceCase {
    const existing = this.get(caseId);
    if (!existing) throw new Error(`Case not found: ${caseId}`);
    const result = this.database
      .prepare(
        "UPDATE finance_cases SET proposal_json = NULL, updated_at = ? WHERE case_id = ?",
      )
      .run(new Date().toISOString(), caseId);
    if (Number(result.changes) !== 1) {
      throw new Error(`Case not found: ${caseId}`);
    }
    return this.get(caseId)!;
  }

  updateStatus(caseId: string, status: CaseStatus): FinanceCase {
    if (!(CASE_STATUSES as readonly string[]).includes(status)) {
      throw new Error(`Invalid case status: ${status}`);
    }
    const current = this.get(caseId);
    if (!current) throw new Error(`Case not found: ${caseId}`);
    // A stale worker response must never make a completed or terminal case
    // look actionable again. Keep the persisted state when the requested
    // transition is outside the case lifecycle.
    if (!canTransitionCaseStatus(current.status, status)) return current;
    const result = this.database
      .prepare(
        "UPDATE finance_cases SET status = ?, updated_at = ? WHERE case_id = ?",
      )
      .run(status, new Date().toISOString(), caseId);
    if (Number(result.changes) !== 1) {
      throw new Error(`Case not found: ${caseId}`);
    }
    return this.get(caseId)!;
  }

  updateWorkerRequestId(caseId: string, workerRequestId: string): FinanceCase {
    const normalized = workerRequestId.trim();
    if (!normalized) throw new Error("Worker request ID is required");
    const result = this.database
      .prepare(
        "UPDATE finance_cases SET worker_request_id = ?, updated_at = ? WHERE case_id = ?",
      )
      .run(normalized, new Date().toISOString(), caseId);
    if (Number(result.changes) !== 1) {
      throw new Error("Case not found: " + caseId);
    }
    return this.get(caseId)!;
  }

  close(): void {
    this.database.close();
  }
}
