import {
  FacilityQuoteSchema,
  MODEL_VERSION,
  POLICY_VERSION,
  REASON_CODES,
  type EvidencePacket,
  type FacilityQuote,
} from "@loomcredit/shared";

export class ModelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelUnavailableError";
  }
}

export interface QuoteModelAdapter {
  generateQuote(packet: EvidencePacket, now?: number): Promise<unknown>;
}

interface AdapterConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const FACILITY_QUOTE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "decision",
    "advanceBps",
    "feeBps",
    "expiresAt",
    "riskTier",
    "reasonCodes",
    "evidenceIds",
    "policyVersion",
    "modelVersion",
  ],
  properties: {
    decision: { type: "string", enum: ["APPROVE", "REFER", "REJECT"] },
    advanceBps: { type: "integer", minimum: 0, maximum: 10_000 },
    feeBps: { type: "integer", minimum: 0, maximum: 10_000 },
    expiresAt: { type: "integer", minimum: 1 },
    riskTier: { type: "string", enum: ["A", "B", "C", "REFER"] },
    reasonCodes: {
      type: "array",
      minItems: 1,
      items: { type: "string", enum: REASON_CODES },
    },
    evidenceIds: {
      type: "array",
      minItems: 1,
      maxItems: 1,
      items: { type: "string", pattern: "^0x[a-fA-F0-9]{64}$" },
    },
    policyVersion: { type: "string", enum: [POLICY_VERSION] },
    modelVersion: { type: "string", enum: [MODEL_VERSION] },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractContent(body: unknown): string {
  if (!isRecord(body))
    throw new ModelUnavailableError("Model response was not an object");
  const choices = body.choices;
  if (
    !Array.isArray(choices) ||
    choices.length === 0 ||
    !isRecord(choices[0])
  ) {
    throw new ModelUnavailableError("Model response did not contain choices");
  }
  const message = choices[0].message;
  if (!isRecord(message) || typeof message.content !== "string") {
    throw new ModelUnavailableError(
      "Model response did not contain structured content",
    );
  }
  return message.content;
}

export class OpenAICompatibleQuoteAdapter implements QuoteModelAdapter {
  private readonly config: AdapterConfig;

  constructor(config: AdapterConfig) {
    this.config = config;
  }

  async generateQuote(
    packet: EvidencePacket,
    now = Math.floor(Date.now() / 1000),
  ): Promise<FacilityQuote> {
    const response = await fetch(
      `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "loomcredit_facility_quote",
              strict: true,
              schema: FACILITY_QUOTE_JSON_SCHEMA,
            },
          },
          messages: [
            {
              role: "system",
              content: `Return exactly one top-level JSON object matching the loomcredit_facility_quote schema. Do not wrap it in facilityQuote, evidence, quote, or any other key. Set modelVersion exactly to ${MODEL_VERSION}. Set policyVersion exactly to ${POLICY_VERSION}. Use exactly one evidence ID from the packet. Choose numeric quote values only from the packet and never invent evidence. Use decision APPROVE only when you can justify a positive advance; an APPROVE quote must have advanceBps at least 1. If a positive advance cannot be justified, use REFER or REJECT instead. Never return APPROVE with advanceBps 0. Current Unix time is ${now}; expiresAt must be an integer from ${now} through ${now + 600}. I will parse this response programmatically.`,
            },
            { role: "user", content: JSON.stringify(packet) },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      },
    ).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "network error";
      throw new ModelUnavailableError(`Model request failed: ${message}`);
    });

    if (!response.ok) {
      throw new ModelUnavailableError(
        `Model request returned HTTP ${response.status}`,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ModelUnavailableError("Model returned an unreadable response");
    }
    const content = extractContent(body);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content) as unknown;
    } catch {
      throw new ModelUnavailableError("Model returned invalid JSON");
    }
    const parsedQuote = FacilityQuoteSchema.safeParse(parsedJson);
    if (!parsedQuote.success) {
      throw new ModelUnavailableError(
        `Model quote failed schema validation: ${parsedQuote.error.message}`,
      );
    }
    return parsedQuote.data;
  }
}

export function adapterFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): QuoteModelAdapter | null {
  const baseUrl = env.MODEL_BASE_URL;
  const apiKey = env.MODEL_API_KEY;
  const model = env.MODEL_NAME;
  if (!baseUrl || !apiKey || !model) return null;
  return new OpenAICompatibleQuoteAdapter({ baseUrl, apiKey, model });
}
