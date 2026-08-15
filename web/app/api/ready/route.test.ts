import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const { readLiveEvidenceHealth, resolveLiveEvidenceApiUrl } = vi.hoisted(
  () => ({
    readLiveEvidenceHealth: vi.fn(),
    resolveLiveEvidenceApiUrl: vi.fn(() => null as string | null),
  }),
);
afterEach(() => {
  vi.clearAllMocks();
});

vi.mock("../../../lib/live-evidence", () => ({
  resolveLiveEvidenceApiUrl,
}));

vi.mock("../../../lib/live-evidence-health", () => ({
  readLiveEvidenceHealth,
}));

const validHealth = {
  upstream: "reachable" as const,
  latestVerifiedOrder: `0x${"11".repeat(32)}`,
};

describe("api /api/ready", () => {
  it("returns not-ready for missing configuration", async () => {
    resolveLiveEvidenceApiUrl.mockReturnValue(null);
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      status: "not-ready",
      service: "loomcredit-web",
      dependency: "live-evidence",
      upstream: "not-configured",
      code: "LIVE_EVIDENCE_NOT_CONFIGURED",
    });
    expect(readLiveEvidenceHealth).not.toHaveBeenCalled();
  });

  it("returns not-ready for unreachable or invalid upstream state", async () => {
    resolveLiveEvidenceApiUrl.mockReturnValue("https://worker.example");
    readLiveEvidenceHealth.mockResolvedValue({
      upstream: "invalid",
      latestVerifiedOrder: null,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      status: "not-ready",
      service: "loomcredit-web",
      dependency: "live-evidence",
      upstream: "invalid",
      code: "LIVE_EVIDENCE_UNAVAILABLE",
    });
  });

  it("returns ready when upstream is reachable", async () => {
    resolveLiveEvidenceApiUrl.mockReturnValue("https://worker.example");
    readLiveEvidenceHealth.mockResolvedValue(validHealth);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      status: "ready",
      service: "loomcredit-web",
      dependency: "live-evidence",
      upstream: "reachable",
      latestVerifiedOrder: validHealth.latestVerifiedOrder,
    });
  });

  it("maps upstream invalid to not-ready unavailable code", async () => {
    resolveLiveEvidenceApiUrl.mockReturnValue("https://worker.example");
    readLiveEvidenceHealth.mockResolvedValue({
      upstream: "invalid",
      latestVerifiedOrder: null,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      status: "not-ready",
      service: "loomcredit-web",
      dependency: "live-evidence",
      upstream: "invalid",
      code: "LIVE_EVIDENCE_UNAVAILABLE",
    });
  });

  it("maps upstream unavailable to not-ready unavailable code", async () => {
    resolveLiveEvidenceApiUrl.mockReturnValue("https://worker.example");
    readLiveEvidenceHealth.mockResolvedValue({
      upstream: "unavailable",
      latestVerifiedOrder: null,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      status: "not-ready",
      service: "loomcredit-web",
      dependency: "live-evidence",
      upstream: "unavailable",
      code: "LIVE_EVIDENCE_UNAVAILABLE",
    });
  });
});
