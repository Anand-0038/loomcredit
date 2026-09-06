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
        "/api/cases",
        "/api/cases/{caseId}",
        "/api/cases/{caseId}/proposal",
        "/api/cases/{caseId}/reviews",
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
    expect(serialized).toContain("LIVE_CASE_INTAKE");
    expect(openApiDocument.paths["/api/cases"].post.security).toEqual([
      { sessionCookie: [] },
    ]);
    expect(openApiDocument.paths["/api/cases"].get.security).toEqual([
      { sessionCookie: [] },
    ]);
    expect(
      openApiDocument.paths["/api/cases"].get.responses["200"],
    ).toBeDefined();
    expect(
      openApiDocument.paths["/api/cases/{caseId}/proposal"].post.security,
    ).toEqual([{ sessionCookie: [] }]);
    expect(
      openApiDocument.paths["/api/cases/{caseId}/proposal"].post.responses[
        "422"
      ],
    ).toBeDefined();
    expect(openApiDocument.components.schemas.CaseResponse.required).toContain(
      "proposal",
    );
    expect(openApiDocument.components.schemas.CaseListItem).not.toHaveProperty(
      "allOf",
    );
    expect(openApiDocument.components.schemas.CaseListItem.required).toEqual(
      expect.arrayContaining([
        "caseId",
        "status",
        "updatedAt",
        "proposalAvailable",
      ]),
    );
    expect(openApiDocument.components.schemas.LiveOrder.required).toContain(
      "sourceOrder",
    );
    expect(openApiDocument.components.schemas.IntakeStatus.required).toContain(
      "history",
    );
    expect(
      openApiDocument.components.schemas.ProposalResponse.properties,
    ).toEqual(
      expect.objectContaining({
        boundary: { const: "LIVE_PROPOSAL" },
        proofStatus: { const: "LIVE_VERIFIED" },
      }),
    );
    expect(
      openApiDocument.paths["/api/auth/nonce"].post.responses["429"],
    ).toBeDefined();
    expect(
      openApiDocument.paths["/api/auth/verify"].post.responses["429"],
    ).toBeDefined();
    const demoRequest =
      openApiDocument.paths["/api/demo/evaluate"].post.requestBody.content[
        "application/json"
      ];
    expect(demoRequest.examples.safe.value).toEqual({ mode: "safe" });
    expect(demoRequest.examples.custom.value).toEqual({
      mode: "custom",
      advanceBps: 3_000,
      deliveryDays: 45,
    });
    expect(demoRequest.schema.properties.advanceBps).toEqual(
      expect.objectContaining({ minimum: 0, maximum: 10_000 }),
    );
    expect(
      openApiDocument.components.schemas.FixtureEvaluation.required,
    ).toContain("trace");
    expect(
      openApiDocument.components.schemas.FixtureEvaluation.properties,
    ).toEqual(
      expect.objectContaining({
        quote: { $ref: "#/components/schemas/FacilityQuote" },
        policy: { $ref: "#/components/schemas/PolicyEvaluation" },
      }),
    );
    expect(
      openApiDocument.components.schemas.PolicyEvaluation.required,
    ).toEqual(expect.arrayContaining(["decision", "checks"]));
    expect(openApiDocument.components.schemas.DecisionTrace.properties).toEqual(
      expect.objectContaining({
        requestId: expect.objectContaining({ format: "uuid" }),
        inputHash: expect.objectContaining({ pattern: "^[a-f0-9]{64}$" }),
      }),
    );
    expect(
      openApiDocument.components.schemas.FixtureEvaluation.properties.mode.enum,
    ).toContain("custom");
    expect(openApiDocument.components.securitySchemes.sessionCookie).toEqual(
      expect.objectContaining({ in: "cookie", name: "loomcredit_session" }),
    );
  });
});
