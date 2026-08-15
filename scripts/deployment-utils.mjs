import { execFileSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import https from "node:https";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";
import { dirname, resolve } from "node:path";

import {
  ContractFactory,
  getAddress,
  isAddress,
  isHexString,
  JsonRpcProvider,
} from "ethers";

export const workspaceRoot = resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);

try {
  loadEnvFile(resolve(workspaceRoot, ".env"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

// Some hosted development environments advertise an IPv6 route that cannot
// reach the public CC3 endpoint. Keep the workaround opt-in so operators can
// use the platform default when IPv6 is healthy.
if (process.env.LOOMCREDIT_FORCE_IPV4 === "true") {
  https.globalAgent.options.family = 4;
}

export const EXPLORER_URLS = {
  sepolia: "https://sepolia.etherscan.io",
  creditcoin: "https://creditcoin-testnet.blockscout.com",
};

export function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`CONFIG_INVALID: ${name} is required`);
  return value;
}

export function optionalEnv(name) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function formatError(error) {
  if (!(error instanceof Error)) return String(error);
  const shortMessage = "shortMessage" in error ? error.shortMessage : undefined;
  const message =
    typeof shortMessage === "string" && shortMessage
      ? shortMessage
      : error.message || error.name;
  const code = "code" in error && error.code ? ` [${error.code}]` : "";
  return `${message}${code}`;
}

export function normalizeAddress(name, value) {
  if (!isAddress(value)) {
    throw new Error(`CONFIG_INVALID: ${name} must be a 20-byte EVM address`);
  }
  return getAddress(value);
}

export function normalizePrivateKey(name, value) {
  const trimmed = value.trim();
  const normalized = /^[a-fA-F0-9]{64}$/.test(trimmed)
    ? `0x${trimmed}`
    : trimmed;
  if (!isHexString(normalized, 32)) {
    throw new Error(
      `CONFIG_INVALID: ${name} must be a 32-byte hex private key`,
    );
  }
  return normalized;
}

export function requireBytes32(name, value) {
  if (!isHexString(value, 32) || /^0x0{64}$/i.test(value)) {
    throw new Error(`CONFIG_INVALID: ${name} must be a non-zero bytes32`);
  }
  return value;
}

export function parseUint(name, value, maximum = (1n << 256n) - 1n) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`CONFIG_INVALID: ${name} must be a non-negative integer`);
  }
  const parsed = BigInt(value);
  if (parsed > maximum) {
    throw new Error(`CONFIG_INVALID: ${name} exceeds its supported range`);
  }
  return parsed;
}

export async function readJson(relativePath) {
  const absolutePath = resolve(workspaceRoot, relativePath);
  try {
    return JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        `CONFIG_INVALID: ${relativePath} is missing; run the deployment step first`,
      );
    }
    throw new Error(`CONFIG_INVALID: unable to read ${relativePath}`);
  }
}

export const loadManifest = readJson;

export function manifestAddress(manifest, contractName, relativePath) {
  const address = manifest?.contracts?.[contractName]?.address;
  if (!address) {
    throw new Error(
      `CONFIG_INVALID: ${relativePath} has no contracts.${contractName}.address`,
    );
  }
  return normalizeAddress(
    `${relativePath}:contracts.${contractName}.address`,
    address,
  );
}

export async function loadArtifact(relativePath) {
  const artifact = await readJson(relativePath);
  const bytecode =
    typeof artifact.bytecode === "string"
      ? artifact.bytecode
      : artifact.bytecode?.object;
  if (!artifact.abi || !bytecode || bytecode === "0x") {
    throw new Error(
      `BUILD_INVALID: ${relativePath} has no deployable bytecode`,
    );
  }
  return artifact;
}

function linkBytecode(artifact, libraries = {}) {
  const bytecode =
    typeof artifact.bytecode === "string"
      ? artifact.bytecode
      : artifact.bytecode.object;
  const references =
    typeof artifact.bytecode === "string"
      ? {}
      : (artifact.bytecode.linkReferences ?? {});
  let linked = bytecode;

  for (const sourceReferences of Object.values(references)) {
    for (const [libraryName, locations] of Object.entries(sourceReferences)) {
      const libraryAddress = libraries[libraryName];
      if (!libraryAddress) {
        throw new Error(
          `BUILD_INVALID: ${libraryName} must be linked before deploying this artifact`,
        );
      }
      const address = normalizeAddress(`library ${libraryName}`, libraryAddress)
        .slice(2)
        .toLowerCase();
      for (const location of locations) {
        const start = 2 + location.start * 2;
        const end = start + location.length * 2;
        linked = `${linked.slice(0, start)}${address.padStart(location.length * 2, "0")}${linked.slice(end)}`;
      }
    }
  }
  return linked;
}

export async function createProvider(rpcEnvName, expectedChainId, networkName) {
  const rpcUrl = requireEnv(rpcEnvName);
  const provider = new JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(expectedChainId)) {
    provider.destroy();
    throw new Error(
      `CONFIG_INVALID: ${networkName} RPC returned chain ${network.chainId}; expected ${expectedChainId}`,
    );
  }
  return provider;
}

export async function deployArtifact(
  signer,
  artifactPath,
  constructorArgs = [],
  libraries = {},
) {
  const artifact = await loadArtifact(artifactPath);
  const factory = new ContractFactory(
    artifact.abi,
    linkBytecode(artifact, libraries),
    signer,
  );
  const contract = await factory.deploy(...constructorArgs);
  const deploymentTransaction = contract.deploymentTransaction();
  if (!deploymentTransaction) {
    throw new Error(
      `DEPLOY_FAILED: no deployment transaction for ${artifactPath}`,
    );
  }
  const receipt = await deploymentTransaction.wait();
  if (!receipt)
    throw new Error(`DEPLOY_FAILED: no receipt for ${artifactPath}`);
  const address = await contract.getAddress();
  return {
    contract,
    address,
    deploymentTx: deploymentTransaction.hash,
    deploymentBlock: receipt.blockNumber,
  };
}

export async function sendAndRecord(transactionPromise, explorerName) {
  const transaction = await transactionPromise;
  const receipt = await transaction.wait();
  if (!receipt)
    throw new Error(`TX_FAILED: no receipt for ${transaction.hash}`);
  return {
    transactionHash: transaction.hash,
    blockNumber: receipt.blockNumber,
    explorer: `${EXPLORER_URLS[explorerName]}/tx/${transaction.hash}`,
  };
}

export function deploymentRecord(deployment, explorerName) {
  return {
    address: deployment.address,
    deploymentTx: deployment.deploymentTx,
    deploymentBlock: deployment.deploymentBlock,
    explorer: `${EXPLORER_URLS[explorerName]}/address/${deployment.address}`,
    deploymentExplorer: `${EXPLORER_URLS[explorerName]}/tx/${deployment.deploymentTx}`,
  };
}

export function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspaceRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

export async function assertManifestWritable(relativePath) {
  const absolutePath = resolve(workspaceRoot, relativePath);
  try {
    await access(absolutePath);
    if (process.env.ALLOW_MANIFEST_OVERWRITE !== "true") {
      throw new Error(
        `MANIFEST_EXISTS: ${relativePath} already exists; set ALLOW_MANIFEST_OVERWRITE=true to replace it`,
      );
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export async function writeManifest(relativePath, manifest) {
  const absolutePath = resolve(workspaceRoot, relativePath);
  await assertManifestWritable(relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(
    absolutePath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return absolutePath;
}

export function closeProvider(provider) {
  provider.destroy();
}
