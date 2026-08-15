import { describe, expect, it } from "vitest";

import { formatLegalDate, getLegalConfig, legalContactHref } from "./legal";

describe("legal configuration", () => {
  it("fails closed when owner metadata is missing or malformed", () => {
    const config = getLegalConfig({
      LEGAL_ENTITY_NAME: "LoomCredit Prototype",
      LEGAL_CONTACT_EMAIL: "not-an-email",
      LEGAL_ENTITY_ADDRESS: "Somewhere",
      LEGAL_GOVERNING_LAW: "India",
      LEGAL_EFFECTIVE_DATE: "2026-02-30",
    });

    expect(config.isPublishable).toBe(false);
    expect(config.contactEmail).toBeNull();
    expect(config.effectiveDate).toBeNull();
    expect(formatLegalDate("2026-02-30")).toBe("Not set");
    expect(legalContactHref(config.contactEmail)).toBeNull();
  });

  it("accepts complete owner metadata without exposing extra fields", () => {
    const config = getLegalConfig({
      LEGAL_ENTITY_NAME: "LoomCredit Prototype",
      LEGAL_CONTACT_EMAIL: "legal@example.com",
      LEGAL_ENTITY_ADDRESS: "Somewhere",
      LEGAL_GOVERNING_LAW: "India",
      LEGAL_EFFECTIVE_DATE: "2026-08-13",
    });

    expect(config).toEqual({
      entityName: "LoomCredit Prototype",
      contactEmail: "legal@example.com",
      entityAddress: "Somewhere",
      governingLaw: "India",
      effectiveDate: "2026-08-13",
      isPublishable: true,
    });
    expect(formatLegalDate(config.effectiveDate)).toContain("2026");
    expect(legalContactHref(config.contactEmail)).toBe(
      "mailto:legal@example.com",
    );
  });
});
