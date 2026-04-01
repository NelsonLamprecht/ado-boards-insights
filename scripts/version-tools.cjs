#!/usr/bin/env node

const fs = require("node:fs");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function setPackageVersion(nextVersion) {
  const pkg = readJson("package.json");
  pkg.version = nextVersion;
  writeJson("package.json", pkg);
  console.log(`Set package.json version to ${nextVersion}`);
}

function syncManifest(manifestPath) {
  const pkg = readJson("package.json");
  const manifest = readJson(manifestPath);
  manifest.version = pkg.version;
  writeJson(manifestPath, manifest);
  console.log(`Synced ${manifestPath} to ${pkg.version}`);
}

function nextRc(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/);
  if (!match) {
    throw new Error("Version must be X.Y.Z or X.Y.Z-rc.N");
  }

  if (match[4]) {
    return `${match[1]}.${match[2]}.${match[3]}-rc.${Number(match[4]) + 1}`;
  }

  return `${match[1]}.${match[2]}.${match[3]}-rc.1`;
}

function toStable(version) {
  const match = version.match(/^(\d+\.\d+\.\d+)(?:-rc\.\d+)?$/);
  if (!match) {
    throw new Error("Version must be X.Y.Z or X.Y.Z-rc.N");
  }
  return match[1];
}

function toDevCiVersion(version, runNumber) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-rc\.\d+)?$/);
  if (!match) {
    throw new Error("Version must start as X.Y.Z or X.Y.Z-rc.N");
  }

  if (!/^\d+$/.test(runNumber) || runNumber === "0") {
    throw new Error("Run number must be a positive integer");
  }

  return `${match[1]}.${match[2]}.${runNumber}`;
}

function main() {
  const [, , command, arg] = process.argv;

  if (command === "sync") {
    if (!arg) {
      throw new Error("Missing manifest path for sync command");
    }
    syncManifest(arg);
    return;
  }

  if (command === "rc") {
    const pkg = readJson("package.json");
    setPackageVersion(nextRc(pkg.version));
    return;
  }

  if (command === "prod") {
    const pkg = readJson("package.json");
    setPackageVersion(toStable(pkg.version));
    return;
  }

  if (command === "dev-ci") {
    if (!arg) {
      throw new Error("Missing run number for dev-ci command");
    }
    const pkg = readJson("package.json");
    setPackageVersion(toDevCiVersion(pkg.version, arg));
    return;
  }

  throw new Error("Unknown command. Use: sync <manifest>, rc, prod, or dev-ci <run-number>");
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
