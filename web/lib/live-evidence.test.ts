import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LIVE_EVIDENCE_BOUNDARY,
  resolveLiveEvidenceApiUrl,
} from "./live-evidence";

function env(value: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...(process.env as NodeJS.ProcessEnv),
    NODE_ENV: "test",
    ...value,
  };
}

describe("live evidence endpoint resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers server-only URL over public URL", () => {
    const url = resolveLiveEvidenceApiUrl(
      env({
        LIVE_EVIDENCE_API_URL: "http://internal.example:8787",
        NEXT_PUBLIC_LIVE_EVIDENCE_API_URL: "https://public.example",
      }),
    );
    expect(url).toBe("http://internal.example:8787");
  });

  it("normalizes protocol URLs and trims hash/query/path artifacts", () => {
    const url = resolveLiveEvidenceApiUrl(
      env({
        LIVE_EVIDENCE_API_URL:
          "https://worker.example:8787/v1/orders#proof?ignore=1",
      }),
    );
    expect(url).toBe("https://worker.example:8787");
  });

  it("strips accidental /v1/orders suffix to avoid endpoint duplication", () => {
    const url = resolveLiveEvidenceApiUrl(
      env({
        LIVE_EVIDENCE_API_URL: "https://worker.example:8787/api/v1/orders",
      }),
    );
    expect(url).toBe("https://worker.example:8787/api");
  });

  it("strips repeated /v1/orders suffixes", () => {
    const url = resolveLiveEvidenceApiUrl(
      env({
        LIVE_EVIDENCE_API_URL:
          "https://worker.example:8787/api/v1/orders/v1/orders",
      }),
    );
    expect(url).toBe("https://worker.example:8787/api");
  });

  it("strips trailing /v1 to avoid endpoint duplication", () => {
    const url = resolveLiveEvidenceApiUrl(
      env({
        LIVE_EVIDENCE_API_URL: "https://worker.example:8787/v1",
      }),
    );
    expect(url).toBe("https://worker.example:8787");
  });

  it("rejects unsupported protocols", () => {
    const url = resolveLiveEvidenceApiUrl(
      env({
        LIVE_EVIDENCE_API_URL: "ftp://worker.example",
      }),
    );
    expect(url).toBeNull();
  });

  it("resolves public URL fallback", () => {
    const url = resolveLiveEvidenceApiUrl(
      env({
        NEXT_PUBLIC_LIVE_EVIDENCE_API_URL: "https://public.example:8787",
      }),
    );
    expect(url).toBe("https://public.example:8787");
  });

  it("returns the public boundary constant", () => {
    expect(LIVE_EVIDENCE_BOUNDARY).toBe("LIVE_EVIDENCE_STATUS_API");
  });
});
