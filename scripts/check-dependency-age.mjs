import fs from "node:fs/promises";

const MINIMUM_AGE_DAYS = 3;
const MINIMUM_AGE_MS = MINIMUM_AGE_DAYS * 24 * 60 * 60 * 1000;
const REGISTRY = "https://registry.npmjs.org";
const lockfile = JSON.parse(await fs.readFile(new URL("../package-lock.json", import.meta.url), "utf8"));

function dependencyNameFromPath(path) {
  const nodeModulesIndex = path.lastIndexOf("node_modules/");
  if (nodeModulesIndex === -1) return null;
  const dependencyPath = path.slice(nodeModulesIndex + "node_modules/".length);
  const parts = dependencyPath.split("/");
  return parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
}

const packages = Object.entries(lockfile.packages ?? {})
  .filter(([path, metadata]) => path && path.includes("node_modules/") && metadata.version)
  .map(([path, metadata]) => ({ name: metadata.name ?? dependencyNameFromPath(path), version: metadata.version }))
  .filter((dependency) => dependency.name);

const uniquePackages = [...new Map(packages.map((dependency) => [`${dependency.name}@${dependency.version}`, dependency])).values()];
const metadataCache = new Map();
const violations = [];

async function fetchMetadata(name) {
  if (!metadataCache.has(name)) {
    metadataCache.set(
      name,
      fetch(`${REGISTRY}/${encodeURIComponent(name)}`, {
        headers: { accept: "application/json" },
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`registry responded ${response.status}`);
        }
        return response.json();
      }),
    );
  }
  return metadataCache.get(name);
}

async function checkDependency(dependency) {
  try {
    const metadata = await fetchMetadata(dependency.name);
    const publishedAt = metadata.time?.[dependency.version];
    if (!publishedAt) {
      violations.push(`${dependency.name}@${dependency.version}: publication date unavailable`);
      return;
    }
    const ageMs = Date.now() - new Date(publishedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs < MINIMUM_AGE_MS) {
      const ageHours = Number.isFinite(ageMs) ? Math.max(0, ageMs / 3_600_000).toFixed(1) : "unknown";
      violations.push(`${dependency.name}@${dependency.version}: only ${ageHours} hours old`);
    }
  } catch (error) {
    violations.push(`${dependency.name}@${dependency.version}: verification failed (${error.message})`);
  }
}

for (let index = 0; index < uniquePackages.length; index += 20) {
  await Promise.all(uniquePackages.slice(index, index + 20).map(checkDependency));
}

if (violations.length) {
  console.error(`Dependency age policy failed. Every locked dependency must be at least ${MINIMUM_AGE_DAYS} days old.`);
  for (const violation of violations.sort()) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(`Dependency age policy passed: ${uniquePackages.length} locked dependencies are at least ${MINIMUM_AGE_DAYS} days old.`);
