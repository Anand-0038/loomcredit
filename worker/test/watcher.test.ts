import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { sourceInterface } from "../src/proof.js";
import {
  decodeOrderGuaranteedLog,
  decodeSourceEventLog,
  discoverSourceOrders,
} from "../src/watcher.js";

const sourceEscrowAddress = `0x${"11".repeat(20)}`;
const otherAddress = `0x${"22".repeat(20)}`;
const sourceTxHash = `0x${"aa".repeat(32)}`;
const orderId = `0x${"bb".repeat(32)}`;

const config = loadConfig({
  SOURCE_CHAIN_RPC_URL: "https://rpc.example.test",
  CREDITCOIN_RPC_URL: "https://creditcoin.example.test",
  PROOF_BUILDER_URL: "https://proof.example.test",
  SOURCE_CHAIN_KEY: "1",
  SOURCE_ESCROW_ADDRESS: sourceEscrowAddress,
  TRADE_EVIDENCE_USC_ADDRESS: `0x${"33".repeat(20)}`,
  CREDITCOIN_WALLET_PRIVATE_KEY: `0x${"44".repeat(32)}`,
  WORKER_START_BLOCK: "100",
});

function makeLog(address = sourceEscrowAddress) {
  const encoded = sourceInterface.encodeEventLog(
    sourceInterface.getEvent("OrderGuaranteed")!,
    [
      orderId,
      `0x${"55".repeat(20)}`,
      `0x${"66".repeat(20)}`,
      `0x${"77".repeat(20)}`,
      1_000_000n,
      200_000n,
      1_786_203_888,
      `0x${"88".repeat(32)}`,
      `0x${"99".repeat(32)}`,
      `0x${"aa".repeat(32)}`,
      1,
    ],
  );
  return {
    address,
    blockNumber: 123,
    transactionHash: sourceTxHash,
    transactionIndex: 4,
    index: 2,
    topics: encoded.topics,
    data: encoded.data,
  };
}

describe("source event watcher", () => {
  it("decodes only the configured escrow event", () => {
    const decoded = decodeOrderGuaranteedLog(makeLog(), sourceEscrowAddress);
    expect(decoded).toMatchObject({
      sourceTxHash,
      blockHeight: 123,
      txIndex: 4,
      logIndex: 2,
      orderId,
    });
    expect(
      decodeOrderGuaranteedLog(makeLog(otherAddress), sourceEscrowAddress),
    ).toBeNull();
  });

  it("decodes lifecycle events with their source event type", () => {
    const encoded = sourceInterface.encodeEventLog(
      sourceInterface.getEvent("OrderCancelled")!,
      [orderId, `0x${"aa".repeat(32)}`],
    );
    expect(
      decodeSourceEventLog(
        { ...makeLog(), topics: encoded.topics, data: encoded.data },
        sourceEscrowAddress,
      ),
    ).toMatchObject({ eventType: "ORDER_CANCELLED", orderId });
  });

  it("queries the bounded range and returns logs in chain order", async () => {
    const second = {
      ...makeLog(),
      transactionHash: `0x${"cc".repeat(32)}`,
      blockNumber: 124,
      transactionIndex: 0,
    };
    const provider = {
      getLogs: async (filter: { fromBlock?: number; toBlock?: number }) => {
        expect(filter.fromBlock).toBe(100);
        expect(filter.toBlock).toBe(125);
        return [second, makeLog()];
      },
    };
    const events = await discoverSourceOrders(
      provider as never,
      config,
      100,
      125,
    );
    expect(events.map((event) => event.sourceTxHash)).toEqual([
      sourceTxHash,
      second.transactionHash,
    ]);
  });
});
