import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const trackedPrivateFiles = execFileSync("git", ["ls-files", "private"], {
  cwd: root,
  encoding: "utf8",
}).trim();

if (trackedPrivateFiles) {
  throw new Error(
    `public-boundary: private files are tracked:\n${trackedPrivateFiles}`,
  );
}

const websiteSurfaces = [
  "web/lib/docs.ts",
  "web/public/llms.txt",
  "web/app/layout.tsx",
];
const forbiddenReferences = [
  "private/founder/",
  "go-to-market.md",
  "pre-mortem.md",
  "submission-readiness.md",
  "judge-brief.md",
];

for (const relativePath of websiteSurfaces) {
  const content = read(relativePath).toLowerCase();
  const leakedReference = forbiddenReferences.find((reference) =>
    content.includes(reference),
  );
  if (leakedReference) {
    throw new Error(
      `public-boundary: ${relativePath} references private material ${leakedReference}`,
    );
  }
}

console.log(
  `public-boundary: pass (${websiteSurfaces.length} website surfaces, no tracked private files)`,
);
