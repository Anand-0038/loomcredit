import type { Metadata, Viewport } from "next";

import "./globals.css";

import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { StructuredData } from "../components/structured-data";
import { AnalyticsProvider } from "../components/analytics-provider";
import {
  isPublicDeployment,
  siteDescription,
  siteName,
  siteStructuredData,
  siteUrl,
} from "../lib/seo";

const robots = {
  index: isPublicDeployment,
  follow: isPublicDeployment,
  googleBot: {
    index: isPublicDeployment,
    follow: isPublicDeployment,
    "max-image-preview": "large" as const,
    "max-snippet": -1,
    "max-video-preview": -1,
  },
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LoomCredit — Attested trade evidence for bounded underwriting",
    template: "%s — LoomCredit",
  },
  description: siteDescription,
  applicationName: siteName,
  category: "Finance technology",
  keywords: [
    "trade finance infrastructure",
    "supplier finance",
    "Creditcoin",
    "Attestcoin",
    "USC proofs",
    "evidence-bound underwriting",
    "policy-constrained AI",
  ],
  authors: [{ name: siteName }],
  creator: siteName,
  publisher: siteName,
  alternates: { canonical: "/" },
  openGraph: {
    title: "LoomCredit — Attested trade evidence for bounded underwriting",
    description: siteDescription,
    type: "website",
    url: "/",
    siteName,
    locale: "en_US",
    images: [
      {
        url: "/assets/loomcredit-og.png",
        width: 1200,
        height: 630,
        alt: "LoomCredit: attested trade evidence for bounded underwriting",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LoomCredit — Attested trade evidence for bounded underwriting",
    description: siteDescription,
    images: [
      {
        url: "/assets/loomcredit-og.png",
        width: 1200,
        height: 630,
        alt: "LoomCredit: attested trade evidence for bounded underwriting",
      },
    ],
  },
  robots,
  other: {
    "llms-txt": "/llms.txt",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#123447",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <AnalyticsProvider>
          <StructuredData data={siteStructuredData} />
          <div className="site-shell">
            <a className="skip-link" href="#main-content">
              Skip to content
            </a>
            <SiteHeader />
            <div id="main-content">{children}</div>
            <SiteFooter />
          </div>
        </AnalyticsProvider>
      </body>
    </html>
  );
}
