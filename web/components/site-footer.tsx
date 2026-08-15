import Link from "next/link";

import { BrandMark } from "./brand-mark";
import { liveEvidence } from "../lib/live-evidence";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-inner">
          <div>
            <BrandMark />
            <p className="footer-copy">
              A Creditcoin USC prototype for turning verifiable trade evidence
              into bounded underwriting actions.
            </p>
          </div>
          <nav className="footer-links" aria-label="Footer navigation">
            <Link href="/demo">Demo lab</Link>
            <Link href="/security">Security boundary</Link>
            <Link href="/docs">Developer docs</Link>
            <Link href="/access">Wallet access</Link>
            <Link href="/whitepaper">Whitepaper</Link>
            <Link href="/legal">Legal center</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/cookies">Cookies</Link>
            <Link href={`/proof/${liveEvidence.creditcoin.evidenceId}`}>
              Recorded proof console
            </Link>
          </nav>
        </div>
        <p className="footer-disclaimer">
          Testnet prototype. No real lending, deposits, or investment product.
          Local demo records are explicitly labeled and do not represent
          on-chain transactions.
        </p>
      </div>
    </footer>
  );
}
