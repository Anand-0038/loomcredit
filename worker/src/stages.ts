export const EVENT_STAGES = [
  "DETECTED",
  "WAITING_FOR_ATTESTATION",
  "PROOF_REQUESTED",
  "PROOF_READY",
  "CREDITCOIN_SUBMITTED",
  "VERIFIED",
  "FAILED_RETRYABLE",
  "FAILED_TERMINAL",
] as const;

export type EventStage = (typeof EVENT_STAGES)[number];

const transitions: Record<EventStage, readonly EventStage[]> = {
  DETECTED: [
    "DETECTED",
    "WAITING_FOR_ATTESTATION",
    "CREDITCOIN_SUBMITTED",
    "FAILED_RETRYABLE",
    "FAILED_TERMINAL",
  ],
  WAITING_FOR_ATTESTATION: [
    "WAITING_FOR_ATTESTATION",
    "PROOF_REQUESTED",
    "CREDITCOIN_SUBMITTED",
    "FAILED_RETRYABLE",
    "FAILED_TERMINAL",
  ],
  PROOF_REQUESTED: [
    "PROOF_REQUESTED",
    "WAITING_FOR_ATTESTATION",
    "PROOF_READY",
    "CREDITCOIN_SUBMITTED",
    "FAILED_RETRYABLE",
    "FAILED_TERMINAL",
  ],
  PROOF_READY: [
    "PROOF_READY",
    "WAITING_FOR_ATTESTATION",
    "CREDITCOIN_SUBMITTED",
    "FAILED_RETRYABLE",
    "FAILED_TERMINAL",
  ],
  CREDITCOIN_SUBMITTED: [
    "CREDITCOIN_SUBMITTED",
    "VERIFIED",
    "FAILED_RETRYABLE",
    "FAILED_TERMINAL",
  ],
  VERIFIED: ["VERIFIED"],
  FAILED_RETRYABLE: [
    "FAILED_RETRYABLE",
    "WAITING_FOR_ATTESTATION",
    "PROOF_REQUESTED",
    "CREDITCOIN_SUBMITTED",
    "FAILED_TERMINAL",
  ],
  FAILED_TERMINAL: ["FAILED_TERMINAL"],
};

export class InvalidStageTransitionError extends Error {
  constructor(from: EventStage, to: EventStage) {
    super(`Invalid event stage transition: ${from} -> ${to}`);
    this.name = "InvalidStageTransitionError";
  }
}

export function canTransition(from: EventStage, to: EventStage): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: EventStage, to: EventStage): void {
  if (!canTransition(from, to)) throw new InvalidStageTransitionError(from, to);
}
