#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const PACKAGE_JSON = path.join(ROOT, "package.json");
const PROD_MANIFEST = path.join(ROOT, "vss-extension.json");
const DEV_MANIFEST = path.join(ROOT, "vss-extension.dev.json");

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseVersion(version) {
  const match = version.match(SEMVER_RE);
  if (!match) {
    throw new Error(`Invalid SemVer version: ${version}`);
  }

  const prerelease = match[4] || "";
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
    core: `${match[1]}.${match[2]}.${match[3]}`
  };
}

function isDevPrerelease(prerelease) {
  return /^dev\.\d+$/.test(prerelease);
}

function isRcPrerelease(prerelease) {
  return /^rc\.\d+$/.test(prerelease);
}

function nextDev(version, ciRunNumber) {
  const parsed = parseVersion(version);

  if (ciRunNumber) {
    if (!/^\d+$/.test(ciRunNumber) || ciRunNumber === "0") {
      throw new Error(`CI run number must be a positive integer, got: ${ciRunNumber}`);
    }

    return `${parsed.core}-dev.${ciRunNumber}`;
  }

  if (isDevPrerelease(parsed.prerelease)) {
    const current = Number(parsed.prerelease.split(".")[1]);
    return `${parsed.core}-dev.${current + 1}`;
  }

  return `${parsed.core}-dev.1`;
}

function nextRc(version) {
  const parsed = parseVersion(version);

  if (isRcPrerelease(parsed.prerelease)) {
    const current = Number(parsed.prerelease.split(".")[1]);
    return `${parsed.core}-rc.${current + 1}`;
  }

  return `${parsed.core}-rc.1`;
}

function toStable(version) {
  const parsed = parseVersion(version);
  return parsed.core;
}

function setPackageVersion(version) {
  parseVersion(version);
  const pkg = readJson(PACKAGE_JSON);
  pkg.version = version;
  writeJson(PACKAGE_JSON, pkg);
  console.log(`package.json version set to ${version}`);
}

function syncManifests(channel) {
  const pkg = readJson(PACKAGE_JSON);
  const pkgParsed = parseVersion(pkg.version);

  const prodManifest = readJson(PROD_MANIFEST);
  const devManifest = readJson(DEV_MANIFEST);

  if (channel === "prod") {
    prodManifest.version = pkg.version;
  } else if (channel === "dev") {
    prodManifest.version = pkgParsed.core;
    devManifest.version = isDevPrerelease(pkgParsed.prerelease)
      ? pkg.version
      : `${pkgParsed.core}-dev.1`;
  } else {
    throw new Error(`Unsupported channel: ${channel}`);
  }

  writeJson(PROD_MANIFEST, prodManifest);
  writeJson(DEV_MANIFEST, devManifest);
  console.log(`Synced manifests for ${channel} channel.`);
}

function validate() {
  const pkg = readJson(PACKAGE_JSON);
  const prodManifest = readJson(PROD_MANIFEST);
  const devManifest = readJson(DEV_MANIFEST);

  parseVersion(pkg.version);
  parseVersion(prodManifest.version);

  if (devManifest.version) {
    parseVersion(devManifest.version);
  }

  console.log("SemVer validation passed.");
}

function validateSync(channel) {
  const pkg = readJson(PACKAGE_JSON);
  const pkgParsed = parseVersion(pkg.version);

  const prodManifest = readJson(PROD_MANIFEST);
  const devManifest = readJson(DEV_MANIFEST);

  if (channel === "prod") {
    if (prodManifest.version !== pkg.version) {
      throw new Error(
        `Prod manifest version (${prodManifest.version}) does not match package version (${pkg.version}).`
      );
    }
    console.log("Prod sync validation passed.");
    return;
  }

  if (channel === "dev") {
    const expectedProd = pkgParsed.core;
    const expectedDev = isDevPrerelease(pkgParsed.prerelease)
      ? pkg.version
      : `${pkgParsed.core}-dev.1`;

    if (prodManifest.version !== expectedProd) {
      throw new Error(
        `Dev mode expected prod manifest version ${expectedProd}, got ${prodManifest.version}.`
      );
    }

    if (devManifest.version !== expectedDev) {
      throw new Error(
        `Dev manifest version mismatch. Expected ${expectedDev}, got ${devManifest.version}.`
      );
    }

    console.log("Dev sync validation passed.");
    return;
  }

  throw new Error(`Unsupported channel: ${channel}`);
}

function applyReleaseTag(tag) {
  if (!tag) {
    throw new Error("Missing release tag. Pass tag like v1.2.3 or v1.2.3-rc.1");
  }

  if (!/^v\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(tag)) {
    throw new Error(
      `Invalid release tag '${tag}'. Expected vX.Y.Z or vX.Y.Z-rc.N`
    );
  }

  setPackageVersion(tag.slice(1));
}

function main() {
  const [, , command, ...args] = process.argv;

  if (!command) {
    throw new Error("Missing command.");
  }

  if (command === "bump-dev") {
    const ciIndex = args.indexOf("--ci");
    const ciRunNumber = ciIndex >= 0 ? args[ciIndex + 1] : undefined;
    const pkg = readJson(PACKAGE_JSON);
    setPackageVersion(nextDev(pkg.version, ciRunNumber));
    return;
  }

  if (command === "bump-rc") {
    const pkg = readJson(PACKAGE_JSON);
    setPackageVersion(nextRc(pkg.version));
    return;
  }

  if (command === "to-stable") {
    const pkg = readJson(PACKAGE_JSON);
    setPackageVersion(toStable(pkg.version));
    return;
  }

  if (command === "sync") {
    const channel = args[0] || "prod";
    syncManifests(channel);
    return;
  }

  if (command === "validate") {
    validate();
    return;
  }

  if (command === "validate-sync") {
    const channel = args[0] || "prod";
    validateSync(channel);
    return;
  }

  if (command === "from-tag") {
    applyReleaseTag(args[0]);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
