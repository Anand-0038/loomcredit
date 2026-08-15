import { DEMO_EVIDENCE_PACKET } from "@loomcredit/shared";

import { localFixtureQuote } from "./quote.js";

const kind = process.argv[2] === "unsafe" ? "unsafe" : "safe";
const result = localFixtureQuote(kind);
console.log(
  JSON.stringify(
    {
      boundary: "LOCAL_FIXTURE_ONLY",
      proofStatus: DEMO_EVIDENCE_PACKET.proofStatus,
      orderId: DEMO_EVIDENCE_PACKET.orderId,
      quote: result.quote,
      policy: result.policy,
    },
    null,
    2,
  ),
);
