"use client";

import { useEffect, useRef, useState } from "react";
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
  provenance?: "WORKER_LIVE" | "RECORDED_TESTNET";
  orderId: string;
  eventType: string;
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
  | { status: "loading"; attempt: number }
  | { status: "retrying"; attempt: number }
  | {
      status: "ready";
      orders: LiveOrder[];
      stale?: boolean;
      refreshing?: boolean;
    }
  | { status: "error" };

const liveEvidenceEndpoint = "/api/live-evidence";
const MAX_AUTO_RETRIES = 2;
const RETRY_DELAYS_MS = [750, 1_500];

export function LiveEvidencePanel() {
  const [state, setState] = useState<FeedState>({
    status: "loading",
    attempt: 1,
  });
  const [refreshToken, setRefreshToken] = useState(0);
  const lastKnownGoodRef = useRef<LiveOrder[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    const lastKnownGood = lastKnownGoodRef.current;

    if (lastKnownGood) {
      setState({
        status: "ready",
        orders: lastKnownGood,
        refreshing: true,
      });
    } else {
      setState({ status: "loading", attempt: 1 });
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);

    async function load(attempt: number): Promise<void> {
      if (cancelled) return;
      if (attempt > 0) {
        setState({ status: "retrying", attempt: attempt + 1 });
        await new Promise<void>((resolve) => {
          retryTimer = window.setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]);
        });
        if (cancelled) return;
      }

      try {
        const response = await fetch(liveEvidenceEndpoint, {
          signal: controller.signal,
          cache: "no-store",
        });
        const body: unknown = await response.json();

        if (isLiveEvidenceError(body, "NOT_CONFIGURED")) {
          if (cancelled) return;
          setState({ status: "disabled" });
          captureAnalytics({
            name: "loomcredit_feed_status_viewed",
            properties: { status: "not_configured" },
          });
          return;
        }
        if (!response.ok || !isLiveOrdersResponse(body)) {
          if (attempt < MAX_AUTO_RETRIES) {
            await load(attempt + 1);
            return;
          }
          throw new Error("Live evidence response was invalid");
        }
        if (cancelled) return;
        lastKnownGoodRef.current = body.orders;
        setState({ status: "ready", orders: body.orders });
        captureAnalytics({
          name: "loomcredit_feed_status_viewed",
          properties: {
            status: body.orders.length > 0 ? "connected" : "empty",
          },
        });
      } catch {
        if (cancelled) return;
        if (attempt < MAX_AUTO_RETRIES) {
          await load(attempt + 1);
          return;
        }
        if (lastKnownGood) {
          setState({
            status: "ready",
            orders: lastKnownGood,
            stale: true,
          });
        } else {
          setState({ status: "error" });
        }
        captureAnalytics({
          name: "loomcredit_feed_status_viewed",
          properties: { status: "unavailable" },
        });
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void load(0);

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [refreshToken]);

  const statusLabel =
    state.status === "disabled"
      ? "NOT CONFIGURED"
      : state.status === "loading"
        ? "CONNECTING"
        : state.status === "retrying"
          ? `RETRYING ${state.attempt}/${MAX_AUTO_RETRIES + 1}`
          : state.status === "ready" && state.stale
            ? "LAST KNOWN GOOD"
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
            The worker persists observed records here. A recovered record is
            explicitly labeled when it comes from the bundled, verified testnet
            receipt rather than the current worker watch cycle.
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
            disabled={state.status === "loading" || state.status === "retrying"}
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
      ) : state.status === "loading" || state.status === "retrying" ? (
        <div className="live-evidence-empty" role="status" aria-live="polite">
          <CircleNotch className="spin" size={18} aria-hidden="true" />
          <span>
            {state.status === "retrying"
              ? "Worker is waking up; retrying the status feed…"
              : "Reading the worker status feed…"}
          </span>
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
        <>
          {state.stale ? <StaleFeedNotice /> : null}
          <div className="live-evidence-empty" role="status" aria-live="polite">
            <div>
              <strong>
                {state.stale
                  ? "Last validated feed contained no records."
                  : "Worker connected; no records yet."}
              </strong>
              <span>
                Source events appear after the watcher persists them. A bundled
                cryptographically verified testnet receipt may also recover at
                startup and is always labeled as recorded evidence.
              </span>
            </div>
          </div>
        </>
      ) : (
        <>
          {state.stale ? <StaleFeedNotice /> : null}
          <div className="live-evidence-list">
            {state.orders.map((order, index) => (
              <LiveOrderRow
                key={
                  order.sourceEventKey ??
                  `${order.sourceTxHash}:${order.orderId}`
                }
                order={order}
                index={index}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function StaleFeedNotice() {
  return (
    <div className="live-evidence-stale" role="status">
      <strong>LAST_KNOWN_GOOD</strong>
      <span>
        The worker could not be reached after retries. Showing the last
        validated response in this browser session; no new evidence is inferred.
      </span>
    </div>
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
          <strong>{formatEventType(order.eventType)}</strong>
        </div>
        <span
          className={`live-evidence-status${verified ? " verified" : failed ? " failed" : ""}`}
        >
          {statusLabel}
        </span>
      </div>
      <dl className="live-evidence-fields">
        <div>
          <dt>Record origin</dt>
          <dd>
            {order.provenance === "RECORDED_TESTNET"
              ? "Recorded testnet proof"
              : "Current worker record"}
          </dd>
        </div>
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

function formatEventType(eventType: string): string {
  return eventType
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
    (candidate.provenance === undefined ||
      candidate.provenance === "WORKER_LIVE" ||
      candidate.provenance === "RECORDED_TESTNET") &&
    typeof candidate.orderId === "string" &&
    (candidate.eventType === "ORDER_GUARANTEED" ||
      candidate.eventType === "ORDER_CANCELLED" ||
      candidate.eventType === "ORDER_DISPUTED" ||
      candidate.eventType === "ORDER_SETTLED") &&
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
