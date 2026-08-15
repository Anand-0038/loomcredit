import { describe, expect, it } from "vitest";

import { docsPages, docsPath, findDocsPage } from "./docs";

describe("documentation registry", () => {
  it("has unique, routable pages with useful section anchors", () => {
    const slugs = docsPages.map((page) => page.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    for (const page of docsPages) {
      expect(page.title.length).toBeGreaterThan(10);
      expect(page.description.length).toBeGreaterThan(30);
      expect(page.sections.length).toBeGreaterThan(1);
      expect(new Set(page.sections.map((section) => section.id)).size).toBe(
        page.sections.length,
      );
      expect(docsPath(page.slug)).toMatch(/^\/docs(?:\/.*)?$/);
      for (const section of page.sections) {
        for (const block of section.blocks) {
          if (block.kind === "table") {
            expect(
              block.rows.every((row) => row.length === block.columns.length),
            ).toBe(true);
          }
        }
      }
    }
  });

  it("resolves the core developer paths", () => {
    expect(findDocsPage("")?.title).toBe("Build with verified trade evidence");
    expect(findDocsPage("integrations/api")?.label).toBe("HTTP API");
    expect(findDocsPage("cli")?.label).toBe("CLI reference");
    expect(docsPages.some((page) => page.group === "Strategy")).toBe(false);
    expect(findDocsPage("missing")).toBeUndefined();
  });
});
