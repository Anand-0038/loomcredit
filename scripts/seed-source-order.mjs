import {
  Contract,
  Interface,
  keccak256,
  NonceManager,
  toUtf8Bytes,
  Wallet,
} from "ethers";

import {
  assertManifestWritable,
  closeProvider,
  createProvider,
  formatError,
  gitCommit,
  loadArtifact,
  loadManifest,
  manifestAddress,
  normalizeAddress,
  normalizePrivateKey,
  optionalEnv,
  parseUint,
  requireBytes32,
  requireEnv,
  sendAndRecord,
  writeManifest,
} from "./deployment-utils.mjs";

const SEPOLIA_CHAIN_ID = 11155111;
const SOURCE_MANIFEST = "docs/deployments/source-deployment.json";
const ORDER_MANIFEST = "docs/deployments/source-order.json";
const DAY_SECONDS = 86_400n;

async function main() {
  await assertManifestWritable(ORDER_MANIFEST);
  const provider = await createProvider(
    "SOURCE_CHAIN_RPC_URL",
    SEPOLIA_CHAIN_ID,
    "Sepolia",
  );
  try {
    const sourceManifest = await loadManifest(SOURCE_MANIFEST);
    const tokenAddress = manifestAddress(
      sourceManifest,
      "MockUSDC",
      SOURCE_MANIFEST,
    );
    const escrowAddress = manifestAddress(
      sourceManifest,
      "OrderGuaranteeEscrow",
      SOURCE_MANIFEST,
    );
    const signer = new NonceManager(
      new Wallet(
        normalizePrivateKey(
          "SOURCE_OPERATOR_PRIVATE_KEY",
          requireEnv("SOURCE_OPERATOR_PRIVATE_KEY"),
        ),
        provider,
      ),
    );
    const buyer = await signer.getAddress();
    const supplier = normalizeAddress(
      "SOURCE_SUPPLIER_ADDRESS",
      requireEnv("SOURCE_SUPPLIER_ADDRESS"),
    );
    if (supplier.toLowerCase() === buyer.toLowerCase()) {
      throw new Error(
        "CONFIG_INVALID: SOURCE_SUPPLIER_ADDRESS must differ from the buyer",
      );
    }

    const orderId =
      optionalEnv("SOURCE_ORDER_ID") ??
      keccak256(toUtf8Bytes("loomcredit-order-v1"));
    requireBytes32("SOURCE_ORDER_ID", orderId);
    const orderValue = parseUint(
      "SOURCE_ORDER_VALUE_MINOR",
      optionalEnv("SOURCE_ORDER_VALUE_MINOR") ?? "10000000000",
      (1n << 128n) - 1n,
    );
    const guaranteeAmount = parseUint(
      "SOURCE_GUARANTEE_AMOUNT_MINOR",
      optionalEnv("SOURCE_GUARANTEE_AMOUNT_MINOR") ?? "2000000000",
      (1n << 128n) - 1n,
    );
    if (guaranteeAmount === 0n || guaranteeAmount > orderValue) {
      throw new Error(
        "CONFIG_INVALID: SOURCE_GUARANTEE_AMOUNT_MINOR must be greater than zero and no larger than the order value",
      );
    }
    const deliveryDays = parseUint(
      "SOURCE_DELIVERY_DAYS",
      optionalEnv("SOURCE_DELIVERY_DAYS") ?? "40",
      (1n << 64n) - 1n,
    );
    if (deliveryDays === 0n) {
      throw new Error(
        "CONFIG_INVALID: SOURCE_DELIVERY_DAYS must be greater than zero",
      );
    }
    const deliveryDeadline =
      BigInt(Math.floor(Date.now() / 1000)) + deliveryDays * DAY_SECONDS;
    const nonce = parseUint(
      "SOURCE_NONCE",
      optionalEnv("SOURCE_NONCE") ?? "1",
      (1n << 64n) - 1n,
    );
    const termsCommitment = requireBytes32(
      "SOURCE_TERMS_COMMITMENT",
      requireEnv("SOURCE_TERMS_COMMITMENT"),
    );
    const buyerIdentityCommitment = requireBytes32(
      "SOURCE_BUYER_IDENTITY_COMMITMENT",
      requireEnv("SOURCE_BUYER_IDENTITY_COMMITMENT"),
    );
    const supplierIdentityCommitment = requireBytes32(
      "SOURCE_SUPPLIER_IDENTITY_COMMITMENT",
      requireEnv("SOURCE_SUPPLIER_IDENTITY_COMMITMENT"),
    );

    const tokenArtifact = await loadArtifact(
      "contracts/source/out/MockUSDC.sol/MockUSDC.json",
    );
    const escrowArtifact = await loadArtifact(
      "contracts/source/out/OrderGuaranteeEscrow.sol/OrderGuaranteeEscrow.json",
    );
    const token = new Contract(tokenAddress, tokenArtifact.abi, signer);
    const escrow = new Contract(escrowAddress, escrowArtifact.abi, signer);

    await sendAndRecord(token.mint(buyer, guaranteeAmount), "sepolia");
    await sendAndRecord(
      token.approve(escrowAddress, guaranteeAmount),
      "sepolia",
    );
    const orderTransaction = await escrow.createAndGuaranteeOrder({
      orderId,
      buyer,
      supplier,
      settlementToken: tokenAddress,
      orderValue,
      guaranteeAmount,
      deliveryDeadline,
      termsCommitment,
      buyerIdentityCommitment,
      supplierIdentityCommitment,
      nonce,
    });
    const receipt = await orderTransaction.wait();
    if (!receipt) throw new Error("TX_FAILED: no receipt for OrderGuaranteed");

    const escrowInterface = new Interface(escrowArtifact.abi);
    const receiptLogIndex = receipt.logs.findIndex((log) => {
      try {
        return escrowInterface.parseLog(log)?.name === "OrderGuaranteed";
      } catch {
        return false;
      }
    });
    const eventLog =
      receiptLogIndex >= 0 ? receipt.logs[receiptLogIndex] : null;
    if (!eventLog)
      throw new Error(
        "TX_FAILED: OrderGuaranteed event was not found in the receipt",
      );
    const parsedEvent = escrowInterface.parseLog(eventLog);
    // USC's expected log index is local to the transaction receipt. Keep the
    // block-wide index as separate evidence for explorers and diagnostics.
    const blockLogIndex = eventLog.index;
    const manifest = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      gitCommit: gitCommit(),
      network: "sepolia",
      chainId: SEPOLIA_CHAIN_ID,
      sourceEscrow: escrowAddress,
      settlementToken: tokenAddress,
      buyer,
      supplier,
      order: {
        orderId: parsedEvent.args.orderId,
        orderValue: parsedEvent.args.orderValue.toString(),
        guaranteeAmount: parsedEvent.args.guaranteeAmount.toString(),
        deliveryDeadline: parsedEvent.args.deliveryDeadline.toString(),
        termsCommitment: parsedEvent.args.termsCommitment,
        buyerIdentityCommitment: parsedEvent.args.buyerIdentityCommitment,
        supplierIdentityCommitment: parsedEvent.args.supplierIdentityCommitment,
        nonce: parsedEvent.args.nonce.toString(),
      },
      transactionHash: orderTransaction.hash,
      blockNumber: receipt.blockNumber,
      logIndex: receiptLogIndex,
      receiptLogIndex,
      blockLogIndex,
      explorer: `https://sepolia.etherscan.io/tx/${orderTransaction.hash}`,
    };
    await writeManifest(ORDER_MANIFEST, manifest);
    console.log(JSON.stringify(manifest, null, 2));
  } finally {
    closeProvider(provider);
  }
}

await main().catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
