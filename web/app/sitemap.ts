import type { MetadataRoute } from "next";

import { absoluteUrl, isPublicDeployment } from "../lib/seo";
import { docsPages, docsPath } from "../lib/docs";
import { liveEvidence } from "../lib/live-evidence";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isPublicDeployment) {
    return [];
  }

  const lastModified = new Date();

  const paths = [
    "/",
    "/security",
    "/whitepaper",
    "/legal",
    "/privacy",
    "/terms",
    "/cookies",
    ...docsPages.map((page) => docsPath(page.slug)),
    `/orders/${liveEvidence.source.orderId}`,
    `/proof/${liveEvidence.creditcoin.evidenceId}`,
  ];

  return Array.from(new Set(paths)).map((path) => ({
    url: absoluteUrl(path),
    lastModified,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path.startsWith("/docs") ? 0.8 : 0.7,
  }));
}
