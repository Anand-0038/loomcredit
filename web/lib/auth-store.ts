import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type AuthRole = "viewer" | "operator";

export interface AuthNonce {
  nonce: string;
  address: string;
  chainId: number;
  message: string;
  issuedAt: string;
  expiresAt: string;
  attempts: number;
  usedAt: string | null;
}

export interface AuthAccount {
  accountId: string;
  address: string;
  role: AuthRole;
  createdAt: string;
  lastSignInAt: string | null;
}

export interface AuthSession {
  sessionIdHash: string;
  accountId: string;
  address: string;
  role: AuthRole;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
}

export interface AuthAuditEvent {
  eventType:
    | "AUTH_NONCE_ISSUED"
    | "AUTH_SIGN_IN_SUCCEEDED"
    | "AUTH_SIGN_IN_FAILED"
    | "AUTH_SIGN_OUT"
    | "PRIVILEGED_ACTION";
  address: string | null;
  accountId: string | null;
  sessionIdHash: string | null;
  action: string;
  success: boolean;
  metadata?: Record<string, unknown>;
}

type StoredRow = Record<string, unknown>;

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const AUTH_SESSION_COOKIE = "loomcredit_session";
export const AUTH_NONCE_TTL_SECONDS = 5 * 60;
export const AUTH_SESSION_TTL_SECONDS = 8 * 60 * 60;
export const AUTH_MAX_NONCE_ATTEMPTS = 3;

export class AuthStoreError extends Error {
  constructor(
    public readonly code:
      | "NONCE_NOT_FOUND"
      | "NONCE_EXPIRED"
      | "NONCE_USED"
      | "NONCE_ATTEMPTS_EXCEEDED"
      | "NONCE_CLAIMED"
      | "AUTH_STORE_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "AuthStoreError";
  }
}

export function defaultAuthDatabasePath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.AUTH_DATABASE_PATH?.trim();
  if (!configured) return resolve(workspaceRoot, "web/data/auth.sqlite");
  return isAbsolute(configured)
    ? configured
    : resolve(workspaceRoot, configured);
}

function stringValue(row: StoredRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new AuthStoreError(
      "AUTH_STORE_INVALID",
      `Auth store field ${key} is not a string`,
    );
  }
  return value;
}

function nullableStringValue(row: StoredRow, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  return stringValue(row, key);
}

function numberValue(row: StoredRow, key: string): number {
  const value = Number(row[key]);
  if (!Number.isSafeInteger(value)) {
    throw new AuthStoreError(
      "AUTH_STORE_INVALID",
      `Auth store field ${key} is not a safe integer`,
    );
  }
  return value;
}

function authRole(value: unknown): AuthRole {
  if (value === "viewer" || value === "operator") return value;
  throw new AuthStoreError("AUTH_STORE_INVALID", "Auth store role is invalid");
}

function rowToNonce(row: StoredRow | undefined): AuthNonce | null {
  if (!row) return null;
  return {
    nonce: stringValue(row, "nonce"),
    address: stringValue(row, "address"),
    chainId: numberValue(row, "chain_id"),
    message: stringValue(row, "message"),
    issuedAt: stringValue(row, "issued_at"),
    expiresAt: stringValue(row, "expires_at"),
    attempts: numberValue(row, "attempts"),
    usedAt: nullableStringValue(row, "used_at"),
  };
}

function rowToAccount(row: StoredRow | undefined): AuthAccount | null {
  if (!row) return null;
  return {
    accountId: stringValue(row, "account_id"),
    address: stringValue(row, "address"),
    role: authRole(row.role),
    createdAt: stringValue(row, "created_at"),
    lastSignInAt: nullableStringValue(row, "last_sign_in_at"),
  };
}

function rowToSession(row: StoredRow | undefined): AuthSession | null {
  if (!row) return null;
  return {
    sessionIdHash: stringValue(row, "session_id_hash"),
    accountId: stringValue(row, "account_id"),
    address: stringValue(row, "address"),
    role: authRole(row.role),
    createdAt: stringValue(row, "created_at"),
    expiresAt: stringValue(row, "expires_at"),
    lastSeenAt: stringValue(row, "last_seen_at"),
  };
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function nowIso(now = new Date()): string {
  return now.toISOString();
}

export class AuthStore {
  private readonly database: DatabaseSync;

  constructor(databasePath = defaultAuthDatabasePath()) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA journal_mode = WAL;");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS auth_accounts (
        account_id TEXT PRIMARY KEY,
        address TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('viewer', 'operator')),
        created_at TEXT NOT NULL,
        last_sign_in_at TEXT
      );
      CREATE TABLE IF NOT EXISTS auth_nonces (
        nonce TEXT PRIMARY KEY,
        address TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        used_at TEXT
      );
      CREATE INDEX IF NOT EXISTS auth_nonces_address_idx
        ON auth_nonces(address, issued_at);
      CREATE TABLE IF NOT EXISTS auth_sessions (
        session_id_hash TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        address TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('viewer', 'operator')),
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS auth_sessions_account_idx
        ON auth_sessions(account_id, created_at);
      CREATE TABLE IF NOT EXISTS auth_audit_events (
        audit_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        address TEXT,
        account_id TEXT,
        session_id_hash TEXT,
        action TEXT NOT NULL,
        success INTEGER NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS auth_audit_events_created_idx
        ON auth_audit_events(created_at);
    `);
  }

  createNonce(input: {
    nonce: string;
    address: string;
    chainId: number;
    message: string;
    issuedAt: Date;
    expiresAt: Date;
  }): AuthNonce {
    const issuedAt = nowIso(input.issuedAt);
    const expiresAt = nowIso(input.expiresAt);
    this.database
      .prepare(
        `
          INSERT INTO auth_nonces
            (nonce, address, chain_id, message, issued_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        input.nonce,
        input.address,
        input.chainId,
        input.message,
        issuedAt,
        expiresAt,
      );
    return {
      nonce: input.nonce,
      address: input.address,
      chainId: input.chainId,
      message: input.message,
      issuedAt,
      expiresAt,
      attempts: 0,
      usedAt: null,
    };
  }

  pruneExpiredNonces(now = new Date()): number {
    const result = this.database
      .prepare(
        "DELETE FROM auth_nonces WHERE expires_at <= ? OR used_at IS NOT NULL",
      )
      .run(nowIso(now));
    return Number(result.changes);
  }

  getNonce(nonce: string): AuthNonce | null {
    const row = this.database
      .prepare("SELECT * FROM auth_nonces WHERE nonce = ?")
      .get(nonce) as StoredRow | undefined;
    return rowToNonce(row);
  }

  claimNonce(
    nonce: string,
    address: string,
    message: string,
    now = new Date(),
  ): AuthNonce {
    const record = this.getNonce(nonce);
    if (!record)
      throw new AuthStoreError("NONCE_NOT_FOUND", "Sign-in nonce not found");
    if (record.address.toLowerCase() !== address.toLowerCase()) {
      throw new AuthStoreError("NONCE_NOT_FOUND", "Sign-in nonce mismatch");
    }
    if (record.message !== message) {
      throw new AuthStoreError("NONCE_NOT_FOUND", "Sign-in message mismatch");
    }
    if (record.usedAt)
      throw new AuthStoreError("NONCE_USED", "Sign-in nonce was already used");
    if (Date.parse(record.expiresAt) <= now.getTime()) {
      throw new AuthStoreError("NONCE_EXPIRED", "Sign-in nonce has expired");
    }
    if (record.attempts >= AUTH_MAX_NONCE_ATTEMPTS) {
      throw new AuthStoreError(
        "NONCE_ATTEMPTS_EXCEEDED",
        "Too many attempts for this sign-in nonce",
      );
    }

    const result = this.database
      .prepare(
        `
          UPDATE auth_nonces
          SET attempts = attempts + 1
          WHERE nonce = ? AND used_at IS NULL AND attempts < ?
        `,
      )
      .run(nonce, AUTH_MAX_NONCE_ATTEMPTS);
    if (Number(result.changes) !== 1) {
      throw new AuthStoreError(
        "NONCE_CLAIMED",
        "Sign-in nonce was claimed by another request",
      );
    }
    return { ...record, attempts: record.attempts + 1 };
  }

  markNonceUsed(nonce: string, usedAt = new Date()): boolean {
    const result = this.database
      .prepare(
        "UPDATE auth_nonces SET used_at = ? WHERE nonce = ? AND used_at IS NULL",
      )
      .run(nowIso(usedAt), nonce);
    return Number(result.changes) === 1;
  }

  findOrCreateAccount(
    address: string,
    role: AuthRole,
    signedInAt = new Date(),
  ): AuthAccount {
    const signedInAtIso = nowIso(signedInAt);
    const existing = this.database
      .prepare("SELECT * FROM auth_accounts WHERE lower(address) = lower(?)")
      .get(address) as StoredRow | undefined;
    if (existing) {
      this.database
        .prepare(
          "UPDATE auth_accounts SET role = ?, last_sign_in_at = ? WHERE account_id = ?",
        )
        .run(role, signedInAtIso, stringValue(existing, "account_id"));
      return {
        ...rowToAccount(existing)!,
        role,
        lastSignInAt: signedInAtIso,
      };
    }

    const account: AuthAccount = {
      accountId: `acct_${randomBytes(16).toString("hex")}`,
      address,
      role,
      createdAt: signedInAtIso,
      lastSignInAt: signedInAtIso,
    };
    try {
      this.database
        .prepare(
          `
            INSERT INTO auth_accounts
              (account_id, address, role, created_at, last_sign_in_at)
            VALUES (?, ?, ?, ?, ?)
          `,
        )
        .run(
          account.accountId,
          account.address,
          account.role,
          account.createdAt,
          account.lastSignInAt,
        );
      return account;
    } catch {
      const raced = this.database
        .prepare("SELECT * FROM auth_accounts WHERE lower(address) = lower(?)")
        .get(address) as StoredRow | undefined;
      const recovered = rowToAccount(raced);
      if (!recovered)
        throw new AuthStoreError(
          "AUTH_STORE_INVALID",
          "Account could not be created",
        );
      this.database
        .prepare(
          "UPDATE auth_accounts SET role = ?, last_sign_in_at = ? WHERE account_id = ?",
        )
        .run(role, signedInAtIso, recovered.accountId);
      return { ...recovered, role, lastSignInAt: signedInAtIso };
    }
  }

  createSession(
    account: AuthAccount,
    ttlSeconds: number,
    createdAt = new Date(),
  ): { token: string; session: AuthSession } {
    const token = randomBytes(32).toString("base64url");
    const createdAtIso = nowIso(createdAt);
    const expiresAt = new Date(createdAt.getTime() + ttlSeconds * 1_000);
    const expiresAtIso = nowIso(expiresAt);
    const sessionIdHash = hashSessionToken(token);
    this.database
      .prepare(
        `
          INSERT INTO auth_sessions
            (session_id_hash, account_id, address, role, created_at, expires_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        sessionIdHash,
        account.accountId,
        account.address,
        account.role,
        createdAtIso,
        expiresAtIso,
        createdAtIso,
      );
    return {
      token,
      session: {
        sessionIdHash,
        accountId: account.accountId,
        address: account.address,
        role: account.role,
        createdAt: createdAtIso,
        expiresAt: expiresAtIso,
        lastSeenAt: createdAtIso,
      },
    };
  }

  getSession(token: string, now = new Date()): AuthSession | null {
    if (!token.trim()) return null;
    const sessionIdHash = hashSessionToken(token);
    const row = this.database
      .prepare(
        `
          SELECT * FROM auth_sessions
          WHERE session_id_hash = ? AND revoked_at IS NULL
        `,
      )
      .get(sessionIdHash) as StoredRow | undefined;
    const session = rowToSession(row);
    if (!session) return null;
    if (Date.parse(session.expiresAt) <= now.getTime()) {
      this.database
        .prepare(
          "UPDATE auth_sessions SET revoked_at = ? WHERE session_id_hash = ? AND revoked_at IS NULL",
        )
        .run(nowIso(now), sessionIdHash);
      return null;
    }
    const lastSeenAt = nowIso(now);
    this.database
      .prepare(
        "UPDATE auth_sessions SET last_seen_at = ? WHERE session_id_hash = ?",
      )
      .run(lastSeenAt, sessionIdHash);
    return { ...session, lastSeenAt };
  }

  revokeSession(token: string, revokedAt = new Date()): AuthSession | null {
    if (!token.trim()) return null;
    const sessionIdHash = hashSessionToken(token);
    const row = this.database
      .prepare(
        "SELECT * FROM auth_sessions WHERE session_id_hash = ? AND revoked_at IS NULL",
      )
      .get(sessionIdHash) as StoredRow | undefined;
    const session = rowToSession(row);
    if (!session) return null;
    this.database
      .prepare(
        "UPDATE auth_sessions SET revoked_at = ? WHERE session_id_hash = ? AND revoked_at IS NULL",
      )
      .run(nowIso(revokedAt), sessionIdHash);
    return session;
  }

  recordAudit(event: AuthAuditEvent, createdAt = new Date()): void {
    this.database
      .prepare(
        `
          INSERT INTO auth_audit_events
            (audit_id, event_type, address, account_id, session_id_hash, action, success, metadata_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        randomUUID(),
        event.eventType,
        event.address,
        event.accountId,
        event.sessionIdHash,
        event.action,
        event.success ? 1 : 0,
        JSON.stringify(event.metadata ?? {}),
        nowIso(createdAt),
      );
  }

  countAuditEvents(): number {
    const row = this.database
      .prepare("SELECT COUNT(*) AS event_count FROM auth_audit_events")
      .get() as { event_count: number };
    return Number(row.event_count);
  }

  close(): void {
    this.database.close();
  }
}

let singleton: AuthStore | null = null;

export function getAuthStore(): AuthStore {
  singleton ??= new AuthStore();
  return singleton;
}

export function hashAuthSessionToken(token: string): string {
  return hashSessionToken(token);
}
