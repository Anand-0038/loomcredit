import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EvidencePacketSchema,
  FacilityQuoteSchema,
} from "../../shared/src/schemas.js";
import { z } from "zod";

import type {
  ProposalProcessInput,
  ProposalProcessOutput,
} from "./status-server.js";

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BYTES32 = /^0x[a-fA-F0-9]{64}$/;

const agentPolicySchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED", "REFER"]),
    failureCode: z.string().optional(),
    requestedAdvanceMinor: z.number().int().nonnegative(),
    approvedAdvanceMinor: z.number().int().nonnegative(),
    checks: z.array(
      z
        .object({
          id: z.string().min(1),
          label: z.string().min(1),
          status: z.enum(["PASS", "FAIL", "NOT_APPLICABLE"]),
          actual: z.string(),
          limit: z.string(),
          failureCode: z.string().optional(),
        })
        .strict(),
    ),
  })
  .nullable();

const agentArtifactSchema = z
  .object({
    boundary: z.string().min(1),
    proofStatus: z.literal("LIVE_VERIFIED"),
    evidenceId: z.string().regex(BYTES32),
    orderId: z.string().regex(BYTES32),
    mode: z.enum(["MODEL", "REFER", "LOCAL_FIXTURE"]),
    quote: FacilityQuoteSchema,
    policy: agentPolicySchema,
    signing: z
      .object({
        status: z.enum(["NOT_REQUESTED", "NOT_ELIGIBLE", "SIGNED"]),
      })
      .passthrough(),
  })
  .strict();

export interface PublicProposal {
  boundary: "LIVE_PROPOSAL";
  requestId: string;
  sourceTxHash: string;
  orderId: string;
  evidenceId: string;
  proofStatus: "LIVE_VERIFIED";
  mode: "MODEL" | "REFER";
  provider: string | null;
  model: string | null;
  decision: "APPROVED" | "REJECTED" | "REFER";
  terms: {
    requestedAdvanceBps: number;
    requestedDeliveryDays: number;
    quotedAdvanceBps: number;
    evidenceTenorDays: number;
    status:
      | "MATCHED"
      | "REQUESTED_ADVANCE_EXCEEDED"
      | "DELIVERY_EXCEEDS_EVIDENCE"
      | "NOT_EVALUATED";
  };
  quote: z.infer<typeof FacilityQuoteSchema>;
  policy: z.infer<typeof agentPolicySchema>;
  signing: { status: "NOT_REQUESTED" | "NOT_ELIGIBLE" | "SIGNED" };
}

function extractJson(stdout: string, label: string): unknown {
  try {
    return JSON.parse(stdout.trim()) as unknown;
  } catch {
    throw new Error(label + " returned invalid JSON");
  }
}

async function runCommand(
  command: string,
  args: string[],
  label: string,
): Promise<string> {
  try {
    const result = await execFileAsync(command, args, {
      cwd: workspaceRoot,
      env: process.env,
      timeout: 45_000,
      maxBuffer: 2_000_000,
    });
    return result.stdout;
  } catch {
    throw new Error(label + " failed");
  }
}

function providerHost(): string | null {
  const baseUrl = process.env.MODEL_BASE_URL?.trim();
  if (!baseUrl) return null;
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return null;
  }
}

async function buildAgentArtifact(input: ProposalProcessInput) {
  const temporaryDirectory = await mkdtemp(
    resolve(tmpdir(), "loomcredit-proposal-"),
  );
  const packetPath = resolve(temporaryDirectory, "evidence-packet.json");
  try {
    const packetStdout = await runCommand(
      process.execPath,
      [
        "--env-file-if-exists=.env",
        "scripts/build-evidence-packet.mjs",
        "--packet-only",
        "--source-tx-hash",
        input.sourceTxHash,
      ],
      "Evidence packet builder",
    );
    const packet = EvidencePacketSchema.parse(
      extractJson(packetStdout, "Evidence packet builder"),
    );
    if (
      packet.orderId.toLowerCase() !== input.event.orderId.toLowerCase() ||
      packet.evidenceId.toLowerCase() !== input.event.evidenceId?.toLowerCase()
    ) {
      throw new Error(
        "Evidence packet does not match the verified worker event",
      );
    }
    await writeFile(packetPath, JSON.stringify(packet), "utf8");
    const corepack = process.platform === "win32" ? "corepack.cmd" : "corepack";
    const artifactStdout = await runCommand(
      corepack,
      ["pnpm", "--filter", "@loomcredit/agent", "quote", packetPath],
      "Structured quote agent",
    );
    return {
      packet,
      artifact: agentArtifactSchema.parse(
        extractJson(artifactStdout, "Structured quote agent"),
      ),
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function processLiveProposal(
  input: ProposalProcessInput,
): Promise<ProposalProcessOutput> {
  if (input.event.eventType !== "ORDER_GUARANTEED") {
    return {
      statusCode: 422,
      payload: {
        boundary: "LIVE_PROPOSAL",
        code: "PROPOSAL_UNSUPPORTED_EVENT",
        error:
          "Facility proposals are available only for verified OrderGuaranteed evidence.",
      },
    };
  }
  try {
    const { packet, artifact } = await buildAgentArtifact(input);
    if (artifact.mode === "LOCAL_FIXTURE") {
      return {
        statusCode: 503,
        payload: {
          boundary: "LIVE_PROPOSAL",
          code: "FIXTURE_NOT_ALLOWED",
          error: "The live proposal boundary rejected a fixture artifact.",
        },
      };
    }

    const termsStatus =
      artifact.mode !== "MODEL"
        ? "NOT_EVALUATED"
        : artifact.quote.advanceBps > input.requestedAdvanceBps
          ? "REQUESTED_ADVANCE_EXCEEDED"
          : input.deliveryDays > packet.tenorDays
            ? "DELIVERY_EXCEEDS_EVIDENCE"
            : "MATCHED";
    const decision =
      artifact.mode !== "MODEL"
        ? "REFER"
        : termsStatus !== "MATCHED"
          ? "REJECTED"
          : (artifact.policy?.decision ?? "REFER");
    const provider = artifact.mode === "MODEL" ? providerHost() : null;
    const configuredModel = process.env.MODEL_NAME?.trim();
    const model =
      artifact.mode === "MODEL" && configuredModel ? configuredModel : null;
    const proposal: PublicProposal = {
      boundary: "LIVE_PROPOSAL",
      requestId: input.requestId,
      sourceTxHash: input.sourceTxHash,
      orderId: artifact.orderId,
      evidenceId: artifact.evidenceId,
      proofStatus: artifact.proofStatus,
      mode: artifact.mode === "MODEL" ? "MODEL" : "REFER",
      provider,
      model,
      decision,
      terms: {
        requestedAdvanceBps: input.requestedAdvanceBps,
        requestedDeliveryDays: input.deliveryDays,
        quotedAdvanceBps: artifact.quote.advanceBps,
        evidenceTenorDays: packet.tenorDays,
        status: termsStatus,
      },
      quote: artifact.quote,
      policy: artifact.policy,
      signing: { status: artifact.signing.status },
    };
    return { statusCode: 200, payload: proposal };
  } catch (error) {
    const code =
      error instanceof Error && error.message.includes("returned invalid JSON")
        ? "MODEL_INVALID_RESPONSE"
        : "PROPOSAL_UNAVAILABLE";
    return {
      statusCode: 503,
      payload: {
        boundary: "LIVE_PROPOSAL",
        code,
        error:
          code === "MODEL_INVALID_RESPONSE"
            ? "The configured model returned a response that failed structured validation."
            : "The worker could not build a fresh verified evidence packet for this proposal.",
      },
    };
  }
}
