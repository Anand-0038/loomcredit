import { CheckCircle } from "@phosphor-icons/react/dist/ssr";

import { demoStages } from "../lib/demo-data";

type StageStatus = "verified" | "fixture" | "next";

type Stage = {
  title: string;
  description: string;
  status: StageStatus;
};

const liveStages = [
  {
    title: "Source event",
    description: "OrderGuaranteed · Sepolia receipt",
    status: "verified",
  },
  {
    title: "USC proof",
    description: "Attestation and continuity proof retrieved",
    status: "verified",
  },
  {
    title: "Facility registry",
    description: "EVIDENCE_VERIFIED · CC3 state read back",
    status: "verified",
  },
  {
    title: "RiskGuard",
    description: "Awaiting a signed underwriting quote",
    status: "next",
  },
] satisfies Stage[];

export function StageRail({ mode = "local" }: { mode?: "local" | "live" }) {
  const stages: Stage[] = mode === "live" ? liveStages : demoStages;
  return (
    <div className="proof-stage-panel">
      <div className="proof-stage-heading">
        <span>
          {mode === "live"
            ? "Live verification sequence"
            : "Local policy sequence"}
        </span>
        <span>{mode === "live" ? "3 verified · 1 next" : "fixture only"}</span>
      </div>
      <ol
        className="proof-stage-list"
        aria-label={
          mode === "live" ? "Live workflow stages" : "Local workflow stages"
        }
      >
        {stages.map((stage, index) => (
          <li
            className={`proof-stage ${stage.status}${
              stage.status === "verified" ? " complete" : ""
            }`}
            key={stage.title}
          >
            <span className="proof-stage-number" aria-hidden="true">
              {stage.status === "verified" ? (
                <CheckCircle size={18} weight="bold" aria-hidden="true" />
              ) : (
                index + 1
              )}
            </span>
            <div>
              <h3>{stage.title}</h3>
              <p>{stage.description}</p>
            </div>
            <span className={`proof-stage-status ${stage.status}`}>
              {stage.status === "verified"
                ? "Verified"
                : stage.status === "fixture"
                  ? "Fixture"
                  : "Next"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
