import type { MetadataRoute } from "next";

import { siteDescription } from "../lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LoomCredit",
    short_name: "LoomCredit",
    description: siteDescription,
    id: "/",
    start_url: "/",
    scope: "/",
    lang: "en",
    dir: "ltr",
    display: "standalone",
    background_color: "#f4f7f8",
    theme_color: "#123447",
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/assets/loomcredit-logo.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
