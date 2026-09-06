import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { ConfigError } from "./config.js";
import {
  INTAKE_PROCESSING_STALE_MS,
  type CrossChainEvent,
  type EventStore,
  type IntakeRequest,
  type SourceOrderDetails,
} from "./store.js";
import type { SourceEventType } from "./event.js";

const BYTES32_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const TX_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const REQUEST_ID_PATTERN = /^[0-9a-fA-F-]{16,80}$/;
const PUBLIC_EVENT_LIMIT = 100;
const MAX_MUTATION_BODY_BYTES = 8 * 1024;

export interface StatusServerOptions {
  host: string;
  port: number;
  allowedOrigin?: string;
}

export interface IntakeProcessInput {
  requestId: string;
  sourceTxHash: string;
  expectedOrderId: string | null;
  expectedEventType: SourceEventType;
}

export interface ProposalProcessInput {
  requestId: string;
  sourceTxHash: string;
  requestedAdvanceBps: number;
  deliveryDays: number;
  event: CrossChainEvent;
}

export interface ProposalProcessOutput {
  statusCode: 200 | 422 | 502 | 503;
  payload: unknown;
}

export interface StatusServerHandlers {
  processIntake?: (input: IntakeProcessInput) => Promise<number>;
  processProposal?: (
    input: ProposalProcessInput,
  ) => Promise<ProposalProcessOutput>;
}

export interface PublicEventStatus {
  sourceEventKey: string;
  sourceTxHash: string;
  sourceChainKey: number;
  sourceEmitter: string | null;
  orderId: string;
  eventType: CrossChainEvent["eventType"];
  txIndex: number | null;
  logIndex: number;
  stage: CrossChainEvent["stage"];
  proofStatus: "LIVE_VERIFIED" | "PENDING" | "FAILED";
  evidenceId: string | null;
  creditcoinTxHash: string | null;
  retryCount: number;
  blockHeight: number | null;
  sourceOrder: SourceOrderDetails | null;
  provenance: CrossChainEvent["provenance"];
  stageTimestamps: CrossChainEvent["stageTimestamps"];
  createdAt: string;
  updatedAt: string;
}

export interface PublicIntakeStatus {
  requestId: string;
  sourceTxHash: string;
  expectedOrderId: string | null;
  expectedEventType: SourceEventType;
  status: IntakeRequest["status"];
  failureCode: IntakeRequest["failureCode"];
  order: PublicEventStatus | null;
  history: PublicEventStatus[];
  createdAt: string;
  updatedAt: string;
}

const boundary = "LIVE_EVIDENCE_STATUS_API" as const;

function parsePort(value: string | undefined): number {
  const candidate = value?.trim();
  if (!candidate) return 8_787;
  if (!/^\d+$/.test(candidate)) {
    throw new ConfigError("EVIDENCE_API_PORT must be a valid TCP port");
  }
  const port = Number(candidate);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ConfigError("EVIDENCE_API_PORT must be between 1 and 65535");
  }
  return port;
}

export function loadStatusServerOptions(
  env: NodeJS.ProcessEnv = process.env,
): StatusServerOptions {
  const allowedOrigin = env.EVIDENCE_API_ALLOWED_ORIGIN?.trim();
  const options: StatusServerOptions = {
    host: env.EVIDENCE_API_HOST?.trim() || "127.0.0.1",
    port: parsePort(env.EVIDENCE_API_PORT),
  };
  if (allowedOrigin) options.allowedOrigin = allowedOrigin;
  return options;
}

function proofStatus(
  stage: CrossChainEvent["stage"],
): PublicEventStatus["proofStatus"] {
  if (stage === "VERIFIED") return "LIVE_VERIFIED";
  if (stage === "FAILED_RETRYABLE" || stage === "FAILED_TERMINAL") {
    return "FAILED";
  }
  return "PENDING";
}

export function toPublicEventStatus(event: CrossChainEvent): PublicEventStatus {
  return {
    sourceEventKey: event.sourceEventKey,
    sourceTxHash: event.sourceTxHash,
    sourceChainKey: event.sourceChainKey,
    sourceEmitter: event.sourceEmitter,
    orderId: event.orderId,
    eventType: event.eventType,
    txIndex: event.txIndex,
    logIndex: event.logIndex,
    stage: event.stage,
    proofStatus: proofStatus(event.stage),
    evidenceId: event.evidenceId,
    creditcoinTxHash: event.creditcoinTxHash,
    retryCount: event.retryCount,
    blockHeight: event.blockHeight,
    sourceOrder: event.sourceOrder,
    provenance: event.provenance,
    stageTimestamps: event.stageTimestamps,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  options: StatusServerOptions,
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  if (options.allowedOrigin) {
    response.setHeader("access-control-allow-origin", options.allowedOrigin);
    response.setHeader("vary", "origin");
  }
  response.end(JSON.stringify(payload));
}

function handleOptions(
  response: ServerResponse,
  options: StatusServerOptions,
): void {
  response.statusCode = 204;
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
  if (options.allowedOrigin) {
    response.setHeader("access-control-allow-origin", options.allowedOrigin);
    response.setHeader("vary", "origin");
  }
  response.end();
}

function isBytes32(value: string | undefined): value is string {
  return Boolean(value && BYTES32_PATTERN.test(value));
}

function isTransactionHash(value: unknown): value is string {
  return typeof value === "string" && TX_HASH_PATTERN.test(value);
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

function isSourceEventType(value: unknown): value is SourceEventType {
  return (
    value === "ORDER_GUARANTEED" ||
    value === "ORDER_CANCELLED" ||
    value === "ORDER_DISPUTED" ||
    value === "ORDER_SETTLED"
  );
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

async function readMutationBody(request: IncomingMessage): Promise<unknown> {
  const declaredLength = request.headers["content-length"];
  if (declaredLength) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new Error("INVALID_REQUEST");
    }
    if (length > MAX_MUTATION_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_MUTATION_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("INVALID_REQUEST");
  }
}

function publicIntakeStatus(
  intake: IntakeRequest,
  store: EventStore,
): PublicIntakeStatus {
  const event = store.findEventForIntake(intake);
  const history = event
    ? store
        .listByOrderId(event.orderId, PUBLIC_EVENT_LIMIT)
        .map(toPublicEventStatus)
    : intake.expectedOrderId
      ? store
          .listByOrderId(intake.expectedOrderId, PUBLIC_EVENT_LIMIT)
          .map(toPublicEventStatus)
      : [];
  const status =
    event?.stage === "VERIFIED"
      ? "COMPLETED"
      : event?.stage === "FAILED_TERMINAL"
        ? "FAILED_TERMINAL"
        : event?.stage === "FAILED_RETRYABLE"
          ? "FAILED_RETRYABLE"
          : intake.status;
  return {
    requestId: intake.requestId,
    sourceTxHash: intake.sourceTxHash,
    expectedOrderId: intake.expectedOrderId,
    expectedEventType: intake.expectedEventType,
    status,
    failureCode: status.startsWith("FAILED") ? "PROCESSING_FAILED" : null,
    order: event ? toPublicEventStatus(event) : null,
    history,
    createdAt: intake.createdAt,
    updatedAt: intake.updatedAt,
  };
}

function intakeError(
  response: ServerResponse,
  options: StatusServerOptions,
  statusCode: 400 | 404 | 409 | 413 | 503,
  code: string,
  error: string,
): void {
  writeJson(response, statusCode, { boundary, code, error }, options);
}

function proposalError(
  response: ServerResponse,
  options: StatusServerOptions,
  statusCode: 400 | 404 | 409 | 413 | 422 | 503,
  code: string,
  error: string,
  extra: Record<string, unknown> = {},
): void {
  writeJson(response, statusCode, { boundary, code, error, ...extra }, options);
}

function scheduleIntake(
  input: IntakeProcessInput,
  store: EventStore,
  handlers: StatusServerHandlers,
  activeIntakes: Map<string, Promise<number>>,
): void {
  if (!handlers.processIntake || activeIntakes.has(input.sourceTxHash)) return;

  const intake = store.getIntakeRequest(input.requestId);
  if (!intake) return;
  store.updateIntakeRequest(input.requestId, "PROCESSING");
  const job = handlers
    .processIntake(input)
    .then((result) => {
      const event = store.findEventForIntake(input);
      if (event?.stage === "VERIFIED") {
        store.updateIntakeRequest(input.requestId, "COMPLETED");
      } else if (event?.stage === "FAILED_TERMINAL") {
        store.updateIntakeRequest(
          input.requestId,
          "FAILED_TERMINAL",
          "PROCESSING_FAILED",
        );
      } else {
        store.updateIntakeRequest(
          input.requestId,
          "FAILED_RETRYABLE",
          "PROCESSING_FAILED",
        );
      }
      return result;
    })
    .catch(() => {
      const event = store.findEventForIntake(input);
      store.updateIntakeRequest(
        input.requestId,
        event?.stage === "FAILED_TERMINAL"
          ? "FAILED_TERMINAL"
          : "FAILED_RETRYABLE",
        "PROCESSING_FAILED",
      );
      return 1;
    })
    .finally(() => {
      activeIntakes.delete(input.sourceTxHash);
    });
  activeIntakes.set(input.sourceTxHash, job);
}

function recoverStaleIntake(
  intake: IntakeRequest,
  store: EventStore,
  activeIntakes: Map<string, Promise<number>>,
): IntakeRequest {
  if (
    intake.status !== "PROCESSING" ||
    activeIntakes.has(intake.sourceTxHash)
  ) {
    return intake;
  }
  return store.recoverStaleIntake(
    intake.requestId,
    new Date(Date.now() - INTAKE_PROCESSING_STALE_MS).toISOString(),
  );
}

function routeNotFound(
  response: ServerResponse,
  options: StatusServerOptions,
): void {
  writeJson(response, 404, { error: "Status route not found" }, options);
}

export function handleStatusRequest(
  request: IncomingMessage,
  response: ServerResponse,
  store: EventStore,
  options: StatusServerOptions,
  handlers: StatusServerHandlers = {},
  activeIntakes = new Map<string, Promise<number>>(),
  activeProposals = new Map<string, Promise<ProposalProcessOutput>>(),
): Promise<void> {
  if (request.method === "OPTIONS") {
    handleOptions(response, options);
    return Promise.resolve();
  }
  if (request.method === "POST") {
    if (!isLoopbackHost(options.host)) {
      intakeError(
        response,
        options,
        503,
        "MUTATION_REQUIRES_LOOPBACK",
        "Source intake mutations are enabled only on the worker loopback interface.",
      );
      return Promise.resolve();
    }
    if (request.url?.split("?", 1)[0] === "/v1/proposals") {
      if (!handlers.processProposal) {
        proposalError(
          response,
          options,
          503,
          "PROPOSAL_NOT_CONFIGURED",
          "The worker proposal boundary is not configured.",
        );
        return Promise.resolve();
      }
      return readMutationBody(request)
        .then(async (body) => {
          if (typeof body !== "object" || body === null) {
            proposalError(
              response,
              options,
              400,
              "INVALID_REQUEST",
              "A JSON object is required.",
            );
            return;
          }
          const input = body as Record<string, unknown>;
          const requestId = isRequestId(input.requestId) ? input.requestId : "";
          const sourceTxHash =
            typeof input.sourceTxHash === "string"
              ? input.sourceTxHash.trim().toLowerCase()
              : "";
          const requestedAdvanceBps = input.requestedAdvanceBps;
          const deliveryDays = input.deliveryDays;
          if (!requestId) {
            proposalError(
              response,
              options,
              400,
              "INVALID_REQUEST_ID",
              "requestId is required.",
            );
            return;
          }
          if (!isTransactionHash(sourceTxHash)) {
            proposalError(
              response,
              options,
              400,
              "INVALID_SOURCE_TRANSACTION",
              "sourceTxHash must be a 32-byte hexadecimal transaction hash.",
            );
            return;
          }
          if (
            typeof requestedAdvanceBps !== "number" ||
            !Number.isSafeInteger(requestedAdvanceBps) ||
            requestedAdvanceBps < 0 ||
            requestedAdvanceBps > 10_000
          ) {
            proposalError(
              response,
              options,
              400,
              "INVALID_ADVANCE",
              "requestedAdvanceBps must be an integer between 0 and 10000.",
            );
            return;
          }
          if (
            typeof deliveryDays !== "number" ||
            !Number.isSafeInteger(deliveryDays) ||
            deliveryDays < 0 ||
            deliveryDays > 365
          ) {
            proposalError(
              response,
              options,
              400,
              "INVALID_DELIVERY_DAYS",
              "deliveryDays must be an integer between 0 and 365.",
            );
            return;
          }
          const intake = store.getIntakeRequest(requestId);
          if (
            !intake ||
            intake.sourceTxHash.toLowerCase() !== sourceTxHash.toLowerCase()
          ) {
            proposalError(
              response,
              options,
              404,
              "INTAKE_NOT_FOUND",
              "The worker has no intake for this case request.",
            );
            return;
          }
          if (intake.expectedEventType !== "ORDER_GUARANTEED") {
            proposalError(
              response,
              options,
              422,
              "PROPOSAL_UNSUPPORTED_EVENT",
              "Facility proposals are available only for verified OrderGuaranteed evidence.",
              { intake: publicIntakeStatus(intake, store) },
            );
            return;
          }
          const event = store.findEventForIntake(intake);
          if (
            intake.status !== "COMPLETED" ||
            !event ||
            event.stage !== "VERIFIED" ||
            !event.evidenceId
          ) {
            proposalError(
              response,
              options,
              422,
              "EVIDENCE_NOT_READY",
              "A model proposal requires a completed native USC verification and registry read-back.",
              { intake: publicIntakeStatus(intake, store) },
            );
            return;
          }
          const orderHistory = store.listByOrderId(
            event.orderId,
            PUBLIC_EVENT_LIMIT,
          );
          const laterLifecycleEvents = orderHistory.filter(
            (candidate) => candidate.eventType !== "ORDER_GUARANTEED",
          );
          if (laterLifecycleEvents.length > 0) {
            const unresolved = laterLifecycleEvents.some(
              (candidate) => candidate.stage !== "VERIFIED",
            );
            proposalError(
              response,
              options,
              422,
              unresolved
                ? "ORDER_LIFECYCLE_UNRESOLVED"
                : "ORDER_LIFECYCLE_BLOCKED",
              unresolved
                ? "A later source-order lifecycle event is still unresolved. Proposal generation remains stopped until the worker verifies or terminally rejects that event."
                : "A later source-order lifecycle event was verified. This order is no longer eligible for a new financing proposal.",
              { intake: publicIntakeStatus(intake, store) },
            );
            return;
          }
          try {
            const processProposal = handlers.processProposal;
            if (!processProposal) {
              proposalError(
                response,
                options,
                503,
                "PROPOSAL_NOT_CONFIGURED",
                "The worker proposal boundary is not configured.",
              );
              return;
            }
            // Requested terms are part of the proposal input. Coalescing only
            // by request ID could return the first caller's quote to a second
            // caller that asked for different terms.
            const activeKey = `${requestId}:${requestedAdvanceBps}:${deliveryDays}`;
            const existingProposal = activeProposals.get(activeKey);
            const proposalJob =
              existingProposal ??
              processProposal({
                requestId,
                sourceTxHash,
                requestedAdvanceBps,
                deliveryDays,
                event,
              });
            if (!existingProposal) {
              activeProposals.set(activeKey, proposalJob);
              void proposalJob
                .finally(() => {
                  if (activeProposals.get(activeKey) === proposalJob) {
                    activeProposals.delete(activeKey);
                  }
                })
                .catch(() => undefined);
            }
            const result = await proposalJob;
            writeJson(response, result.statusCode, result.payload, options);
          } catch {
            proposalError(
              response,
              options,
              503,
              "PROPOSAL_UNAVAILABLE",
              "The worker could not complete the proposal boundary.",
            );
          }
        })
        .catch((error: unknown) => {
          const code =
            error instanceof Error ? error.message : "INVALID_REQUEST";
          proposalError(
            response,
            options,
            code === "REQUEST_TOO_LARGE" ? 413 : 400,
            code === "REQUEST_TOO_LARGE" ? code : "INVALID_REQUEST",
            code === "REQUEST_TOO_LARGE"
              ? "The JSON request body is too large."
              : "Expected a valid JSON proposal request.",
          );
        });
    }
    if (!handlers.processIntake) {
      intakeError(
        response,
        options,
        503,
        "MUTATION_NOT_CONFIGURED",
        "The worker is running in read-only status mode.",
      );
      return Promise.resolve();
    }
    if (request.url?.split("?", 1)[0] !== "/v1/intakes") {
      routeNotFound(response, options);
      return Promise.resolve();
    }

    return readMutationBody(request)
      .then((body) => {
        if (typeof body !== "object" || body === null) {
          intakeError(
            response,
            options,
            400,
            "INVALID_REQUEST",
            "A JSON object is required.",
          );
          return;
        }
        const input = body as Record<string, unknown>;
        const requestId = isRequestId(input.requestId) ? input.requestId : "";
        const sourceTxHash =
          typeof input.sourceTxHash === "string"
            ? input.sourceTxHash.trim().toLowerCase()
            : "";
        if (!requestId) {
          intakeError(
            response,
            options,
            400,
            "INVALID_REQUEST_ID",
            "requestId is required for a durable intake request.",
          );
          return;
        }
        const expectedOrderId =
          input.expectedOrderId === undefined || input.expectedOrderId === null
            ? null
            : typeof input.expectedOrderId === "string" &&
                isBytes32(input.expectedOrderId.trim())
              ? input.expectedOrderId.trim()
              : null;
        const expectedEventType =
          input.expectedEventType === undefined
            ? "ORDER_GUARANTEED"
            : input.expectedEventType;
        if (!isTransactionHash(sourceTxHash)) {
          intakeError(
            response,
            options,
            400,
            "INVALID_SOURCE_TRANSACTION",
            "sourceTxHash must be a 32-byte hexadecimal transaction hash.",
          );
          return;
        }
        if (
          input.expectedOrderId !== undefined &&
          input.expectedOrderId !== null &&
          expectedOrderId === null
        ) {
          intakeError(
            response,
            options,
            400,
            "INVALID_ORDER_ID",
            "expectedOrderId must be a 32-byte hexadecimal value.",
          );
          return;
        }
        if (!isSourceEventType(expectedEventType)) {
          intakeError(
            response,
            options,
            400,
            "INVALID_EVENT_TYPE",
            "expectedEventType is not supported.",
          );
          return;
        }

        const existing = store.getIntakeRequestBySourceTxHash(sourceTxHash);
        const requestWithId = store.getIntakeRequest(requestId);
        if (
          requestWithId &&
          requestWithId.sourceTxHash.toLowerCase() !== sourceTxHash
        ) {
          writeJson(
            response,
            409,
            {
              boundary,
              code: "REQUEST_ID_ALREADY_TRACKED",
              error:
                "This request ID is already attached to a different source transaction.",
            },
            options,
          );
          return;
        }
        if (
          requestWithId &&
          (requestWithId.expectedEventType !== expectedEventType ||
            (requestWithId.expectedOrderId ?? "").toLowerCase() !==
              (expectedOrderId ?? "").toLowerCase())
        ) {
          writeJson(
            response,
            409,
            {
              boundary,
              code: "INTAKE_PARAMETERS_LOCKED",
              error:
                "An existing intake request cannot be reused with different event parameters.",
              intake: publicIntakeStatus(requestWithId, store),
            },
            options,
          );
          return;
        }
        if (existing && existing.requestId !== requestId) {
          writeJson(
            response,
            409,
            {
              boundary,
              code: "SOURCE_TRANSACTION_ALREADY_TRACKED",
              error:
                "This source transaction is already tracked under another request.",
              intake: publicIntakeStatus(existing, store),
            },
            options,
          );
          return;
        }

        const intake =
          existing ??
          store.createIntakeRequest({
            requestId,
            sourceTxHash,
            expectedOrderId,
            expectedEventType,
          });
        if (intake.requestId !== requestId) {
          writeJson(
            response,
            409,
            {
              boundary,
              code: "SOURCE_TRANSACTION_ALREADY_TRACKED",
              error:
                "This source transaction was claimed by another request while the intake was being created.",
              intake: publicIntakeStatus(intake, store),
            },
            options,
          );
          return;
        }
        const recovered = recoverStaleIntake(intake, store, activeIntakes);
        const event = store.findEventForIntake(recovered);
        const canSchedule =
          !event ||
          (event.stage !== "VERIFIED" && event.stage !== "FAILED_TERMINAL");
        if (
          canSchedule &&
          (recovered.status === "ACCEPTED" ||
            recovered.status === "FAILED_RETRYABLE")
        ) {
          scheduleIntake(
            {
              requestId: recovered.requestId,
              sourceTxHash: recovered.sourceTxHash,
              expectedOrderId: recovered.expectedOrderId,
              expectedEventType: recovered.expectedEventType,
            },
            store,
            handlers,
            activeIntakes,
          );
        } else if (
          event?.stage === "VERIFIED" &&
          recovered.status !== "COMPLETED"
        ) {
          store.updateIntakeRequest(recovered.requestId, "COMPLETED");
        } else if (
          event?.stage === "FAILED_TERMINAL" &&
          recovered.status !== "FAILED_TERMINAL"
        ) {
          store.updateIntakeRequest(
            recovered.requestId,
            "FAILED_TERMINAL",
            "PROCESSING_FAILED",
          );
        }

        const current = store.getIntakeRequest(recovered.requestId)!;
        writeJson(
          response,
          202,
          { boundary, intake: publicIntakeStatus(current, store) },
          options,
        );
      })
      .catch((error: unknown) => {
        const code = error instanceof Error ? error.message : "INVALID_REQUEST";
        intakeError(
          response,
          options,
          code === "REQUEST_TOO_LARGE" ? 413 : 400,
          code === "REQUEST_TOO_LARGE" ? code : "INVALID_REQUEST",
          code === "REQUEST_TOO_LARGE"
            ? "The JSON request body is too large."
            : "Expected a valid JSON request body.",
        );
      });
  }
  if (request.method !== "GET") {
    response.setHeader("allow", "GET, OPTIONS");
    writeJson(
      response,
      405,
      { error: "Only GET and OPTIONS are supported" },
      options,
    );
    return Promise.resolve();
  }

  const requestUrl = new URL(request.url ?? "/", "http://loomcredit.local");
  const segments = requestUrl.pathname.split("/").filter(Boolean);
  if (requestUrl.pathname === "/") {
    const latest = store.listRecent(1)[0] ?? null;
    writeJson(
      response,
      200,
      {
        boundary,
        status: "ok",
        service: "loomcredit-worker-status",
        trackedEvents: store.count(),
        latestUpdatedAt: latest?.updatedAt ?? null,
        endpoints: {
          health: "/health",
          orders: "/v1/orders",
          evidence: "/v1/evidence/:evidenceId",
          intakes: "/v1/intakes",
          intake: "/v1/intakes/:requestId",
          proposals: "/v1/proposals",
        },
      },
      options,
    );
    return Promise.resolve();
  }

  if (requestUrl.pathname === "/health") {
    const latest = store.listRecent(1)[0] ?? null;
    writeJson(
      response,
      200,
      {
        boundary,
        status: "ok",
        service: "loomcredit-worker-status",
        trackedEvents: store.count(),
        latestUpdatedAt: latest?.updatedAt ?? null,
      },
      options,
    );
    return Promise.resolve();
  }

  if (
    segments.length === 2 &&
    segments[0] === "v1" &&
    segments[1] === "orders"
  ) {
    writeJson(
      response,
      200,
      {
        boundary,
        orders: store.listRecent(PUBLIC_EVENT_LIMIT).map(toPublicEventStatus),
      },
      options,
    );
    return Promise.resolve();
  }

  if (
    segments.length === 3 &&
    segments[0] === "v1" &&
    segments[1] === "intakes"
  ) {
    if (!isRequestId(segments[2])) {
      writeJson(response, 400, { error: "requestId is invalid" }, options);
      return Promise.resolve();
    }
    const intake = store.getIntakeRequest(segments[2]);
    if (!intake) {
      writeJson(response, 404, { error: "Intake request not found" }, options);
      return Promise.resolve();
    }
    const recovered = recoverStaleIntake(intake, store, activeIntakes);
    writeJson(
      response,
      200,
      { boundary, intake: publicIntakeStatus(recovered, store) },
      options,
    );
    return Promise.resolve();
  }

  if (
    segments.length === 3 &&
    segments[0] === "v1" &&
    segments[1] === "orders"
  ) {
    if (!isBytes32(segments[2])) {
      writeJson(
        response,
        400,
        { error: "orderId must be a 32-byte hex value" },
        options,
      );
      return Promise.resolve();
    }
    const event = store.findByOrderId(segments[2]);
    if (!event) {
      writeJson(response, 404, { error: "Order status not found" }, options);
      return Promise.resolve();
    }
    writeJson(
      response,
      200,
      { boundary, order: toPublicEventStatus(event) },
      options,
    );
    return Promise.resolve();
  }

  if (
    segments.length === 3 &&
    segments[0] === "v1" &&
    segments[1] === "evidence"
  ) {
    if (!isBytes32(segments[2])) {
      writeJson(
        response,
        400,
        { error: "evidenceId must be a 32-byte hex value" },
        options,
      );
      return Promise.resolve();
    }
    const event = store.findByEvidenceId(segments[2]);
    if (!event) {
      writeJson(response, 404, { error: "Evidence status not found" }, options);
      return Promise.resolve();
    }
    writeJson(
      response,
      200,
      { boundary, order: toPublicEventStatus(event) },
      options,
    );
    return Promise.resolve();
  }

  routeNotFound(response, options);
  return Promise.resolve();
}

export function startStatusServer(
  store: EventStore,
  options: StatusServerOptions,
  handlers: StatusServerHandlers = {},
): Promise<Server> {
  const activeIntakes = new Map<string, Promise<number>>();
  const activeProposals = new Map<string, Promise<ProposalProcessOutput>>();
  const server = createServer((request, response) => {
    void handleStatusRequest(
      request,
      response,
      store,
      options,
      handlers,
      activeIntakes,
      activeProposals,
    ).catch(() => {
      if (!response.headersSent) {
        writeJson(
          response,
          500,
          { error: "Status store unavailable" },
          options,
        );
      } else {
        response.destroy();
      }
    });
  });

  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve(server);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(options.port, options.host);
  });
}
