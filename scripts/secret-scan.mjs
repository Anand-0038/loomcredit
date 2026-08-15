import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scanRoot = resolve(process.env.SECRET_SCAN_ROOT ?? workspaceRoot);
const secretPattern =
  /(private[_ -]?key|api[_ -]?key|mnemonic|secret)\s*[:=]\s*['"]?0x[a-f0-9]{64}/i;
const historyPattern =
  "(private[_ -]?key|api[_ -]?key|mnemonic|secret)[[:space:]]*[:=][[:space:]]*[\\\"']?0x[0-9a-fA-F]{64}";

function trackedFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: scanRoot,
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean);
}

function scanFile(relativePath) {
  const absolutePath = resolve(scanRoot, relativePath);
  if (!existsSync(absolutePath)) {
    // A deleted tracked path is a valid working-tree state. The scanner checks
    // the files that exist and lets Git surface the deletion separately.
    return [];
  }

  const contents = readFileSync(absolutePath, "utf8");
  return contents
    .split(/\r?\n/)
    .flatMap((line, index) =>
      secretPattern.test(line) ? [{ file: relativePath, line: index + 1 }] : [],
    );
}

function historicalCommits() {
  const output = execFileSync("git", ["rev-list", "--all"], {
    cwd: scanRoot,
    encoding: "utf8",
  });
  return output.split(/\r?\n/).filter(Boolean);
}

function scanHistory() {
  const matches = [];
  for (const commit of historicalCommits()) {
    try {
      execFileSync(
        "git",
        ["grep", "-I", "-i", "-n", "-E", historyPattern, commit, "--"],
        {
          cwd: scanRoot,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      matches.push(commit);
    } catch (error) {
      if (error?.status === 1) {
        continue;
      }
      throw error;
    }
  }
  return matches;
}

try {
  const matches = trackedFiles().flatMap(scanFile);
  const historicalMatches = scanHistory();
  if (matches.length > 0) {
    for (const match of matches) {
      console.error(
        `secret-scan: potential hard-coded secret at ${match.file}:${match.line}`,
      );
    }
  }
  if (historicalMatches.length > 0) {
    for (const commit of historicalMatches) {
      console.error(
        "secret-scan: potential hard-coded secret in Git history at " +
          commit.slice(0, 12),
      );
    }
  }
  if (matches.length > 0 || historicalMatches.length > 0) {
    process.exitCode = 1;
  } else {
    console.log("secret-scan: no hard-coded secret matches");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
