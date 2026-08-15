"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  ArrowUpRight,
  ArrowsClockwise,
  CircleNotch,
  Warning,
} from "@phosphor-icons/react";

import { captureAnalytics } from "../lib/analytics-client";

const sourceExplorer = "https://sepolia.etherscan.io/tx/";
const creditcoinExplorer = "https://creditcoin-testnet.blockscout.com/tx/";

type LiveOrder = {
  sourceEventKey?: string;
  sourceTxHash: string;
  sourceChainKey?: number;
  orderId: string;
  txIndex?: number | null;
  logIndex?: number;
  stage: string;
  proofStatus: "LIVE_VERIFIED" | "PENDING" | "FAILED";
  evidenceId: string | null;
  creditcoinTxHash: string | null;
  retryCount: number;
  blockHeight: number | null;
  stageTimestamps?: Record<string, string>;
  updatedAt: string;
};

type LiveOrdersResponse = {
  boundary: "LIVE_EVIDENCE_STATUS_API";
  orders: LiveOrder[];
};

type FeedState =
  | { status: "disabled" }
  | { status: "loading" }
  | { status: "ready"; orders: LiveOrder[] }
  | { status: "error" };

const liveEvidenceEndpoint = "/api/live-evidence";

export function LiveEvidencePanel() {
  const [state, setState] = useState<FeedState>({ status: "loading" });
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);

    void (async () => {
      try {
        const response = await fetch(liveEvidenceEndpoint, {
          signal: controller.signal,
          cache: "no-store",
        });
        const body: unknown = await response.json();

        if (isLiveEvidenceError(body, "NOT_CONFIGURED")) {
          setState({ status: "disabled" });
          captureAnalytics({
            name: "loomcredit_feed_status_viewed",
            properties: { status: "not_configured" },
          });
          return;
        }
        if (!response.ok || !isLiveOrdersResponse(body)) {
          throw new Error("Live evidence response was invalid");
        }
        setState({ status: "ready", orders: body.orders });
        captureAnalytics({
          name: "loomcredit_feed_status_viewed",
          properties: {
            status: body.orders.length > 0 ? "connected" : "empty",
          },
        });
      } catch {
        setState({ status: "error" });
        captureAnalytics({
          name: "loomcredit_feed_status_viewed",
          properties: { status: "unavailable" },
        });
      } finally {
        window.clearTimeout(timeout);
      }
    })();

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [refreshToken]);

  const statusLabel =
    state.status === "disabled"
      ? "NOT CONFIGURED"
      : state.status === "loading"
        ? "CONNECTING"
        : state.status === "error"
          ? "UNAVAILABLE"
          : "CONNECTED";

  return (
    <section
      className="live-evidence-panel"
      aria-labelledby="live-evidence-title"
    >
      <div className="live-evidence-heading">
        <div>
          <div className="live-evidence-title-row">
            <span className="eyebrow">Testnet evidence feed</span>
            <span
              className={`live-evidence-connection ${state.status}`}
              role="status"
              aria-live="polite"
            >
              <span aria-hidden="true" />
              {statusLabel}
            </span>
          </div>
          <h2 id="live-evidence-title">Live evidence, when it exists.</h2>
          <p>
            Only records persisted by the worker appear here. A live record
            needs its source receipt and, after verification, its Creditcoin
            receipt.
          </p>
        </div>
        <div className="live-evidence-heading-actions">
          <span className="live-evidence-boundary">READ-ONLY</span>
          <button
            className="live-evidence-refresh"
            type="button"
            onClick={() => {
              captureAnalytics({
                name: "loomcredit_feed_refreshed",
                properties: { status: feedAnalyticsStatus(state) },
              });
              setRefreshToken((token) => token + 1);
            }}
            disabled={state.status === "loading"}
            aria-label="Refresh testnet evidence feed"
          >
            <ArrowsClockwise
              size={15}
              weight="bold"
              className={state.status === "loading" ? "spin" : undefined}
              aria-hidden="true"
            />
            Refresh
          </button>
        </div>
      </div>

      {state.status === "disabled" ? (
        <div className="live-evidence-empty live-evidence-empty-disabled">
          <div className="live-evidence-empty-icon" aria-hidden="true">
            <Warning size={18} />
          </div>
          <div>
            <strong>Worker feed not configured</strong>
            <span>
              This web service has no worker status URL. The local policy lab
              below remains available, but it cannot create a transaction or
              stand in for one.
            </span>
            <span className="live-evidence-next-step">
              Next step: set LIVE_EVIDENCE_API_URL on the web service.
            </span>
          </div>
        </div>
      ) : state.status === "loading" ? (
        <div className="live-evidence-empty" role="status" aria-live="polite">
          <CircleNotch className="spin" size={18} aria-hidden="true" />
          <span>Reading the worker status feed…</span>
        </div>
      ) : state.status === "error" ? (
        <div
          className="live-evidence-empty live-evidence-empty-error"
          role="alert"
        >
          <Warning size={18} aria-hidden="true" />
          <div>
            <strong>Worker feed unavailable</strong>
            <span>
              The web service could not reach the worker status endpoint. Check
              the worker process and use Refresh to try again.
            </span>
          </div>
        </div>
      ) : state.orders.length === 0 ? (
        <div className="live-evidence-empty" role="status" aria-live="polite">
          <div>
            <strong>Worker connected; no records yet.</strong>
            <span>
              Real source events will appear after the watcher persists them. No
              fixture is inserted into this feed.
            </span>
          </div>
        </div>
      ) : (
        <div className="live-evidence-list">
          {state.orders.map((order, index) => (
            <LiveOrderRow
              key={
                order.sourceEventKey ?? `${order.sourceTxHash}:${order.orderId}`
              }
              order={order}
              index={index}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function feedAnalyticsStatus(state: FeedState) {
  if (state.status === "disabled") return "not_configured" as const;
  if (state.status === "ready") {
    return state.orders.length > 0
      ? ("connected" as const)
      : ("empty" as const);
  }
  return "unavailable" as const;
}

function LiveOrderRow({ order, index }: { order: LiveOrder; index: number }) {
  const verified = order.proofStatus === "LIVE_VERIFIED";
  const failed = order.proofStatus === "FAILED";
  const statusLabel = verified ? "VERIFIED" : failed ? "FAILED" : "IN PROGRESS";

  return (
    <article className="live-evidence-row">
      <div className="live-evidence-row-head">
        <div>
          <span className="live-evidence-row-index" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
          <strong>Order evidence</strong>
        </div>
        <span
          className={`live-evidence-status${verified ? " verified" : failed ? " failed" : ""}`}
        >
          {statusLabel}
        </span>
      </div>
      <dl className="live-evidence-fields">
        <div>
          <dt>Order ID</dt>
          <dd className="mono">{shortHash(order.orderId)}</dd>
        </div>
        <div>
          <dt>Source receipt</dt>
          <dd>
            <a
              href={`${sourceExplorer}${order.sourceTxHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {shortHash(order.sourceTxHash)}
              <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </dd>
        </div>
        <div>
          <dt>Worker stage</dt>
          <dd className="mono">{formatStage(order.stage)}</dd>
        </div>
        <div>
          <dt>Creditcoin receipt</dt>
          <dd>
            {order.creditcoinTxHash ? (
              <a
                href={`${creditcoinExplorer}${order.creditcoinTxHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {shortHash(order.creditcoinTxHash)}
                <ArrowUpRight size={13} aria-hidden="true" />
              </a>
            ) : (
              <span className="live-evidence-muted">Awaiting CC3 receipt</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Evidence ID</dt>
          <dd className="mono">
            {order.evidenceId ? (
              <Link
                className="mono"
                href={`/proof/${order.evidenceId}`}
                aria-label="Open the live evidence proof console"
              >
                {shortHash(order.evidenceId)}
              </Link>
            ) : (
              "Pending"
            )}
          </dd>
        </div>
        <div>
          <dt>Source block</dt>
          <dd>
            {order.blockHeight ?? "Pending"}
            {order.txIndex !== undefined && order.txIndex !== null
              ? ` / tx ${order.txIndex}`
              : ""}
            {order.logIndex !== undefined ? ` / log ${order.logIndex}` : ""}
          </dd>
        </div>
        <div>
          <dt>Source chain key</dt>
          <dd>{order.sourceChainKey ?? "Pending"}</dd>
        </div>
        <div>
          <dt>Stage timestamp</dt>
          <dd>
            {formatTimestamp(
              order.stageTimestamps?.[order.stage] ?? order.updatedAt,
            )}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function formatStage(stage: string): string {
  return stage
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recorded";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isLiveOrdersResponse(value: unknown): value is LiveOrdersResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<LiveOrdersResponse>;
  return (
    candidate.boundary === "LIVE_EVIDENCE_STATUS_API" &&
    Array.isArray(candidate.orders) &&
    candidate.orders.every(isLiveOrder)
  );
}

function isLiveEvidenceError(
  value: unknown,
  code: "NOT_CONFIGURED" | "UPSTREAM_UNAVAILABLE" | "UPSTREAM_INVALID",
): boolean {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { boundary?: unknown; code?: unknown };
  return (
    candidate.boundary === "LIVE_EVIDENCE_STATUS_API" && candidate.code === code
  );
}

function isLiveOrder(value: unknown): value is LiveOrder {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<LiveOrder>;
  return (
    typeof candidate.sourceTxHash === "string" &&
    (candidate.sourceChainKey === undefined ||
      typeof candidate.sourceChainKey === "number") &&
    typeof candidate.orderId === "string" &&
    (candidate.txIndex === undefined ||
      typeof candidate.txIndex === "number" ||
      candidate.txIndex === null) &&
    (candidate.logIndex === undefined ||
      typeof candidate.logIndex === "number") &&
    typeof candidate.stage === "string" &&
    (candidate.proofStatus === "LIVE_VERIFIED" ||
      candidate.proofStatus === "PENDING" ||
      candidate.proofStatus === "FAILED") &&
    (typeof candidate.evidenceId === "string" ||
      candidate.evidenceId === null) &&
    (typeof candidate.creditcoinTxHash === "string" ||
      candidate.creditcoinTxHash === null) &&
    typeof candidate.retryCount === "number" &&
    (typeof candidate.blockHeight === "number" ||
      candidate.blockHeight === null) &&
    (candidate.stageTimestamps === undefined ||
      (typeof candidate.stageTimestamps === "object" &&
        candidate.stageTimestamps !== null &&
        Object.values(candidate.stageTimestamps).every(
          (timestamp) => typeof timestamp === "string",
        ))) &&
    typeof candidate.updatedAt === "string"
  );
}
