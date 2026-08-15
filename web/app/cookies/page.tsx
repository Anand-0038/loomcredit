import type { Metadata } from "next";

import {
  LegalList,
  LegalSection,
  LegalShell,
} from "../../components/legal-shell";

export const metadata: Metadata = {
  title: "Cookie notice",
  description:
    "The current LoomCredit prototype cookie and browser-storage notice.",
  alternates: { canonical: "/cookies" },
};

export default function CookiesPage() {
  return (
    <LegalShell
      current="cookies"
      title="Cookie notice"
      description="What the current prototype stores in browser cookies and what may be controlled by wallet or hosting providers."
    >
      <LegalSection title="1. Current first-party cookies">
        <p>
          The current web app uses one essential first-party cookie,
          <code>loomcredit_session</code>, only after wallet sign-in. It is an
          opaque session token, marked HttpOnly, scoped to the site, and expired
          or cleared when the session ends. The server stores only a hash of the
          token. It is required to keep a verified wallet session and is not an
          advertising or analytics cookie. Optional PostHog analytics is not
          initialized by default. If the operator enables it and a visitor opts
          in, the app stores the choice in{" "}
          <code>loomcredit_analytics_consent</code> in local storage. The
          PostHog SDK uses in-memory persistence and does not set an analytics
          cookie.
        </p>
      </LegalSection>

      <LegalSection title="2. What the current app does not use">
        <LegalList
          items={[
            "No first-party advertising cookies.",
            "No PostHog analytics is initialized unless the operator configures it and the visitor explicitly opts in.",
            "The optional analytics path disables autocapture, automatic pageviews, session replay, person profiles, and browser persistence.",
            "No local-storage copy of the server session token is created by the app.",
            "The deterministic local demo does not need a cookie, model request, wallet transaction, or blockchain call.",
          ]}
        />
        <p>
          Hosting, CDN, security, embedded wallet, explorer, or other third-
          party services may use their own cookies or similar technologies.
          Their terms and privacy notices control those technologies. The
          operator must review consent, retention, vendor terms, and target
          jurisdictions before enabling optional analytics or adding marketing,
          experimentation, chat, ads, or other non-essential tracking.
        </p>
      </LegalSection>

      <LegalSection title="3. Managing cookies">
        <p>
          You can clear or block cookies through your browser settings. Blocking
          the essential session cookie may prevent wallet sign-in from working,
          but the public product pages and local demo remain available. Signing
          out revokes the server session and clears the browser cookie.
        </p>
      </LegalSection>

      <LegalSection title="4. Release requirement">
        <p>
          This notice describes the current repository code, not every cookie a
          future deployment or vendor may set. Before a public release,
          inventory response headers and third-party scripts in the deployed
          environment, decide whether consent is required in target markets, and
          document retention, vendor roles, and withdrawal controls.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
