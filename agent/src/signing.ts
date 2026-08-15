import { keccak256, stringToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { FacilityQuote } from "@loomcredit/shared";

const quoteTypes = {
  FacilityQuote: [
    { name: "orderId", type: "bytes32" },
    { name: "decision", type: "bytes32" },
    { name: "advanceBps", type: "uint16" },
    { name: "feeBps", type: "uint16" },
    { name: "expiresAt", type: "uint64" },
    { name: "evidenceId", type: "bytes32" },
    { name: "reasonCodesHash", type: "bytes32" },
    { name: "policyVersion", type: "bytes32" },
    { name: "modelVersion", type: "bytes32" },
    { name: "nonce", type: "uint64" },
  ],
} as const;

export interface RiskGuardQuote {
  orderId: Hex;
  decision: Hex;
  advanceBps: number;
  feeBps: number;
  expiresAt: bigint;
  evidenceId: Hex;
  reasonCodesHash: Hex;
  policyVersion: Hex;
  modelVersion: Hex;
  nonce: bigint;
}

export function hashReasonCodes(reasonCodes: readonly string[]): Hex {
  return keccak256(stringToHex(reasonCodes.join("|")));
}

export function hashVersion(version: string): Hex {
  return keccak256(stringToHex(version));
}

export function toRiskGuardQuote(
  quote: FacilityQuote,
  orderId: Hex,
  reasonCodesHash: Hex,
  policyVersionHash: Hex,
  modelVersionHash: Hex,
): RiskGuardQuote {
  const evidenceId = quote.evidenceIds[0];
  if (!evidenceId) throw new Error("Quote must contain an evidence ID");
  return {
    orderId,
    decision: keccak256(stringToHex(quote.decision)),
    advanceBps: quote.advanceBps,
    feeBps: quote.feeBps,
    expiresAt: BigInt(quote.expiresAt),
    evidenceId: evidenceId as Hex,
    reasonCodesHash,
    policyVersion: policyVersionHash,
    modelVersion: modelVersionHash,
    nonce: BigInt(quote.nonce ?? 0),
  };
}

export async function signQuote(
  quote: FacilityQuote,
  orderId: Hex,
  privateKey: Hex,
  chainId: number,
  verifyingContract: Hex,
  reasonCodesHash: Hex,
  policyVersionHash: Hex,
  modelVersionHash: Hex,
): Promise<{ signer: string; signature: Hex }> {
  const account = privateKeyToAccount(privateKey);
  const riskGuardQuote = toRiskGuardQuote(
    quote,
    orderId,
    reasonCodesHash,
    policyVersionHash,
    modelVersionHash,
  );
  const signature = await account.signTypedData({
    domain: {
      name: "LoomCredit RiskGuard",
      version: "1",
      chainId,
      verifyingContract,
    },
    types: quoteTypes,
    primaryType: "FacilityQuote",
    message: riskGuardQuote,
  });
  return { signer: account.address, signature };
}
