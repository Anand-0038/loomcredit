import { describe, expect, it } from "vitest";

import type { PublicProposal } from "./case-proposal";
import { proposalFingerprint } from "./case-proposal-fingerprint";

describe("proposal fingerprint", () => {
  it("is stable for the same proposal and changes with reviewed terms", () => {
    const proposal = {
      boundary: "LIVE_PROPOSAL",
      evidenceId: `0x${"aa".repeat(32)}`,
      decision: "APPROVED",
      terms: { quotedAdvanceBps: 3_000 },
    } as unknown as PublicProposal;

    expect(proposalFingerprint(proposal)).toMatch(/^[a-f0-9]{64}$/);
    expect(proposalFingerprint(proposal)).toBe(proposalFingerprint(proposal));
    expect(
      proposalFingerprint({
        ...proposal,
        terms: { ...proposal.terms, quotedAdvanceBps: 3_100 },
      }),
    ).not.toBe(proposalFingerprint(proposal));
  });
});
