# First customer workflow

LoomCredit is currently a technical testnet prototype. This document keeps the
product decision narrow while separating the workflow we can demonstrate from
the commercial validation we still need to earn.

## Initial operator

The first user is a lender or marketplace risk operator reviewing buyer-backed
supplier-finance cases. This is an operator workflow, not a public borrowing
pool and not a consumer lending application.

## Job to be done

> Before a financing decision, determine whether a buyer-backed trade event is
> real, admissible, current, and inside the requested policy envelope without
> trusting a screenshot or letting an AI response move capital.

The current prototype tests this job with a source transaction reference and
requested terms. A production connector would supply the reference from a
marketplace or trade system so the operator would not need to copy a hash by
hand.

## Operator journey

1. Connect the operator wallet and sign a one-time server login message.
2. Enter or receive a source-chain transaction and request an advance and
   delivery tenor.
3. Let the worker inspect the receipt, supported event, finality, USC proof,
   and Creditcoin registry read-back.
4. Return to the operator case inbox and open the durable case record. Inspect
   the source receipt, CC3 receipt, order ID, evidence ID, lifecycle, and
   failure state. Search and workflow filters make retry, proposal, and review
   queues explicit without inventing portfolio data.
5. Request a server-side structured proposal bound to the exact evidence and
   exact requested terms. Missing evidence or model configuration must produce
   a visible referral. The latest sanitized result is retained with the case
   so a refresh does not erase the decision context.
6. Record an append-only human outcome bound to that proposal: accept the
   recommendation, refer for more information, or decline the case. Acceptance
   is fail-closed unless the policy approved the terms and the current worker
   read-back still shows eligible live evidence.
7. Keep any signed RiskGuard action as a separate human-present gate. The
   current browser flow records review context but does not submit a quote,
   reserve capital, or approve a loan.

## Outcome hypothesis

The first measurable outcome should be one of these, measured with design
partners rather than invented in the demo:

- lower evidence-review time per financing case;
- fewer duplicate or replayed-financing checks; or
- a higher percentage of cases that a lender can review without chasing proof
  across multiple systems.

No customer, time-saving, repayment, default, or lending-volume claim is made
until a named operator supplies comparative data.

## Product boundary today

Implemented and demonstrable:

- durable source intake and retry for a supported live testnet event;
- native USC verification and evidence registry read-back;
- caller-owned case inspection with explicit failure states;
- searchable authenticated case queue with workflow and review filters;
- durable latest proposal state and append-only proposal-bound review history;
- request-scoped structured proposal boundary with deterministic term checks;
- fail-closed `REFER` behavior when evidence or the model is unavailable.

Not yet a production capability:

- marketplace or ERP source connectors;
- borrower onboarding, KYB/KYC, document custody, or repayment servicing;
- regulated lending, disbursement, custody, or customer capital;
- physical delivery verification or off-chain duplicate-financing prevention;
- multi-instance hosted auth, managed data storage, and production observability.

## Validation questions

Before expanding the product, interview one marketplace risk team and one
lender or trade-finance operator:

- Which evidence sources are checked today, and how long does one review take?
- Which duplicate, replay, cancellation, or stale-order failures are costly?
- Who owns the final approval and regulated lending relationship?
- What system should create the case instead of a manually entered hash?
- What evidence would make a referral actionable rather than just another
  dashboard status?

Until these questions have real answers, keep the feature set centered on the
evidence-to-proposal path and do not add tokenomics, arbitrary document upload,
or decorative AI features.
