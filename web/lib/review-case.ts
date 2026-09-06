export type ReviewCaseStatus = "recorded" | "not_found";

export interface RecordedReviewCase {
  orderId: string;
  evidenceId: string;
  orderValueMinor: number;
  guaranteeAmountMinor: number;
  sourceChain: string;
  sourceBlock: number;
  verifiedAt: string;
  sourceTransactionExplorer: string;
  creditcoinTransactionExplorer: string;
}

export function normalizeOrderReference(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveReviewCase(
  reference: string,
  recordedOrderId: string,
  recordedEvidenceId?: string,
): ReviewCaseStatus {
  const normalizedReference = normalizeOrderReference(reference);
  if (
    normalizedReference.length > 0 &&
    [recordedOrderId, recordedEvidenceId]
      .filter((value): value is string => Boolean(value))
      .some((value) => normalizedReference === normalizeOrderReference(value))
  ) {
    return "recorded";
  }

  return "not_found";
}
