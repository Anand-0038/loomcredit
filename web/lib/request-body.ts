const DEFAULT_MAX_JSON_BYTES = 16 * 1024;

export class RequestBodyError extends Error {
  constructor(public readonly code: "TOO_LARGE" | "INVALID_JSON") {
    super(
      code === "TOO_LARGE"
        ? "The JSON request body is too large."
        : "Expected a valid JSON body.",
    );
    this.name = "RequestBodyError";
  }
}

export async function readJsonBody(
  request: Request,
  maxBytes = DEFAULT_MAX_JSON_BYTES,
): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
      throw new RequestBodyError("INVALID_JSON");
    }
    if (declaredLength > maxBytes) {
      throw new RequestBodyError("TOO_LARGE");
    }
  }

  if (!request.body) throw new RequestBodyError("INVALID_JSON");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError("TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new RequestBodyError("INVALID_JSON");
  }
}
