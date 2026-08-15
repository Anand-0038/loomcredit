import { describe, expect, it } from "vitest";

import { openApiDocument } from "./openapi";

describe("public OpenAPI contract", () => {
  it("describes every public API route", () => {
    expect(Object.keys(openApiDocument.paths).sort()).toEqual(
      [
        "/openapi.json",
        "/api/auth/nonce",
        "/api/auth/session",
        "/api/auth/sign-out",
        "/api/auth/verify",
        "/api/demo/evaluate",
        "/api/health",
        "/api/live-evidence",
        "/api/ready",
      ].sort(),
    );
  });

  it("keeps the product boundaries explicit", () => {
    const serialized = JSON.stringify(openApiDocument);
    expect(serialized).toContain("LOCAL_FIXTURE_ONLY");
    expect(serialized).toContain("LIVE_EVIDENCE_STATUS_API");
    expect(serialized).toContain("does not issue loans");
    expect(
      openApiDocument.paths["/api/auth/nonce"].post.responses["429"],
    ).toBeDefined();
    expect(
      openApiDocument.paths["/api/auth/verify"].post.responses["429"],
    ).toBeDefined();
    expect(openApiDocument.components.securitySchemes.sessionCookie).toEqual(
      expect.objectContaining({ in: "cookie", name: "loomcredit_session" }),
    );
  });
});
