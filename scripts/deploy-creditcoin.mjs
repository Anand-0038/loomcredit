import { Contract, NonceManager, Wallet } from "ethers";

import {
  assertManifestWritable,
  closeProvider,
  createProvider,
  deployArtifact,
  deploymentRecord,
  formatError,
  gitCommit,
  loadArtifact,
  loadManifest,
  manifestAddress,
  normalizeAddress,
  normalizePrivateKey,
  optionalEnv,
  parseUint,
  requireEnv,
  sendAndRecord,
  writeManifest,
} from "./deployment-utils.mjs";

const CREDITCOIN_CHAIN_ID = 102031;
const DEFAULT_NATIVE_VERIFIER = "0x0000000000000000000000000000000000000FD2";
const CREDITCOIN_MANIFEST = "docs/deployments/creditcoin-deployment.json";

async function main() {
  await assertManifestWritable(CREDITCOIN_MANIFEST);
  const provider = await createProvider(
    "CREDITCOIN_RPC_URL",
    CREDITCOIN_CHAIN_ID,
    "Creditcoin CC3 testnet",
  );
  try {
    const signer = new NonceManager(
      new Wallet(
        normalizePrivateKey(
          "CREDITCOIN_DEPLOYER_PRIVATE_KEY",
          requireEnv("CREDITCOIN_DEPLOYER_PRIVATE_KEY"),
        ),
        provider,
      ),
    );
    const deployer = await signer.getAddress();
    const deployerBalance = await provider.getBalance(deployer);
    if (deployerBalance === 0n) {
      throw new Error(
        `FUNDING_REQUIRED: ${deployer} has 0 CC3 EVM balance; request Creditcoin testnet CTC before deploying`,
      );
    }
    const agentPrivateKey = optionalEnv("CREDITCOIN_AGENT_PRIVATE_KEY");
    const derivedAgentSigner = agentPrivateKey
      ? new Wallet(
          normalizePrivateKey("CREDITCOIN_AGENT_PRIVATE_KEY", agentPrivateKey),
        ).address
      : deployer;
    const configuredAgentSigner = optionalEnv(
      "CREDITCOIN_AGENT_SIGNER_ADDRESS",
    );
    const agentSigner = normalizeAddress(
      "CREDITCOIN_AGENT_SIGNER_ADDRESS",
      configuredAgentSigner ?? derivedAgentSigner,
    );
    if (
      agentPrivateKey &&
      agentSigner.toLowerCase() !== derivedAgentSigner.toLowerCase()
    ) {
      throw new Error(
        "CONFIG_INVALID: CREDITCOIN_AGENT_SIGNER_ADDRESS does not match CREDITCOIN_AGENT_PRIVATE_KEY",
      );
    }
    const sourceChainKey = parseUint(
      "SOURCE_CHAIN_KEY",
      requireEnv("SOURCE_CHAIN_KEY"),
      (1n << 64n) - 1n,
    );
    const sourceManifest = await loadManifest(
      "docs/deployments/source-deployment.json",
    );
    const sourceEscrow = manifestAddress(
      sourceManifest,
      "OrderGuaranteeEscrow",
      "docs/deployments/source-deployment.json",
    );
    const nativeVerifier = normalizeAddress(
      "USC_VERIFIER_ADDRESS",
      optionalEnv("USC_VERIFIER_ADDRESS") ?? DEFAULT_NATIVE_VERIFIER,
    );

    const registry = await deployArtifact(
      signer,
      "contracts/creditcoin/out/FacilityRegistry.sol/FacilityRegistry.json",
      [deployer],
    );
    const vault = await deployArtifact(
      signer,
      "contracts/creditcoin/out/SandboxCapitalVault.sol/SandboxCapitalVault.json",
      [deployer],
    );
    const riskGuard = await deployArtifact(
      signer,
      "contracts/creditcoin/out/RiskGuard.sol/RiskGuard.json",
      [deployer, registry.address, vault.address],
    );
    const decoder = await deployArtifact(
      signer,
      "contracts/creditcoin/out/EvmV1Decoder.sol/EvmV1Decoder.json",
    );
    const tradeEvidence = await deployArtifact(
      signer,
      "contracts/creditcoin/out/TradeEvidenceUSC.sol/TradeEvidenceUSC.json",
      [
        deployer,
        sourceChainKey,
        sourceEscrow,
        nativeVerifier,
        registry.address,
      ],
      { EvmV1Decoder: decoder.address },
    );

    const registryArtifact = await loadArtifact(
      "contracts/creditcoin/out/FacilityRegistry.sol/FacilityRegistry.json",
    );
    const vaultArtifact = await loadArtifact(
      "contracts/creditcoin/out/SandboxCapitalVault.sol/SandboxCapitalVault.json",
    );
    const riskGuardArtifact = await loadArtifact(
      "contracts/creditcoin/out/RiskGuard.sol/RiskGuard.json",
    );
    const registryWriter = new Contract(
      registry.address,
      registryArtifact.abi,
      signer,
    );
    const vaultWriter = new Contract(vault.address, vaultArtifact.abi, signer);
    const riskGuardWriter = new Contract(
      riskGuard.address,
      riskGuardArtifact.abi,
      signer,
    );

    const wiring = {
      evidenceVerifier: await sendAndRecord(
        registryWriter.setEvidenceVerifier(tradeEvidence.address),
        "creditcoin",
      ),
      riskGuard: await sendAndRecord(
        registryWriter.setRiskGuard(riskGuard.address),
        "creditcoin",
      ),
      capitalVault: await sendAndRecord(
        registryWriter.setCapitalVault(vault.address),
        "creditcoin",
      ),
      vaultRiskGuard: await sendAndRecord(
        vaultWriter.setRiskGuard(riskGuard.address),
        "creditcoin",
      ),
      vaultFacilityRegistry: await sendAndRecord(
        vaultWriter.setFacilityRegistry(registry.address),
        "creditcoin",
      ),
      agentSigner: await sendAndRecord(
        riskGuardWriter.setAgentSigner(agentSigner, true),
        "creditcoin",
      ),
    };

    const liquidity = parseUint(
      "SANDBOX_LIQUIDITY_MINOR",
      optionalEnv("SANDBOX_LIQUIDITY_MINOR") ?? "0",
    );
    let liquidityDeposit = null;
    if (liquidity > 0n) {
      liquidityDeposit = await sendAndRecord(
        vaultWriter.depositTestLiquidity(liquidity),
        "creditcoin",
      );
    }

    const registryReader = new Contract(
      registry.address,
      registryArtifact.abi,
      provider,
    );
    const vaultReader = new Contract(
      vault.address,
      vaultArtifact.abi,
      provider,
    );
    const riskGuardReader = new Contract(
      riskGuard.address,
      riskGuardArtifact.abi,
      provider,
    );
    const checks = {
      evidenceVerifier: await registryReader.evidenceVerifier(),
      riskGuard: await registryReader.riskGuard(),
      capitalVault: await registryReader.capitalVault(),
      vaultRiskGuard: await vaultReader.riskGuard(),
      vaultFacilityRegistry: await vaultReader.facilityRegistry(),
    };
    const agentSignerApproved =
      await riskGuardReader.approvedSigners(agentSigner);
    const expectedChecks = {
      evidenceVerifier: tradeEvidence.address,
      riskGuard: riskGuard.address,
      capitalVault: vault.address,
      vaultRiskGuard: riskGuard.address,
      vaultFacilityRegistry: registry.address,
    };
    for (const [name, expected] of Object.entries(expectedChecks)) {
      if (checks[name].toLowerCase() !== expected.toLowerCase()) {
        throw new Error(
          `WIRING_INVALID: ${name} is ${checks[name]}, expected ${expected}`,
        );
      }
    }
    if (!agentSignerApproved) {
      throw new Error(
        `WIRING_INVALID: ${agentSigner} is not approved as an agent signer`,
      );
    }

    const manifest = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      gitCommit: gitCommit(),
      network: "creditcoin-cc3-testnet",
      chainId: CREDITCOIN_CHAIN_ID,
      deployer,
      agentSigner,
      source: {
        chainKey: Number(sourceChainKey),
        escrowAddress: sourceEscrow,
      },
      nativeVerifier,
      contracts: {
        EvmV1Decoder: deploymentRecord(decoder, "creditcoin"),
        TradeEvidenceUSC: deploymentRecord(tradeEvidence, "creditcoin"),
        FacilityRegistry: deploymentRecord(registry, "creditcoin"),
        RiskGuard: deploymentRecord(riskGuard, "creditcoin"),
        SandboxCapitalVault: deploymentRecord(vault, "creditcoin"),
      },
      wiring,
      postDeploymentChecks: checks,
      agentSignerApproved,
      sandboxLiquidityMinor: liquidity.toString(),
      liquidityDeposit,
    };
    await writeManifest(CREDITCOIN_MANIFEST, manifest);
    console.log(JSON.stringify(manifest, null, 2));
  } finally {
    closeProvider(provider);
  }
}

await main().catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
