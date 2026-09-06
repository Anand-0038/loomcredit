const publicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "";
const publicHttpsDeployment = /^https:\/\//i.test(publicSiteUrl);
const scriptSources = ["'self'", "'unsafe-inline'"];
if (process.env.NODE_ENV !== "production") scriptSources.push("'unsafe-eval'");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src ${scriptSources.join(" ")}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://eu.i.posthog.com https://*.i.posthog.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

if (publicHttpsDeployment) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@loomcredit/shared"],
  poweredByHeader: false,
  reactStrictMode: true,
  // Next's CLI checker can lose captured `tsc --showConfig` output in some
  // non-interactive Node environments. TypeScript 6 still exposes the compiler
  // API, so use the documented API checker and keep production builds reliable.
  experimental: { useTypeScriptCli: false },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
