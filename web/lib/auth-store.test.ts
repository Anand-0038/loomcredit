import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AuthStore, AuthStoreError } from "./auth-store";

const tempPaths: string[] = [];
const stores: AuthStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const path of tempPaths.splice(0))
    rmSync(path, { recursive: true, force: true });
});

function createStore(): AuthStore {
  const directory = mkdtempSync(join(tmpdir(), "loomcredit-auth-"));
  tempPaths.push(directory);
  const store = new AuthStore(join(directory, "auth.sqlite"));
  stores.push(store);
  return store;
}

function expectStoreError(
  action: () => void,
  code: AuthStoreError["code"],
): void {
  try {
    action();
    throw new Error("Expected the auth store operation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(AuthStoreError);
    expect((error as AuthStoreError).code).toBe(code);
  }
}

describe("auth store", () => {
  it("claims a nonce once and rejects replay", () => {
    const store = createStore();
    const issuedAt = new Date("2026-08-08T00:00:00.000Z");
    const nonce = store.createNonce({
      nonce: "a".repeat(32),
      address: `0x${"11".repeat(20)}`,
      chainId: 11155111,
      message: "sign-in message",
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + 300_000),
    });

    expect(
      store.claimNonce(nonce.nonce, nonce.address, nonce.message, issuedAt),
    ).toEqual(expect.objectContaining({ attempts: 1, usedAt: null }));
    expect(store.markNonceUsed(nonce.nonce, issuedAt)).toBe(true);
    expectStoreError(
      () =>
        store.claimNonce(nonce.nonce, nonce.address, nonce.message, issuedAt),
      "NONCE_USED",
    );
  });

  it("limits failed verification attempts before refusing the nonce", () => {
    const store = createStore();
    const issuedAt = new Date("2026-08-08T00:00:00.000Z");
    const address = `0x${"22".repeat(20)}`;
    const nonce = store.createNonce({
      nonce: "b".repeat(32),
      address,
      chainId: 11155111,
      message: "sign-in message",
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + 300_000),
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(
        store.claimNonce(nonce.nonce, address, nonce.message, issuedAt),
      ).toEqual(expect.objectContaining({ attempts: attempt + 1 }));
    }
    expectStoreError(
      () => store.claimNonce(nonce.nonce, address, nonce.message, issuedAt),
      "NONCE_ATTEMPTS_EXCEEDED",
    );
  });

  it("prunes expired and consumed nonces while retaining active ones", () => {
    const store = createStore();
    const now = new Date("2026-08-08T00:10:00.000Z");
    const address = `0x${"44".repeat(20)}`;
    const create = (nonce: string, expiresAt: Date) =>
      store.createNonce({
        nonce,
        address,
        chainId: 11155111,
        message: `message-${nonce}`,
        issuedAt: new Date("2026-08-08T00:00:00.000Z"),
        expiresAt,
      });
    const expired = create(
      "c".repeat(32),
      new Date("2026-08-08T00:05:00.000Z"),
    );
    const consumed = create(
      "d".repeat(32),
      new Date("2026-08-08T00:15:00.000Z"),
    );
    const active = create("e".repeat(32), new Date("2026-08-08T00:15:00.000Z"));
    expect(store.markNonceUsed(consumed.nonce, now)).toBe(true);

    expect(store.pruneExpiredNonces(now)).toBe(2);
    expect(store.getNonce(expired.nonce)).toBeNull();
    expect(store.getNonce(consumed.nonce)).toBeNull();
    expect(store.getNonce(active.nonce)).toEqual(
      expect.objectContaining({ nonce: active.nonce }),
    );
  });

  it("stores only a hash of the opaque session token and revokes it", () => {
    const store = createStore();
    const createdAt = new Date();
    const account = store.findOrCreateAccount(
      `0x${"33".repeat(20)}`,
      "viewer",
      createdAt,
    );
    const created = store.createSession(account, 3_600, createdAt);

    expect(created.token).not.toBe(created.session.sessionIdHash);
    expect(store.getSession(created.token)?.accountId).toBe(account.accountId);
    expect(store.revokeSession(created.token)).toEqual(
      expect.objectContaining({ accountId: account.accountId }),
    );
    expect(store.getSession(created.token)).toBeNull();

    store.recordAudit({
      eventType: "PRIVILEGED_ACTION",
      address: account.address,
      accountId: account.accountId,
      sessionIdHash: created.session.sessionIdHash,
      action: "test.action",
      success: true,
    });
    expect(store.countAuditEvents()).toBe(1);
  });
});
