"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "./brand-mark";
import { WalletConnect } from "./wallet-connect";

export function SiteHeader({ current }: { current?: string }) {
  const pathname = usePathname();
  const isCurrent = (path: string, key: string) =>
    current === key || pathname === path || pathname.startsWith(`${path}/`);
  const isCaseArea =
    isCurrent("/cases", "cases") ||
    pathname.startsWith("/proof/") ||
    pathname.startsWith("/orders/");

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
          <Link href="/cases" aria-current={isCaseArea ? "page" : undefined}>
            Case inbox
          </Link>
          <Link
            href="/security"
            aria-current={
              isCurrent("/security", "security") ? "page" : undefined
            }
          >
            Security
          </Link>
          <Link
            href="/docs"
            aria-current={isCurrent("/docs", "docs") ? "page" : undefined}
          >
            Docs
          </Link>
          <Link
            href="/whitepaper"
            aria-current={
              isCurrent("/whitepaper", "whitepaper") ? "page" : undefined
            }
          >
            Whitepaper
          </Link>
          <Link
            className="header-cta"
            href="/review"
            aria-current={isCurrent("/review", "review") ? "page" : undefined}
          >
            Start a case
          </Link>
          <details className="mobile-nav">
            <summary>Menu</summary>
            <div className="mobile-nav-panel">
              <Link
                href="/review"
                aria-current={
                  isCurrent("/review", "review") ? "page" : undefined
                }
              >
                Start a case
              </Link>
              <Link
                href="/cases"
                aria-current={isCaseArea ? "page" : undefined}
              >
                Case inbox
              </Link>
              <Link
                href="/security"
                aria-current={
                  isCurrent("/security", "security") ? "page" : undefined
                }
              >
                Security
              </Link>
              <Link
                href="/docs"
                aria-current={isCurrent("/docs", "docs") ? "page" : undefined}
              >
                Docs
              </Link>
              <Link
                href="/whitepaper"
                aria-current={
                  isCurrent("/whitepaper", "whitepaper") ? "page" : undefined
                }
              >
                Whitepaper
              </Link>
              <Link
                href="/access"
                aria-current={
                  isCurrent("/access", "access") ? "page" : undefined
                }
              >
                Wallet access
              </Link>
              <Link
                href="/demo"
                aria-current={isCurrent("/demo", "demo") ? "page" : undefined}
              >
                Policy reference
              </Link>
            </div>
          </details>
          <WalletConnect />
        </nav>
      </div>
    </header>
  );
}
