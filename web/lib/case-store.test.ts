import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CaseStore, canTransitionCaseStatus } from "./case-store";

const tempPaths: string[] = [];

afterEach(() => {
  for (const path of tempPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("finance case store", () => {
  it("keeps requested terms separate from worker evidence state", () => {
    const directory = mkdtempSync(join(tmpdir(), "loomcredit-cases-"));
    tempPaths.push(directory);
    const store = new CaseStore(join(directory, "cases.sqlite"));
    const created = store.create({
      caseId: "11111111-1111-4111-8111-111111111111",
      sourceTxHash: `0x${"aa".repeat(32)}`,
      requestedAdvanceBps: 3_000,
      deliveryDays: 30,
      role: "lender",
      accountId: "account-1",
      address: `0x${"bb".repeat(20)}`,
    });

    expect(created).toMatchObject({
      requestedAdvanceBps: 3_000,
      deliveryDays: 30,
      status: "SUBMITTED",
      accountId: "account-1",
    });
    expect(store.findBySourceTxHash(created.sourceTxHash)?.caseId).toBe(
      created.caseId,
    );
    expect(store.updateStatus(created.caseId, "PROCESSING").status).toBe(
      "PROCESSING",
    );
    expect(
      store.updateWorkerRequestId(created.caseId, "worker-request-0001"),
    ).toMatchObject({ workerRequestId: "worker-request-0001" });
    store.close();
  });

  it("stores new source hashes canonically while keeping lookup case-insensitive", () => {
    const directory = mkdtempSync(join(tmpdir(), "loomcredit-case-hash-"));
    tempPaths.push(directory);
    const store = new CaseStore(join(directory, "cases.sqlite"));
    const mixedCaseHash = `0x${"Aa".repeat(32)}`;
    const created = store.create({
      caseId: "22222222-2222-4222-8222-222222222222",
      sourceTxHash: mixedCaseHash,
      requestedAdvanceBps: 2_500,
      deliveryDays: 45,
      role: "marketplace",
      accountId: "account-2",
      address: `0x${"cc".repeat(20)}`,
    });

    expect(created.sourceTxHash).toBe(mixedCaseHash.toLowerCase());
    expect(store.findBySourceTxHash(mixedCaseHash.toUpperCase())).toMatchObject(
      {
        caseId: created.caseId,
        sourceTxHash: mixedCaseHash.toLowerCase(),
      },
    );
    store.close();
  });

  it("lists only the signed-in account's cases and persists the latest proposal", () => {
    const directory = mkdtempSync(join(tmpdir(), "loomcredit-case-list-"));
    tempPaths.push(directory);
    const store = new CaseStore(join(directory, "cases.sqlite"));
    const first = store.create({
      caseId: "33333333-3333-4333-8333-333333333333",
      sourceTxHash: `0x${"dd".repeat(32)}`,
      requestedAdvanceBps: 3_000,
      deliveryDays: 30,
      role: "lender",
      accountId: "account-3",
      address: `0x${"ee".repeat(20)}`,
    });
    store.create({
      caseId: "44444444-4444-4444-8444-444444444444",
      sourceTxHash: `0x${"ff".repeat(32)}`,
      requestedAdvanceBps: 2_000,
      deliveryDays: 45,
      role: "marketplace",
      accountId: "account-other",
      address: `0x${"aa".repeat(20)}`,
    });

    const proposal = {
      boundary: "LIVE_PROPOSAL",
      requestId: first.workerRequestId,
      decision: "REFER",
      reason: "model unavailable",
    };
    store.saveProposal(first.caseId, proposal);

    expect(store.listForAccount("account-3")).toHaveLength(1);
    expect(store.listForAccount("account-3")[0]?.caseId).toBe(first.caseId);
    expect(store.listForAccount("account-other")[0]?.caseId).not.toBe(
      first.caseId,
    );
    expect(store.getProposal(first.caseId)).toEqual(proposal);
    expect(store.clearProposal(first.caseId).caseId).toBe(first.caseId);
    expect(store.getProposal(first.caseId)).toBeNull();
    store.close();
  });

  it("does not regress completed or terminal cases from stale worker responses", () => {
    const directory = mkdtempSync(join(tmpdir(), "loomcredit-case-state-"));
    tempPaths.push(directory);
    const store = new CaseStore(join(directory, "cases.sqlite"));
    const completed = store.create({
      caseId: "55555555-5555-4555-8555-555555555555",
      sourceTxHash: `0x${"11".repeat(32)}`,
      requestedAdvanceBps: 3_000,
      deliveryDays: 30,
      role: "lender",
      accountId: "account-5",
      address: `0x${"12".repeat(20)}`,
    });
    store.updateStatus(completed.caseId, "PROCESSING");
    store.updateStatus(completed.caseId, "COMPLETED");
    expect(
      store.updateStatus(completed.caseId, "WORKER_UNAVAILABLE").status,
    ).toBe("COMPLETED");

    const terminal = store.create({
      caseId: "66666666-6666-4666-8666-666666666666",
      sourceTxHash: `0x${"13".repeat(32)}`,
      requestedAdvanceBps: 3_000,
      deliveryDays: 30,
      role: "lender",
      accountId: "account-6",
      address: `0x${"14".repeat(20)}`,
    });
    store.updateStatus(terminal.caseId, "FAILED_TERMINAL");
    expect(store.updateStatus(terminal.caseId, "PROCESSING").status).toBe(
      "FAILED_TERMINAL",
    );

    expect(canTransitionCaseStatus("PROCESSING", "COMPLETED")).toBe(true);
    expect(canTransitionCaseStatus("COMPLETED", "PROCESSING")).toBe(false);
    store.close();
  });

  it("keeps human review append-only and bound to the reviewed proposal", () => {
    const directory = mkdtempSync(join(tmpdir(), "loomcredit-case-review-"));
    tempPaths.push(directory);
    const store = new CaseStore(join(directory, "cases.sqlite"));
    const financeCase = store.create({
      caseId: "77777777-7777-4777-8777-777777777777",
      sourceTxHash: `0x${"15".repeat(32)}`,
      requestedAdvanceBps: 3_000,
      deliveryDays: 30,
      role: "lender",
      accountId: "account-7",
      address: `0x${"16".repeat(20)}`,
    });
    const evidenceId = `0x${"17".repeat(32)}`;
    store.appendReview({
      reviewId: "88888888-8888-4888-8888-888888888888",
      caseId: financeCase.caseId,
      decision: "REFER_FOR_INFORMATION",
      note: "Confirm the buyer guarantee owner.",
      actorAccountId: "account-7",
      actorAddress: `0x${"16".repeat(20)}`,
      proposalEvidenceId: evidenceId,
      proposalFingerprint: "a".repeat(64),
      proposalDecision: "REFER",
    });
    store.appendReview({
      reviewId: "99999999-9999-4999-8999-999999999999",
      caseId: financeCase.caseId,
      decision: "DECLINE_CASE",
      note: "Requested information was not supplied.",
      actorAccountId: "account-7",
      actorAddress: `0x${"16".repeat(20)}`,
      proposalEvidenceId: evidenceId,
      proposalFingerprint: "b".repeat(64),
      proposalDecision: "REFER",
    });

    expect(store.listReviews(financeCase.caseId)).toHaveLength(2);
    expect(store.latestReview(financeCase.caseId)).toMatchObject({
      decision: "DECLINE_CASE",
      proposalEvidenceId: evidenceId,
      proposalFingerprint: "b".repeat(64),
    });
    expect(store.listReviews(financeCase.caseId)[1]).toMatchObject({
      decision: "REFER_FOR_INFORMATION",
      note: "Confirm the buyer guarantee owner.",
    });
    store.close();
  });
});
