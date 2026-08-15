"use client";

import Link from "next/link";
import {
  CheckCircle,
  SpinnerGap,
  Wallet,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import { captureAnalytics } from "../lib/analytics-client";

type WalletSnapshot = {
  account: string;
  chainId: string;
};

type WalletState =
  "checking" | "idle" | "unavailable" | "connecting" | "connected" | "error";

type AuthUser = {
  accountId: string;
  address: string;
  role: "viewer" | "operator";
  expiresAt: string;
};

type AuthStatus =
  "checking" | "signed_out" | "signing_in" | "signed_in" | "error";

type AuthSessionResponse = {
  boundary: "AUTHENTICATION";
  authenticated: boolean;
  user: AuthUser | null;
};

type AuthNonceResponse = {
  boundary: "AUTHENTICATION";
  nonce: string;
  message: string;
  chainId: number;
  expiresAt: string;
};

const INITIAL_CHECK_TIMEOUT_MS = 1800;
const CONNECT_TIMEOUT_MS = 20_000;
const AUTH_SIGNATURE_TIMEOUT_MS = 120_000;

function firstAccount(value: unknown): string | null {
  if (!Array.isArray(value) || typeof value[0] !== "string") {
    return null;
  }

  return value[0];
}

function normalizeChainId(value: string): string {
  return value.trim();
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function networkLabel(chainId: string): string {
  if (chainId.toLowerCase() === "0xaa36a7") {
    return "Ethereum Sepolia";
  }

  return `Chain ${chainId}`;
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const walletError = error as { code?: unknown; message?: unknown };

    if (walletError.code === 4001) {
      return "The wallet request was rejected.";
    }

    if (
      typeof walletError.message === "string" &&
      walletError.message.length < 140
    ) {
      return walletError.message;
    }
  }

  return "Wallet connection failed. Check the extension and try again.";
}

function walletRequestWasRejected(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 4001
  );
}

function responseError(value: unknown, fallback: string): string {
  if (typeof value === "object" && value !== null) {
    const candidate = value as { error?: unknown };
    if (typeof candidate.error === "string" && candidate.error.length < 240) {
      return candidate.error;
    }
  }
  return fallback;
}

function isAuthUser(value: unknown): value is AuthUser {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<AuthUser>;
  return (
    typeof candidate.accountId === "string" &&
    typeof candidate.address === "string" &&
    (candidate.role === "viewer" || candidate.role === "operator") &&
    typeof candidate.expiresAt === "string"
  );
}

function isAuthSessionResponse(value: unknown): value is AuthSessionResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<AuthSessionResponse>;
  return (
    candidate.boundary === "AUTHENTICATION" &&
    typeof candidate.authenticated === "boolean" &&
    (candidate.user === null || isAuthUser(candidate.user))
  );
}

function isAuthNonceResponse(value: unknown): value is AuthNonceResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<AuthNonceResponse>;
  return (
    candidate.boundary === "AUTHENTICATION" &&
    typeof candidate.nonce === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.chainId === "number" &&
    typeof candidate.expiresAt === "string"
  );
}

async function readWallet(
  provider: EthereumProvider,
): Promise<WalletSnapshot | null> {
  const accounts = await withTimeout(
    provider.request({ method: "eth_accounts" }),
    INITIAL_CHECK_TIMEOUT_MS,
  );
  const account = firstAccount(accounts);

  if (!account) {
    return null;
  }

  const chainIdValue = await withTimeout(
    provider.request({ method: "eth_chainId" }),
    INITIAL_CHECK_TIMEOUT_MS,
  );

  if (typeof chainIdValue !== "string") {
    throw new Error("The wallet did not return a chain identifier.");
  }

  return { account, chainId: normalizeChainId(chainIdValue) };
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: number | undefined;
  // Ensure late-failing operations do not surface as unhandled promise rejections
  // after we already returned a timeout error to the UI.
  void operation.catch(() => undefined);

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(
            new Error(
              "The browser wallet did not respond. Open it and try again.",
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

export function WalletConnect({
  variant = "header",
}: {
  variant?: "header" | "card";
}) {
  const [state, setState] = useState<WalletState>("checking");
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(variant === "card");

  const refreshAuth = useCallback(async (account: string) => {
    try {
      const response = await fetch("/api/auth/session", {
        cache: "no-store",
      });
      const body: unknown = await response.json();
      if (!response.ok || !isAuthSessionResponse(body)) {
        throw new Error("The authentication session response was invalid.");
      }
      if (
        body.authenticated &&
        body.user &&
        body.user.address.toLowerCase() === account.toLowerCase()
      ) {
        setAuthUser(body.user);
        setAuthStatus("signed_in");
      } else {
        setAuthUser(null);
        setAuthStatus("signed_out");
      }
    } catch (error) {
      setAuthUser(null);
      setAuthStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "The server sign-in session could not be read.",
      );
    }
  }, []);

  const refreshWallet = useCallback(async () => {
    const provider = window.ethereum;

    if (!provider) {
      setSnapshot(null);
      setState("unavailable");
      setAuthUser(null);
      setAuthStatus("signed_out");
      setMessage(
        "No browser wallet was detected. Install an EVM wallet, then try again.",
      );
      return;
    }

    setState("checking");
    setMessage(null);

    try {
      const next = await withTimeout(
        readWallet(provider),
        INITIAL_CHECK_TIMEOUT_MS,
      );
      setSnapshot(next);
      if (!next) {
        setState("idle");
        setAuthUser(null);
        setAuthStatus("signed_out");
      } else {
        setState("connected");
        await refreshAuth(next.account);
      }
    } catch (error) {
      setState("error");
      setAuthUser(null);
      setAuthStatus("error");
      setMessage(errorMessage(error));
    }
  }, [refreshAuth]);

  useEffect(() => {
    const provider = window.ethereum;

    const handleAccountsChanged = () => {
      void refreshWallet();
    };
    const handleChainChanged = () => {
      void refreshWallet();
    };

    const initialCheck = window.setTimeout(() => {
      void refreshWallet();
    }, 0);
    provider?.on?.("accountsChanged", handleAccountsChanged);
    provider?.on?.("chainChanged", handleChainChanged);

    return () => {
      window.clearTimeout(initialCheck);
      provider?.removeListener?.("accountsChanged", handleAccountsChanged);
      provider?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [refreshWallet]);

  const connect = async () => {
    const provider = window.ethereum;

    if (!provider) {
      captureAnalytics({
        name: "loomcredit_wallet_flow",
        properties: { stage: "connection", outcome: "failed" },
      });
      setState("unavailable");
      setMessage(
        "No browser wallet was detected. Install an EVM wallet, then try again.",
      );
      setDetailsOpen(true);
      return;
    }

    setState("connecting");
    setMessage(null);
    captureAnalytics({
      name: "loomcredit_wallet_flow",
      properties: { stage: "connection", outcome: "started" },
    });

    try {
      const accounts = await withTimeout(
        provider.request({
          method: "eth_requestAccounts",
        }),
        CONNECT_TIMEOUT_MS,
      );
      const account = firstAccount(accounts);

      if (!account) {
        throw new Error("The wallet did not return an account.");
      }

      const chainIdValue = await withTimeout(
        provider.request({ method: "eth_chainId" }),
        CONNECT_TIMEOUT_MS,
      );

      if (typeof chainIdValue !== "string") {
        throw new Error("The wallet did not return a chain identifier.");
      }
      const chainId = normalizeChainId(chainIdValue);

      if (typeof chainId !== "string") {
        throw new Error("The wallet did not return a chain identifier.");
      }

      setSnapshot({ account, chainId });
      setState("connected");
      captureAnalytics({
        name: "loomcredit_wallet_flow",
        properties: { stage: "connection", outcome: "connected" },
      });
      await refreshAuth(account);
      setDetailsOpen(true);
    } catch (error) {
      captureAnalytics({
        name: "loomcredit_wallet_flow",
        properties: {
          stage: "connection",
          outcome: walletRequestWasRejected(error) ? "rejected" : "failed",
        },
      });
      setState("error");
      setAuthUser(null);
      setAuthStatus("error");
      setMessage(errorMessage(error));
      setDetailsOpen(true);
    }
  };

  const signIn = async () => {
    const provider = window.ethereum;
    if (!provider || !snapshot) {
      captureAnalytics({
        name: "loomcredit_wallet_flow",
        properties: { stage: "sign_in", outcome: "failed" },
      });
      setMessage("Connect an EVM wallet before signing in.");
      setAuthStatus("error");
      setDetailsOpen(true);
      return;
    }

    setAuthStatus("signing_in");
    setMessage(null);
    captureAnalytics({
      name: "loomcredit_wallet_flow",
      properties: { stage: "sign_in", outcome: "started" },
    });

    try {
      const nonceResponse = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: snapshot.account,
          chainId: snapshot.chainId,
        }),
      });
      const nonceBody: unknown = await nonceResponse.json();
      if (!nonceResponse.ok || !isAuthNonceResponse(nonceBody)) {
        throw new Error(
          responseError(
            nonceBody,
            "The server could not issue a sign-in nonce.",
          ),
        );
      }

      const signature = await withTimeout(
        provider.request({
          method: "personal_sign",
          params: [nonceBody.message, snapshot.account],
        }),
        AUTH_SIGNATURE_TIMEOUT_MS,
      );
      if (typeof signature !== "string") {
        throw new Error("The wallet did not return a signature.");
      }

      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: snapshot.account,
          chainId: snapshot.chainId,
          nonce: nonceBody.nonce,
          message: nonceBody.message,
          signature,
        }),
      });
      const verifyBody: unknown = await verifyResponse.json();
      if (
        !verifyResponse.ok ||
        !isAuthSessionResponse(verifyBody) ||
        !verifyBody.authenticated ||
        !verifyBody.user
      ) {
        throw new Error(
          responseError(
            verifyBody,
            "The server could not verify the wallet signature.",
          ),
        );
      }

      setAuthUser(verifyBody.user);
      setAuthStatus("signed_in");
      captureAnalytics({
        name: "loomcredit_wallet_flow",
        properties: { stage: "sign_in", outcome: "signed_in" },
      });
      setDetailsOpen(true);
    } catch (error) {
      captureAnalytics({
        name: "loomcredit_wallet_flow",
        properties: {
          stage: "sign_in",
          outcome: walletRequestWasRejected(error) ? "rejected" : "failed",
        },
      });
      setAuthStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Wallet sign-in failed. Try again.",
      );
      setDetailsOpen(true);
    }
  };

  const signOut = async () => {
    setMessage(null);
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST" });
      if (!response.ok) {
        const body: unknown = await response.json();
        throw new Error(
          responseError(body, "The server could not sign you out."),
        );
      }
      setAuthUser(null);
      setAuthStatus("signed_out");
    } catch (error) {
      setAuthStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Sign-out failed. Try again.",
      );
    }
  };

  const connected = state === "connected" && snapshot !== null;
  const label =
    authUser && authStatus === "signed_in"
      ? `Signed in · ${shortenAddress(authUser.address)}`
      : connected
        ? shortenAddress(snapshot.account)
        : state === "connecting"
          ? "Connecting…"
          : "Connect wallet";
  const showDetails =
    detailsOpen && (connected || state === "error" || state === "unavailable");

  return (
    <div className={`wallet-access wallet-access-${variant}`}>
      <button
        className={`wallet-connect-button${connected ? " connected" : ""}`}
        type="button"
        onClick={connected ? () => setDetailsOpen((open) => !open) : connect}
        disabled={state === "connecting"}
        aria-busy={state === "checking" || state === "connecting"}
        aria-expanded={showDetails}
        aria-label={
          authUser && authStatus === "signed_in"
            ? `Signed in as ${authUser.address}`
            : connected
              ? `Wallet connected as ${snapshot.account}`
              : "Connect an EVM wallet"
        }
        title={
          authUser && authStatus === "signed_in"
            ? `Signed in as ${authUser.address}`
            : connected
              ? `Wallet connected as ${snapshot.account}`
              : "Connect an EVM wallet"
        }
      >
        {state === "connecting" ? (
          <SpinnerGap
            size={17}
            weight="bold"
            aria-hidden="true"
            className="wallet-spinner"
          />
        ) : connected ? (
          <CheckCircle size={17} weight="bold" aria-hidden="true" />
        ) : (
          <Wallet size={17} weight="bold" aria-hidden="true" />
        )}
        <span className="wallet-connect-label">{label}</span>
      </button>

      {showDetails ? (
        <div className="wallet-popover" role="status" aria-live="polite">
          {connected && authUser && authStatus === "signed_in" ? (
            <>
              <div className="wallet-popover-heading">
                <CheckCircle size={18} weight="bold" aria-hidden="true" />
                <strong>Signed in</strong>
              </div>
              <dl className="wallet-popover-meta">
                <div>
                  <dt>Public address</dt>
                  <dd className="mono">{shortenAddress(authUser.address)}</dd>
                </div>
                <div>
                  <dt>Role</dt>
                  <dd>{authUser.role}</dd>
                </div>
                <div>
                  <dt>Session expires</dt>
                  <dd>{formatSessionExpiry(authUser.expiresAt)}</dd>
                </div>
              </dl>
              <p>
                The server verified a one-time EIP-191 signature and created
                this session. No transaction or custody request was made.
              </p>
              <button
                className="wallet-retry-button"
                type="button"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </>
          ) : connected ? (
            <>
              <div className="wallet-popover-heading">
                <CheckCircle size={18} weight="bold" aria-hidden="true" />
                <strong>Wallet connected</strong>
              </div>
              <dl className="wallet-popover-meta">
                <div>
                  <dt>Public address</dt>
                  <dd className="mono">{shortenAddress(snapshot.account)}</dd>
                </div>
                <div>
                  <dt>Network</dt>
                  <dd>{networkLabel(snapshot.chainId)}</dd>
                </div>
              </dl>
              <p>
                This is a read-only wallet connection. Sign in to create a
                server session; no transaction or custody request is made.
              </p>
              {authStatus === "error" && message ? <p>{message}</p> : null}
              <button
                className="wallet-retry-button"
                type="button"
                onClick={() => void signIn()}
                disabled={authStatus === "signing_in"}
                aria-busy={authStatus === "signing_in"}
              >
                {authStatus === "signing_in"
                  ? "Signing in…"
                  : "Sign in with wallet"}
              </button>
            </>
          ) : (
            <>
              <div className="wallet-popover-heading wallet-popover-heading-error">
                <WarningCircle size={18} weight="bold" aria-hidden="true" />
                <strong>
                  {state === "unavailable"
                    ? "No wallet detected"
                    : "Wallet access needs attention"}
                </strong>
              </div>
              <p>
                {message ?? "An EVM wallet is required for this entry point."}
              </p>
              <button
                className="wallet-retry-button"
                type="button"
                onClick={() => void refreshWallet()}
              >
                Try wallet detection again
              </button>
            </>
          )}
          {variant === "header" ? (
            <Link className="wallet-popover-link" href="/access">
              Read the access boundary
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatSessionExpiry(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
