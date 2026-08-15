import { EvidencePacketSchema, type EvidencePacket } from "@loomcredit/shared";

export function parseEvidencePacket(input: unknown): EvidencePacket {
  const parsed = EvidencePacketSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Evidence packet rejected: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function hasVerifiedEvidence(packet: EvidencePacket): boolean {
  // Local fixtures are intentionally usable by the demo lab only. They must
  // never become eligible for a model-backed quote or an EIP-712 signature.
  return packet.proofStatus === "LIVE_VERIFIED";
}
