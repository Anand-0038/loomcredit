import { randomUUID } from "node:crypto";

import { createEvent, sourceEventKey } from "./event.js";
import { isTerminalWorkerError } from "./errors.js";
import {
  UscProofClient,
  type SourceInspection,
  type SourceOrderEvent,
  type SourceProof,
} from "./proof.js";
import {
  CreditcoinSubmitter,
  type CreditcoinSubmission,
  type SubmissionBroadcastHandler,
} from "./submit.js";
import type { WorkerConfig } from "./config.js";
import { EventStore, type CrossChainEvent } from "./store.js";

export interface ProcessLogger {
  log(...values: unknown[]): void;
  error(...values: unknown[]): void;
}

type ProofStatus = "WAITING_FOR_ATTESTATION" | "PROOF_REQUESTED";
const PROCESS_LEASE_TTL_MS = 15 * 60 * 1_000;

export interface ProcessorProofClient {
  inspectTransaction(
    sourceTxHash: string,
    expectedOrderId?: string,
    expectedEventType?: SourceOrderEvent["eventType"],
  ): Promise<SourceInspection>;
  getProof(
    inspection: SourceInspection,
    onStatus?: (status: ProofStatus) => void,
  ): Promise<SourceProof>;
}

export interface ProcessorSubmitter {
  findExisting(
    orderId: string,
    eventType?: SourceOrderEvent["eventType"],
  ): Promise<CreditcoinSubmission | null>;
  confirm(
    transactionHash: string,
    orderId: string,
    eventType?: SourceOrderEvent["eventType"],
  ): Promise<CreditcoinSubmission>;
  submit(
    proof: SourceProof,
    event: SourceOrderEvent,
    onBroadcast?: SubmissionBroadcastHandler,
  ): Promise<CreditcoinSubmission>;
}

export interface ProcessorDependencies {
  createProofClient?: (config: WorkerConfig) => ProcessorProofClient;
  createSubmitter?: (config: WorkerConfig) => ProcessorSubmitter;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTransactionHash(value: string | undefined): value is string {
  return Boolean(value && /^0x[a-fA-F0-9]{64}$/.test(value));
}

export function isTerminalProcessingError(error: unknown): boolean {
  return isTerminalWorkerError(error);
}

export async function processTransaction(
  sourceTxHash: string,
  config: WorkerConfig,
  store: EventStore,
  logger: ProcessLogger = console,
  dependencies: ProcessorDependencies = {},
  expectedOrderId?: string,
  expectedEventType?: SourceOrderEvent["eventType"],
): Promise<number> {
  if (!isTransactionHash(sourceTxHash)) {
    logger.error(
      "USAGE: process-tx <0x-prefixed 32-byte source transaction hash>",
    );
    return 1;
  }

  const leaseOwner = randomUUID();
  const leaseName = [
    "source-event",
    sourceTxHash.toLowerCase(),
    expectedOrderId?.toLowerCase() ?? "unknown-order",
    expectedEventType ?? "unknown-event",
  ].join(":");
  if (!store.acquireLease(leaseName, leaseOwner, PROCESS_LEASE_TTL_MS)) {
    logger.error(`PROCESS_BUSY_RETRYABLE: ${sourceTxHash}`);
    return 1;
  }

  let event: CrossChainEvent | null = null;
  try {
    const proofClient =
      dependencies.createProofClient?.(config) ?? new UscProofClient(config);
    const inspection = await proofClient.inspectTransaction(
      sourceTxHash,
      expectedOrderId,
      expectedEventType,
    );
    const eventKey = sourceEventKey(
      config.sourceChainKey,
      sourceTxHash,
      inspection.event.orderId,
      inspection.event.sourceEmitter,
      inspection.event.eventType,
    );
    const candidate =
      store.getBySourceEventKey(eventKey) ?? store.get(sourceTxHash);
    if (
      candidate &&
      candidate.orderId.toLowerCase() ===
        inspection.event.orderId.toLowerCase() &&
      candidate.eventType === inspection.event.eventType &&
      (candidate.sourceEmitter === null ||
        candidate.sourceEmitter.toLowerCase() ===
          inspection.event.sourceEmitter.toLowerCase())
    ) {
      event =
        candidate.sourceEventKey === eventKey
          ? candidate
          : store.rekeyEvent(candidate.sourceEventKey, {
              ...candidate,
              sourceEventKey: eventKey,
              sourceEmitter: inspection.event.sourceEmitter,
              updatedAt: new Date().toISOString(),
            });
    }
    if (!event) {
      event = store.upsert(
        createEvent(
          sourceTxHash,
          config.sourceChainKey,
          inspection.event.orderId,
          inspection.event.blockHeight,
          inspection.event.txIndex,
          inspection.event.logIndex,
          inspection.event.sourceEmitter,
          inspection.event.eventType,
        ),
      );
    }
    // A watcher discovers logs with a block-wide log index, while the USC
    // contract needs the receipt-local position. Refresh the durable record
    // from the mined receipt before any proof submission or status response.
    if (
      event.blockHeight !== inspection.event.blockHeight ||
      event.txIndex !== inspection.event.txIndex ||
      event.logIndex !== inspection.event.logIndex ||
      event.sourceEmitter !== inspection.event.sourceEmitter
    ) {
      event = store.updateSourcePositionBySourceEventKey(event.sourceEventKey, {
        blockHeight: inspection.event.blockHeight,
        txIndex: inspection.event.txIndex,
        logIndex: inspection.event.logIndex,
        sourceEmitter: inspection.event.sourceEmitter,
      });
    }
    if (event.stage === "VERIFIED") {
      logger.log(
        JSON.stringify(
          { stage: event.stage, sourceTxHash, evidenceId: event.evidenceId },
          null,
          2,
        ),
      );
      return 0;
    }

    const submitter =
      dependencies.createSubmitter?.(config) ?? new CreditcoinSubmitter(config);

    // A broadcast hash is authoritative for idempotency. Reconfirm it before
    // considering a new submission, including after FAILED_RETRYABLE.
    const existingCreditcoinTxHash = event.creditcoinTxHash;
    if (existingCreditcoinTxHash) {
      if (event.stage !== "CREDITCOIN_SUBMITTED") {
        event = store.updateStageBySourceEventKey(
          event.sourceEventKey,
          "CREDITCOIN_SUBMITTED",
          {
            lastError: null,
          },
        );
      }
      const confirmed = await submitter.confirm(
        existingCreditcoinTxHash,
        inspection.event.orderId,
        inspection.event.eventType,
      );
      const verified = store.updateStageBySourceEventKey(
        event.sourceEventKey,
        "VERIFIED",
        {
          evidenceId: confirmed.evidenceId,
        },
      );
      logger.log(
        JSON.stringify(
          {
            stage: verified.stage,
            sourceTxHash,
            creditcoinTxHash: verified.creditcoinTxHash,
            evidenceId: verified.evidenceId,
            boundary: "LIVE_USC_WORKER",
          },
          null,
          2,
        ),
      );
      return 0;
    }

    // This scan closes the recovery gap for a process that broadcast before
    // its local row was updated. It is optional until a deployment start block
    // is configured; the immediate broadcast checkpoint above remains the
    // primary crash-safe path.
    if (config.creditcoinStartBlock !== null) {
      const existingSubmission = await submitter.findExisting(
        inspection.event.orderId,
        inspection.event.eventType,
      );
      if (existingSubmission) {
        if (event.stage !== "CREDITCOIN_SUBMITTED") {
          event = store.updateStageBySourceEventKey(
            event.sourceEventKey,
            "CREDITCOIN_SUBMITTED",
            {
              creditcoinTxHash: existingSubmission.transactionHash,
              evidenceId: existingSubmission.evidenceId,
              lastError: null,
            },
          );
        } else {
          store.upsert({
            ...event,
            creditcoinTxHash: existingSubmission.transactionHash,
            evidenceId: existingSubmission.evidenceId,
            lastError: null,
            updatedAt: new Date().toISOString(),
          });
        }
        const verified = store.updateStageBySourceEventKey(
          event.sourceEventKey,
          "VERIFIED",
        );
        logger.log(
          JSON.stringify(
            {
              stage: verified.stage,
              sourceTxHash,
              creditcoinTxHash: verified.creditcoinTxHash,
              evidenceId: verified.evidenceId,
              boundary: "LIVE_USC_WORKER_RECONCILED",
            },
            null,
            2,
          ),
        );
        return 0;
      }
    }

    event = store.updateStageBySourceEventKey(
      event.sourceEventKey,
      "WAITING_FOR_ATTESTATION",
    );
    const proof = await proofClient.getProof(inspection, (status) => {
      const current = store.getBySourceEventKey(event!.sourceEventKey);
      if (current && current.stage !== status)
        store.updateStageBySourceEventKey(current.sourceEventKey, status);
    });
    event = store.updateStageBySourceEventKey(
      event.sourceEventKey,
      "PROOF_READY",
    );
    const submission = await submitter.submit(
      proof,
      inspection.event,
      async (transactionHash) => {
        event = store.updateStageBySourceEventKey(
          event!.sourceEventKey,
          "CREDITCOIN_SUBMITTED",
          {
            creditcoinTxHash: transactionHash,
            evidenceId: null,
            lastError: null,
          },
        );
      },
    );
    event = store.updateStageBySourceEventKey(
      event.sourceEventKey,
      "CREDITCOIN_SUBMITTED",
      {
        creditcoinTxHash: submission.transactionHash,
        evidenceId: submission.evidenceId,
        lastError: null,
      },
    );
    const verified = store.updateStageBySourceEventKey(
      event.sourceEventKey,
      "VERIFIED",
    );
    logger.log(
      JSON.stringify(
        {
          stage: verified.stage,
          sourceTxHash,
          creditcoinTxHash: verified.creditcoinTxHash,
          evidenceId: verified.evidenceId,
          boundary: "LIVE_USC_WORKER",
        },
        null,
        2,
      ),
    );
    return 0;
  } catch (error) {
    const message = errorMessage(error);
    const terminal = isTerminalProcessingError(error);
    if (event) {
      const current = store.getBySourceEventKey(event.sourceEventKey);
      if (
        current &&
        current.stage !== "VERIFIED" &&
        current.stage !== "FAILED_TERMINAL"
      ) {
        try {
          store.updateStageBySourceEventKey(
            current.sourceEventKey,
            terminal ? "FAILED_TERMINAL" : "FAILED_RETRYABLE",
            {
              lastError: message,
            },
          );
        } catch {
          // Preserve the original processing error in the CLI output.
        }
      }
    }
    logger.error(
      `PROCESS_FAILED_${terminal ? "TERMINAL" : "RETRYABLE"}: ${message}`,
    );
    return 1;
  } finally {
    store.releaseLease(leaseName, leaseOwner);
  }
}
