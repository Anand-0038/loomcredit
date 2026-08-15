import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  Key,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";

import { Breadcrumbs } from "../../components/structured-data";
import { WalletConnect } from "../../components/wallet-connect";

export const metadata: Metadata = {
  title: "Wallet access",
  description:
    "Sign in with a verified public EVM wallet to inspect the LoomCredit product boundary.",
  alternates: { canonical: "/access" },
  robots: { index: false, follow: false },
};

export default function AccessPage() {
  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <Breadcrumbs
            items={[{ label: "Home", href: "/" }, { label: "Wallet access" }]}
          />
          <span className="eyebrow">Wallet access</span>
          <h1>Sign in with a wallet. Keep authorization honest.</h1>
          <p>
            Connect the active address, then explicitly sign a server-issued
            EIP-191 message. The server verifies it, binds the address to an
            account and role, and creates an expiring session; it never asks for
            a transaction or private key.
          </p>
        </div>
      </section>
      <section className="page-main">
        <div className="container">
          <div className="access-grid">
            <section className="access-card">
              <span className="eyebrow">Verified wallet session</span>
              <h2>Connect, then sign in</h2>
              <p>
                First connect an injected EVM wallet. Then approve one
                human-readable sign-in message so the server can establish a
                session for this address.
              </p>
              <WalletConnect variant="card" />
              <div className="access-note">
                <CheckCircle size={18} weight="bold" aria-hidden="true" />
                <span>
                  Sign-in uses one human-readable signature; no transaction or
                  custody request is made.
                </span>
              </div>
            </section>
            <section className="surface-card">
              <span className="eyebrow">Product boundary</span>
              <h2 style={{ marginTop: 10 }}>A wallet is not a session.</h2>
              <ul>
                <li>
                  <strong>Implemented:</strong> EIP-1193 account discovery,
                  connect request, account and chain changes, one-time server
                  nonces, EIP-191 signature verification, account/role binding,
                  expiring HttpOnly sessions, and authentication audit events.
                </li>
                <li>
                  <strong>Current role boundary:</strong> new accounts receive
                  the server-controlled <code>viewer</code> role. Operator
                  addresses must be explicitly configured on the server.
                </li>
                <li>
                  <strong>Never implied:</strong> custody, lending approval, or
                  a transaction just because a wallet is connected.
                </li>
              </ul>
            </section>
          </div>

          <div className="callout access-callout">
            <strong>Sign-in is now server-verified:</strong> the nonce is
            single-use and expires, the recovered signer must match the
            requested address, the session token is opaque and HttpOnly, and
            sign-in/sign-out events are written to the server audit log.
          </div>

          <div className="access-next-steps">
            <div>
              <span className="eyebrow">Next access layer</span>
              <h2>Turn a public address into a controlled workspace.</h2>
            </div>
            <div className="access-next-links">
              <Link className="button button-primary" href="/demo">
                Open the demo lab{" "}
                <ArrowRight size={17} weight="bold" aria-hidden="true" />
              </Link>
              <Link className="text-link" href="/whitepaper">
                Read the technical whitepaper{" "}
                <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="three-up access-principles">
            <article className="feature-card">
              <span className="feature-icon">
                <Key size={21} weight="bold" aria-hidden="true" />
              </span>
              <h3>Wallet owns the key.</h3>
              <p>
                The app never sees a private key or asks the browser to export
                one.
              </p>
            </article>
            <article className="feature-card">
              <span className="feature-icon">
                <ShieldCheck size={21} weight="bold" aria-hidden="true" />
              </span>
              <h3>Policy still owns the action.</h3>
              <p>
                Connecting an address will not bypass evidence or RiskGuard
                checks.
              </p>
            </article>
            <article className="feature-card">
              <span className="feature-icon">
                <CheckCircle size={21} weight="bold" aria-hidden="true" />
              </span>
              <h3>Every claim has a status.</h3>
              <p>
                Local fixture, testnet, and live evidence remain visibly
                separate.
              </p>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
