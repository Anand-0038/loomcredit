import type { TransactionReceipt } from "ethers";
import { describe, expect, it } from "vitest";

import {
  parseOrderGuaranteedLog,
  parseSourceEventLog,
  sourceInterface,
} from "../src/proof.js";

const sourceEscrowAddress = `0x${"11".repeat(20)}`;
const sourceTxHash = `0x${"aa".repeat(32)}`;

function eventLog(orderId = "0x" + "bb".repeat(32)) {
  const encoded = sourceInterface.encodeEventLog(
    sourceInterface.getEvent("OrderGuaranteed")!,
    [
      orderId,
      `0x${"22".repeat(20)}`,
      `0x${"33".repeat(20)}`,
      `0x${"44".repeat(20)}`,
      10_000_000_000n,
      2_000_000_000n,
      1_789_623_937,
      `0x${"55".repeat(32)}`,
      `0x${"66".repeat(32)}`,
      `0x${"77".repeat(32)}`,
      1,
    ],
  );
  return {
    address: sourceEscrowAddress,
    blockNumber: 11443299,
    transactionHash: sourceTxHash,
    transactionIndex: 106,
    // This is deliberately the block-wide index from the Sepolia receipt.
    index: 786,
    topics: encoded.topics,
    data: encoded.data,
  } as unknown as TransactionReceipt["logs"][number];
}

describe("source proof event indexing", () => {
  it.each([
    ["OrderCancelled", "ORDER_CANCELLED"],
    ["OrderDisputed", "ORDER_DISPUTED"],
    ["OrderSettled", "ORDER_SETTLED"],
  ] as const)("parses %s with receipt-local position", (name, eventType) => {
    const orderId = "0x" + "bb".repeat(32);
    const encoded = sourceInterface.encodeEventLog(
      sourceInterface.getEvent(name)!,
      name === "OrderSettled"
        ? [orderId, 1_000n, "0x" + "55".repeat(32)]
        : [orderId, "0x" + "55".repeat(32)],
    );
    const receipt = {
      blockNumber: 11443299,
      logs: [
        {
          address: sourceEscrowAddress,
          transactionIndex: 106,
          index: 786,
          topics: encoded.topics,
          data: encoded.data,
        },
      ],
    } as unknown as TransactionReceipt;

    expect(
      parseSourceEventLog(
        sourceTxHash,
        sourceEscrowAddress,
        receipt,
        orderId,
        eventType,
      ),
    ).toMatchObject({ eventType, orderId, logIndex: 0 });
  });

  it("uses the receipt-local position rather than ethers Log.index", () => {
    const receipt = {
      blockNumber: 11443299,
      logs: [
        {
          address: `0x${"88".repeat(20)}`,
          blockNumber: 11443299,
          transactionHash: sourceTxHash,
          transactionIndex: 106,
          index: 785,
          topics: [],
          data: "0x",
        },
        eventLog(),
      ],
    } as unknown as TransactionReceipt;

    const event = parseOrderGuaranteedLog(
      sourceTxHash,
      sourceEscrowAddress,
      receipt,
    );

    expect(event.logIndex).toBe(1);
  });

  it("selects the requested order when one transaction emits multiple events", () => {
    const receipt = {
      blockNumber: 11443299,
      logs: [eventLog("0x" + "cc".repeat(32)), eventLog()],
    } as unknown as TransactionReceipt;

    const event = parseOrderGuaranteedLog(
      sourceTxHash,
      sourceEscrowAddress,
      receipt,
      "0x" + "bb".repeat(32),
    );

    expect(event.orderId).toBe("0x" + "bb".repeat(32));
    expect(event.logIndex).toBe(1);
  });
});
