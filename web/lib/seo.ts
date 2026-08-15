export const siteName = "LoomCredit";
export const siteDescription =
  "Attested trade evidence and policy-constrained AI for bounded supplier-finance underwriting.";
const defaultSiteUrl = "http://localhost:3000";

function normalizeSiteUrl(value: string | undefined): string {
  try {
    const parsed = new URL(value?.trim() || defaultSiteUrl);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return defaultSiteUrl;
    }
    return parsed.origin;
  } catch {
    return defaultSiteUrl;
  }
}

export const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

export const isPublicDeployment = (() => {
  try {
    const parsed = new URL(siteUrl);
    return parsed.protocol === "https:" && !localHosts.has(parsed.hostname);
  } catch {
    return false;
  }
})();

export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl + "/").toString();
}

export const faqItems = [
  {
    question: "What is LoomCredit?",
    answer:
      "LoomCredit is an evidence-bound underwriting prototype. It takes a buyer-backed trade event, validates its source-chain evidence through Attestcoin and Creditcoin USC, then lets a structured AI agent propose a quote that RiskGuard checks against deterministic policy.",
  },
  {
    question: "What does Attestcoin prove in LoomCredit?",
    answer:
      "Attestcoin and USC establish source-transaction inclusion and chain continuity. LoomCredit then checks receipt success, the trusted emitter, the exact event fields, and replay status before registering evidence.",
  },
  {
    question: "Can the AI agent move capital?",
    answer:
      "No. The agent proposes a structured, evidence-bound quote. RiskGuard—not the model—checks the signer, evidence, nonce, expiry, exposure, limits, facility state, and available sandbox liquidity before an accounting reservation.",
  },
  {
    question: "Is LoomCredit a live lending product?",
    answer:
      "No. This checkout is a testnet-oriented technical prototype. Its browser demo uses explicitly labelled local fixtures and accounting-only sandbox capital; it does not issue loans, custody deposits, or represent a live transaction.",
  },
] as const;

export const siteStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": absoluteUrl("/") + "#organization",
      name: siteName,
      url: absoluteUrl("/"),
      logo: absoluteUrl("/assets/loomcredit-logo.png"),
      description: siteDescription,
    },
    {
      "@type": "WebSite",
      "@id": absoluteUrl("/") + "#website",
      name: siteName,
      url: absoluteUrl("/"),
      description: siteDescription,
      publisher: { "@id": absoluteUrl("/") + "#organization" },
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      "@id": absoluteUrl("/") + "#application",
      name: siteName,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Trade finance infrastructure",
      operatingSystem: "Web",
      url: absoluteUrl("/"),
      description: siteDescription,
      provider: { "@id": absoluteUrl("/") + "#organization" },
      featureList: [
        "Source-chain evidence verification",
        "Structured AI underwriting proposals",
        "Deterministic RiskGuard policy checks",
        "Accounting-only sandbox reservations",
      ],
    },
  ],
};

export const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};
