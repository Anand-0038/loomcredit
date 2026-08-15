import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const { parseLiveOrdersResponse, resolveLiveEvidenceApiUrl } = vi.hoisted(
  () => ({
    parseLiveOrdersResponse: vi.fn(),
    resolveLiveEvidenceApiUrl: vi.fn(() => null as string | null),
  }),
);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

vi.mock("../../../lib/live-evidence", () => ({
  LIVE_EVIDENCE_BOUNDARY: "LIVE_EVIDENCE_STATUS_API",
  resolveLiveEvidenceApiUrl,
}));

vi.mock("../../../lib/live-evidence-schema", () => ({
  parseLiveOrdersResponse,
}));

function responseJson(response: Response) {
  return response.json();
}

describe("api /api/live-evidence", () => {
  it("returns not-configured when the worker URL is missing", async () => {
    resolveLiveEvidenceApiUrl.mockReturnValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();
    const body = await responseJson(response);

    expect(response.status).toBe(503);
    expect(body).toEqual({
      boundary: "LIVE_EVIDENCE_STATUS_API",
      code: "NOT_CONFIGURED",
      error:
        "The worker status endpoint is not configured for this web service.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns upstream validation errors when parse fails", async () => {
    resolveLiveEvidenceApiUrl.mockReturnValue("https://worker.example");
    parseLiveOrdersResponse.mockReturnValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ boundary: "LIVE_EVIDENCE_STATUS_API", orders: [] }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    const response = await GET();
    const body = await responseJson(response);
    expect(fetch).toHaveBeenCalledWith(
      "https://worker.example/v1/orders",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        cache: "no-store",
      }),
    );

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      boundary: "LIVE_EVIDENCE_STATUS_API",
      code: "UPSTREAM_INVALID",
    });
  });

  it("returns upstream invalid when response JSON is invalid", async () => {
    resolveLiveEvidenceApiUrl.mockReturnValue("https://worker.example");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })),
    );

    const response = await GET();
    const body = await responseJson(response);

    expect(response.status).toBe(502);
    expect(body).toEqual({
      boundary: "LIVE_EVIDENCE_STATUS_API",
      code: "UPSTREAM_INVALID",
      error: "The worker status endpoint returned invalid JSON.",
    });
    expect(parseLiveOrdersResponse).not.toHaveBeenCalled();
  });

  it("returns unreachable when the worker host cannot be contacted", async () => {
    resolveLiveEvidenceApiUrl.mockReturnValue("https://worker.example");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connection refused")),
    );

    const response = await GET();
    const body = await responseJson(response);

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      boundary: "LIVE_EVIDENCE_STATUS_API",
      code: "UPSTREAM_UNAVAILABLE",
    });
  });

  it("proxies sanitized upstream data when valid", async () => {
    resolveLiveEvidenceApiUrl.mockReturnValue("https://worker.example");
    parseLiveOrdersResponse.mockReturnValue({
      boundary: "LIVE_EVIDENCE_STATUS_API",
      orders: [],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"boundary":"LIVE_EVIDENCE_STATUS_API","orders":[]}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const response = await GET();
    const body = await responseJson(response);
    expect(fetch).toHaveBeenCalledWith(
      "https://worker.example/v1/orders",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        cache: "no-store",
      }),
    );

    expect(response.status).toBe(200);
    expect(body).toEqual({
      boundary: "LIVE_EVIDENCE_STATUS_API",
      orders: [],
    });
    expect(parseLiveOrdersResponse).toHaveBeenCalledWith({
      boundary: "LIVE_EVIDENCE_STATUS_API",
      orders: [],
    });
  });
});
