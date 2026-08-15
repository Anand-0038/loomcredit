import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadMetadata(siteUrl: string) {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", siteUrl);
  vi.resetModules();
  const [{ default: robots }, { default: sitemap }, seo] = await Promise.all([
    import("../app/robots"),
    import("../app/sitemap"),
    import("./seo"),
  ]);
  return { robots: robots(), sitemap: sitemap(), seo };
}

describe("public metadata boundaries", () => {
  it("allows indexing and emits canonical public URLs for HTTPS deployments", async () => {
    const { robots, sitemap, seo } = await loadMetadata(
      "https://demo.example.com",
    );

    expect(seo.isPublicDeployment).toBe(true);
    expect(robots.rules).toEqual(
      expect.objectContaining({
        userAgent: "*",
        allow: "/",
        disallow: expect.arrayContaining(["/api/", "/access", "/demo"]),
      }),
    );
    expect(robots.sitemap).toBe("https://demo.example.com/sitemap.xml");
    expect(sitemap).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: "https://demo.example.com/" }),
        expect.objectContaining({ url: "https://demo.example.com/docs" }),
        expect.objectContaining({ url: "https://demo.example.com/privacy" }),
        expect.objectContaining({
          url: "https://demo.example.com/docs/legal-readiness",
        }),
      ]),
    );
  });

  it("disallows indexing and emits no sitemap for local deployments", async () => {
    const { robots, sitemap, seo } = await loadMetadata(
      "http://localhost:3000",
    );

    expect(seo.isPublicDeployment).toBe(false);
    expect(robots.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(sitemap).toEqual([]);
  });

  it("disallows indexing for non-local HTTP origins", async () => {
    const { robots, sitemap, seo } = await loadMetadata(
      "http://staging.example.com",
    );

    expect(seo.isPublicDeployment).toBe(false);
    expect(robots.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(sitemap).toEqual([]);
  });

  it("fails closed for malformed or credential-bearing site URLs", async () => {
    const malformed = await loadMetadata("not-a-url");
    expect(malformed.seo.siteUrl).toBe("http://localhost:3000");
    expect(malformed.seo.isPublicDeployment).toBe(false);
    expect(malformed.sitemap).toEqual([]);

    const credentialBearing = await loadMetadata(
      "https://user:password@example.com",
    );
    expect(credentialBearing.seo.siteUrl).toBe("http://localhost:3000");
    expect(credentialBearing.seo.isPublicDeployment).toBe(false);
    expect(credentialBearing.sitemap).toEqual([]);
  });
});
