import { describe, expect, it } from "vitest";

import { readJsonBody, RequestBodyError } from "./request-body";

describe("bounded JSON request bodies", () => {
  it("parses a valid body within the byte limit", async () => {
    await expect(
      readJsonBody(
        new Request("http://localhost", {
          method: "POST",
          body: '{"ok":true}',
        }),
        64,
      ),
    ).resolves.toEqual({ ok: true });
  });

  it("rejects a declared body larger than the limit before reading it", async () => {
    await expect(
      readJsonBody(
        new Request("http://localhost", {
          method: "POST",
          body: "{}",
          headers: { "content-length": "100" },
        }),
        64,
      ),
    ).rejects.toMatchObject({
      code: "TOO_LARGE",
    } satisfies Partial<RequestBodyError>);
  });

  it("rejects chunked bodies that exceed the limit", async () => {
    await expect(
      readJsonBody(
        new Request("http://localhost", {
          method: "POST",
          body: "x".repeat(65),
        }),
        64,
      ),
    ).rejects.toMatchObject({
      code: "TOO_LARGE",
    } satisfies Partial<RequestBodyError>);
  });

  it("rejects malformed JSON", async () => {
    await expect(
      readJsonBody(
        new Request("http://localhost", {
          method: "POST",
          body: "not-json",
        }),
        64,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_JSON",
    } satisfies Partial<RequestBodyError>);
  });
});
