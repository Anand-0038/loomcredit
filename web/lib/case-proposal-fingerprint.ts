import { createHash } from "node:crypto";

import type { PublicProposal } from "./case-proposal";

export function proposalFingerprint(proposal: PublicProposal): string {
  return createHash("sha256").update(JSON.stringify(proposal)).digest("hex");
}
