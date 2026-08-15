import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const { readLiveEvidenceHealth, resolveLiveEvidenceApiUrl } = vi.hoisted(
  () => ({
    readLiveEvidenceHealth: vi.fn(),
    resolveLiveEvidenceApiUrl: vi.fn(() => null as string | null),
  }),
);

vi.mock("../../../lib/live-evidence", () => ({
  resolveLiveEvidenceApiUrl,
}));

vi.mock("../../../lib/live-evidence-health", () => ({
  readLiveEvidenceHealth,
}));

describe("api /api/health", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a bounded not-configured payload when no upstream URL exists", async () => {
    resolveLiveEvidenceApiUrl.mockReturnValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      status: "ok",
      service: "loomcredit-web",
      liveIntegrationConfigured: false,
      liveEvidenceConfigured: false,
      liveEvidenceApi: "not-configured",
      liveEvidenceUpstream: "not-configured",
      liveEvidenceEndpoint: "/api/live-evidence",
      latestVerifiedOrder: null,
      workerSecrets: "not-applicable",
      proofBoundary: "external USC worker only",
    });
    expect(readLiveEvidenceHealth).not.toHaveBeenCalled();
  });

  it("returns upstream readiness status when configured", async () => {
    resolveLiveEvidenceApiUrl.mockReturnValue("https://worker.example");
    readLiveEvidenceHealth.mockResolvedValue({
      upstream: "reachable",
      latestVerifiedOrder: `0x${"11".repeat(32)}`,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
      status: "ok",
      service: "loomcredit-web",
      liveIntegrationConfigured: true,
      liveEvidenceConfigured: true,
      liveEvidenceApi: "configured",
      liveEvidenceUpstream: "reachable",
      latestVerifiedOrder: `0x${"11".repeat(32)}`,
    });
  });

  it("returns upstream state and null latest order when upstream is unavailable", async () => {
    resolveLiveEvidenceApiUrl.mockReturnValue("https://worker.example");
    readLiveEvidenceHealth.mockResolvedValue({
      upstream: "unavailable",
      latestVerifiedOrder: null,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
      status: "ok",
      service: "loomcredit-web",
      liveEvidenceConfigured: true,
      liveEvidenceApi: "configured",
      liveEvidenceUpstream: "unavailable",
      latestVerifiedOrder: null,
    });
  });
});
