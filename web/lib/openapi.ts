export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "LoomCredit public web API",
    version: "0.1.0",
    description:
      "Read-only testnet evidence, deterministic local policy evaluation, health, and wallet-authentication endpoints. This API does not issue loans, custody funds, submit blockchain transactions from the browser, or expose worker credentials.",
  },
  servers: [{ url: "/", description: "The deployed LoomCredit web origin" }],
  externalDocs: {
    description: "Human-readable API documentation",
    url: "/docs/integrations/api",
  },
  tags: [
    { name: "Health", description: "Bounded service and upstream status." },
    {
      name: "Evidence",
      description: "Sanitized, read-only worker evidence status.",
    },
    {
      name: "Local demo",
      description: "Deterministic fixture policy scenarios only.",
    },
    {
      name: "Authentication",
      description: "EIP-191 wallet sign-in and expiring HttpOnly sessions.",
    },
    {
      name: "Meta",
      description: "Publicly exposed artifact and contract description.",
    },
  ],
  paths: {
    "/openapi.json": {
      get: {
        tags: ["Meta"],
        operationId: "getOpenApiDocument",
        summary: "Download the public OpenAPI contract",
        description:
          "Returns the current JSON OpenAPI document rendered by the web service.",
        responses: {
          "200": {
            description: "Current public OpenAPI document.",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
    },
    "/api/health": {
      get: {
        tags: ["Health"],
        operationId: "getHealth",
        summary: "Get bounded web and worker-feed health",
        responses: {
          "200": {
            description:
              "The web route is available; worker reachability is reported separately.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
        },
      },
    },
    "/api/ready": {
      get: {
        tags: ["Health"],
        operationId: "getReadiness",
        summary: "Check readiness for the configured evidence dependency",
        description:
          "Returns 200 only when the configured worker evidence feed is reachable and schema-valid. Local development without a configured feed is intentionally not ready.",
        responses: {
          "200": {
            description: "The web service and evidence dependency are ready.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReadyResponse" },
              },
            },
          },
          "503": {
            description:
              "The evidence dependency is not configured or unavailable.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/NotReadyResponse" },
              },
            },
          },
        },
      },
    },
    "/api/live-evidence": {
      get: {
        tags: ["Evidence"],
        operationId: "listLiveEvidence",
        summary: "List sanitized worker evidence status",
        description:
          "Returns only worker records that pass the server-side evidence schema. The route is read-only.",
        responses: {
          "200": {
            description: "Sanitized evidence records.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LiveOrdersResponse" },
              },
            },
          },
          "502": { $ref: "#/components/responses/UpstreamError" },
          "503": { $ref: "#/components/responses/UpstreamError" },
        },
      },
    },
    "/api/demo/evaluate": {
      post: {
        tags: ["Local demo"],
        operationId: "evaluateLocalFixture",
        summary: "Evaluate a deterministic local policy scenario",
        description:
          "This endpoint uses fixture data and never calls a model, wallet, proof builder, or blockchain transaction.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["mode"],
                properties: {
                  mode: {
                    type: "string",
                    enum: ["safe", "unsafe", "cancelled"],
                  },
                },
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Fixture quote and deterministic policy result.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/FixtureEvaluation" },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "413": { $ref: "#/components/responses/RequestTooLarge" },
        },
      },
    },
    "/api/auth/nonce": {
      post: {
        tags: ["Authentication"],
        operationId: "issueAuthNonce",
        summary: "Issue a one-time wallet sign-in message",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["address", "chainId"],
                properties: {
                  address: { type: "string", description: "EVM address." },
                  chainId: { oneOf: [{ type: "string" }, { type: "number" }] },
                },
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "200": {
            description: "One-time message and expiration.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthNonceResponse" },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/api/auth/verify": {
      post: {
        tags: ["Authentication"],
        operationId: "verifyAuthSignature",
        summary: "Verify a wallet signature and create a session",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: [
                  "address",
                  "chainId",
                  "nonce",
                  "message",
                  "signature",
                ],
                properties: {
                  address: { type: "string" },
                  chainId: { oneOf: [{ type: "string" }, { type: "number" }] },
                  nonce: { type: "string" },
                  message: { type: "string" },
                  signature: { type: "string" },
                },
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Authenticated session created in an HttpOnly cookie.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthSessionResponse" },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "409": { $ref: "#/components/responses/Conflict" },
          "413": { $ref: "#/components/responses/RequestTooLarge" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/api/auth/session": {
      get: {
        tags: ["Authentication"],
        operationId: "getAuthSession",
        summary: "Read the sanitized current session",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": {
            description: "Authenticated or anonymous session state.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthSessionResponse" },
              },
            },
          },
        },
      },
    },
    "/api/auth/sign-out": {
      post: {
        tags: ["Authentication"],
        operationId: "signOut",
        summary: "Revoke the current session",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": {
            description:
              "Session cookie cleared and session revoked when present.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SignOutResponse" },
              },
            },
          },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "loomcredit_session",
      },
    },
    responses: {
      BadRequest: {
        description: "The request failed boundary validation.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      Unauthorized: {
        description: "The signature or nonce is invalid.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      Forbidden: {
        description:
          "The request origin or authentication boundary is rejected.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      Conflict: {
        description: "The nonce was already claimed or used.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      UpstreamError: {
        description: "The worker feed is unavailable or invalid.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      RequestTooLarge: {
        description: "The JSON request body exceeds the endpoint limit.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      RateLimited: {
        description:
          "The single-instance application limiter rejected the request; distributed deployments also require a trusted edge limiter.",
        headers: {
          "Retry-After": {
            description: "Seconds until another request may be attempted.",
            schema: { type: "integer", minimum: 1 },
          },
        },
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        required: ["boundary", "code", "error"],
        properties: {
          boundary: { type: "string" },
          code: { type: "string" },
          error: { type: "string" },
        },
        additionalProperties: false,
      },
      HealthResponse: {
        type: "object",
        required: [
          "status",
          "service",
          "liveIntegrationConfigured",
          "liveEvidenceConfigured",
          "liveEvidenceApi",
          "liveEvidenceUpstream",
          "liveEvidenceEndpoint",
          "latestVerifiedOrder",
          "workerSecrets",
          "proofBoundary",
        ],
        properties: {
          status: { const: "ok" },
          service: { const: "loomcredit-web" },
          liveIntegrationConfigured: { type: "boolean" },
          liveEvidenceConfigured: { type: "boolean" },
          liveEvidenceApi: { enum: ["configured", "not-configured"] },
          liveEvidenceUpstream: {
            enum: ["reachable", "unavailable", "invalid", "not-configured"],
          },
          liveEvidenceEndpoint: { const: "/api/live-evidence" },
          latestVerifiedOrder: { type: ["string", "null"] },
          workerSecrets: { const: "not-applicable" },
          proofBoundary: { const: "external USC worker only" },
        },
        additionalProperties: false,
      },
      ReadyResponse: {
        type: "object",
        required: [
          "status",
          "service",
          "dependency",
          "upstream",
          "latestVerifiedOrder",
        ],
        properties: {
          status: { const: "ready" },
          service: { const: "loomcredit-web" },
          dependency: { const: "live-evidence" },
          upstream: { const: "reachable" },
          latestVerifiedOrder: { type: ["string", "null"] },
        },
        additionalProperties: false,
      },
      NotReadyResponse: {
        type: "object",
        required: ["status", "service", "dependency", "upstream", "code"],
        properties: {
          status: { const: "not-ready" },
          service: { const: "loomcredit-web" },
          dependency: { const: "live-evidence" },
          upstream: { enum: ["not-configured", "unavailable", "invalid"] },
          code: {
            enum: ["LIVE_EVIDENCE_NOT_CONFIGURED", "LIVE_EVIDENCE_UNAVAILABLE"],
          },
        },
        additionalProperties: false,
      },
      LiveOrdersResponse: {
        type: "object",
        required: ["boundary", "orders"],
        properties: {
          boundary: { const: "LIVE_EVIDENCE_STATUS_API" },
          orders: {
            type: "array",
            maxItems: 100,
            items: { $ref: "#/components/schemas/LiveOrder" },
          },
        },
        additionalProperties: false,
      },
      LiveOrder: {
        type: "object",
        required: [
          "sourceEventKey",
          "sourceTxHash",
          "sourceChainKey",
          "sourceEmitter",
          "orderId",
          "eventType",
          "txIndex",
          "logIndex",
          "stage",
          "proofStatus",
          "evidenceId",
          "creditcoinTxHash",
          "retryCount",
          "blockHeight",
          "stageTimestamps",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          sourceEventKey: { type: "string" },
          sourceTxHash: { type: "string", pattern: "^0x[a-fA-F0-9]{64}$" },
          sourceChainKey: { type: "integer", minimum: 0 },
          sourceEmitter: { type: ["string", "null"] },
          orderId: { type: "string", pattern: "^0x[a-fA-F0-9]{64}$" },
          eventType: {
            enum: [
              "ORDER_GUARANTEED",
              "ORDER_CANCELLED",
              "ORDER_DISPUTED",
              "ORDER_SETTLED",
            ],
          },
          txIndex: { type: ["integer", "null"], minimum: 0 },
          logIndex: { type: "integer", minimum: 0 },
          stage: {
            enum: [
              "DETECTED",
              "WAITING_FOR_ATTESTATION",
              "PROOF_REQUESTED",
              "PROOF_READY",
              "CREDITCOIN_SUBMITTED",
              "VERIFIED",
              "FAILED_RETRYABLE",
              "FAILED_TERMINAL",
            ],
          },
          proofStatus: { enum: ["LIVE_VERIFIED", "PENDING", "FAILED"] },
          evidenceId: { type: ["string", "null"] },
          creditcoinTxHash: { type: ["string", "null"] },
          retryCount: { type: "integer", minimum: 0 },
          blockHeight: { type: ["integer", "null"], minimum: 0 },
          stageTimestamps: {
            type: "object",
            additionalProperties: { type: "string", format: "date-time" },
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
        additionalProperties: false,
      },
      FixtureEvaluation: {
        type: "object",
        required: ["boundary", "mode", "quote", "policy"],
        properties: {
          boundary: { const: "LOCAL_FIXTURE_ONLY" },
          mode: { enum: ["safe", "unsafe", "cancelled"] },
          quote: { type: "object", additionalProperties: true },
          policy: { type: "object", additionalProperties: true },
        },
        additionalProperties: false,
      },
      AuthNonceResponse: {
        type: "object",
        required: ["boundary", "nonce", "message", "chainId", "expiresAt"],
        properties: {
          boundary: { const: "AUTHENTICATION" },
          nonce: { type: "string" },
          message: { type: "string" },
          chainId: { type: "integer" },
          expiresAt: { type: "string", format: "date-time" },
        },
        additionalProperties: false,
      },
      AuthSessionResponse: {
        type: "object",
        required: ["boundary", "authenticated", "user"],
        properties: {
          boundary: { const: "AUTHENTICATION" },
          authenticated: { type: "boolean" },
          user: {
            oneOf: [
              { type: "null" },
              {
                type: "object",
                required: ["accountId", "address", "role", "expiresAt"],
                properties: {
                  accountId: { type: "string" },
                  address: { type: "string" },
                  role: { enum: ["viewer", "operator"] },
                  expiresAt: { type: "string", format: "date-time" },
                },
                additionalProperties: false,
              },
            ],
          },
        },
        additionalProperties: false,
      },
      SignOutResponse: {
        type: "object",
        required: ["boundary", "authenticated"],
        properties: {
          boundary: { const: "AUTHENTICATION" },
          authenticated: { const: false },
        },
        additionalProperties: false,
      },
    },
  },
} as const;
