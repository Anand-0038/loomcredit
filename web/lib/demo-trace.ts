export const DEMO_TRACE_SCHEMA_VERSION = "fixture-evaluation-v1" as const;

export interface DemoTrace {
  requestId: string;
  evaluatedAt: string;
  evaluationDurationMs: number;
  inputHash: string;
  schemaVersion: typeof DEMO_TRACE_SCHEMA_VERSION;
  origin: "FIXTURE";
  boundary: "LOCAL_FIXTURE_ONLY";
  policyVersion: string;
}
