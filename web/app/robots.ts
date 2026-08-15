import type { MetadataRoute } from "next";

import { absoluteUrl, isPublicDeployment } from "../lib/seo";

export default function robots(): MetadataRoute.Robots {
  if (!isPublicDeployment) {
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/access",
        "/demo",
        "/orders/0x2424242424242424242424242424242424242424242424242424242424242424",
        "/proof/0xe1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
