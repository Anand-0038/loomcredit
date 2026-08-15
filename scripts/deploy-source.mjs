import { NonceManager, Wallet } from "ethers";

import {
  assertManifestWritable,
  closeProvider,
  createProvider,
  deployArtifact,
  deploymentRecord,
  formatError,
  gitCommit,
  normalizePrivateKey,
  requireEnv,
  writeManifest,
} from "./deployment-utils.mjs";

const SEPOLIA_CHAIN_ID = 11155111;
const SOURCE_MANIFEST = "docs/deployments/source-deployment.json";

async function main() {
  await assertManifestWritable(SOURCE_MANIFEST);
  const provider = await createProvider(
    "SOURCE_CHAIN_RPC_URL",
    SEPOLIA_CHAIN_ID,
    "Sepolia",
  );
  try {
    const signer = new NonceManager(
      new Wallet(
        normalizePrivateKey(
          "SOURCE_OPERATOR_PRIVATE_KEY",
          requireEnv("SOURCE_OPERATOR_PRIVATE_KEY"),
        ),
        provider,
      ),
    );
    const deployer = await signer.getAddress();

    const token = await deployArtifact(
      signer,
      "contracts/source/out/MockUSDC.sol/MockUSDC.json",
    );
    const escrow = await deployArtifact(
      signer,
      "contracts/source/out/OrderGuaranteeEscrow.sol/OrderGuaranteeEscrow.json",
    );

    const manifest = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      gitCommit: gitCommit(),
      network: "sepolia",
      chainId: SEPOLIA_CHAIN_ID,
      deployer,
      contracts: {
        MockUSDC: deploymentRecord(token, "sepolia"),
        OrderGuaranteeEscrow: deploymentRecord(escrow, "sepolia"),
      },
    };
    await writeManifest(SOURCE_MANIFEST, manifest);
    console.log(JSON.stringify(manifest, null, 2));
  } finally {
    closeProvider(provider);
  }
}

await main().catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
