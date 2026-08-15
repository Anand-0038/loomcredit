import Link from "next/link";

import { BrandMark } from "./brand-mark";
import { WalletConnect } from "./wallet-connect";
import { liveEvidence } from "../lib/live-evidence";

const liveOrderHref = `/orders/${liveEvidence.source.orderId}`;

export function SiteHeader({ current }: { current?: string }) {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <div className="header-brand-group">
          <BrandMark preload />
          <span className="header-context">
            <span aria-hidden="true" />
            Recorded testnet
          </span>
        </div>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link
            href="/demo"
            aria-current={current === "demo" ? "page" : undefined}
          >
            Demo lab
          </Link>
          <Link
            href="/security"
            aria-current={current === "security" ? "page" : undefined}
          >
            Security
          </Link>
          <Link
            href="/docs"
            aria-current={current === "docs" ? "page" : undefined}
          >
            Docs
          </Link>
          <Link
            href="/whitepaper"
            aria-current={current === "whitepaper" ? "page" : undefined}
          >
            Whitepaper
          </Link>
          <Link className="header-cta" href={liveOrderHref}>
            Inspect live order
          </Link>
          <details className="mobile-nav">
            <summary>Menu</summary>
            <div className="mobile-nav-panel">
              <Link href="/demo">Demo lab</Link>
              <Link href="/security">Security</Link>
              <Link href="/docs">Docs</Link>
              <Link href="/whitepaper">Whitepaper</Link>
              <Link href="/access">Wallet access</Link>
              <Link href={liveOrderHref}>Inspect live order</Link>
            </div>
          </details>
          <WalletConnect />
        </nav>
      </div>
    </header>
  );
}
