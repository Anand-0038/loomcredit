import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import { ConfigError } from "./config.js";
import type { CrossChainEvent, EventStore } from "./store.js";

const BYTES32_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const PUBLIC_EVENT_LIMIT = 100;

export interface StatusServerOptions {
  host: string;
  port: number;
  allowedOrigin?: string;
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
  stageTimestamps: CrossChainEvent["stageTimestamps"];
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
  response.setHeader("access-control-allow-methods", "GET, OPTIONS");
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
): void {
  if (request.method === "OPTIONS") {
    handleOptions(response, options);
    return;
  }
  if (request.method !== "GET") {
    response.setHeader("allow", "GET, OPTIONS");
    writeJson(
      response,
      405,
      { error: "Only GET and OPTIONS are supported" },
      options,
    );
    return;
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
        },
      },
      options,
    );
    return;
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
    return;
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
    return;
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
      return;
    }
    const event = store.findByOrderId(segments[2]);
    if (!event) {
      writeJson(response, 404, { error: "Order status not found" }, options);
      return;
    }
    writeJson(
      response,
      200,
      { boundary, order: toPublicEventStatus(event) },
      options,
    );
    return;
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
      return;
    }
    const event = store.findByEvidenceId(segments[2]);
    if (!event) {
      writeJson(response, 404, { error: "Evidence status not found" }, options);
      return;
    }
    writeJson(
      response,
      200,
      { boundary, order: toPublicEventStatus(event) },
      options,
    );
    return;
  }

  routeNotFound(response, options);
}

export function startStatusServer(
  store: EventStore,
  options: StatusServerOptions,
): Promise<Server> {
  const server = createServer((request, response) => {
    try {
      handleStatusRequest(request, response, store, options);
    } catch {
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
    }
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
