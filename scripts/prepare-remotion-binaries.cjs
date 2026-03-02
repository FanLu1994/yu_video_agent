#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const targetPlatform = process.env.npm_config_platform || process.platform;
const targetArch = process.env.npm_config_arch || process.arch;
const targetKey = `${targetPlatform}-${targetArch}`;

const packageByTarget = {
  "darwin-arm64": "@remotion/compositor-darwin-arm64",
  "darwin-x64": "@remotion/compositor-darwin-x64",
  "linux-arm64": "@remotion/compositor-linux-arm64-gnu",
  "linux-x64": "@remotion/compositor-linux-x64-gnu",
  "win32-x64": "@remotion/compositor-win32-x64-msvc",
};

const binaryNames =
  targetPlatform === "win32"
    ? ["remotion.exe", "ffmpeg.exe", "ffprobe.exe"]
    : ["remotion", "ffmpeg", "ffprobe"];

async function resolveSourceDir(pkgName) {
  const pkgJsonPath = require.resolve(`${pkgName}/package.json`, {
    paths: [process.cwd()],
  });
  return path.dirname(pkgJsonPath);
}

async function assertFileExists(filePath) {
  try {
    await fs.stat(filePath);
  } catch {
    throw new Error(`Missing required binary file: ${filePath}`);
  }
}

async function main() {
  const packageName = packageByTarget[targetKey];
  if (!packageName) {
    throw new Error(
      `Unsupported target platform/arch for Remotion binaries: ${targetKey}`
    );
  }

  const sourceDir = await resolveSourceDir(packageName);
  const targetDir = path.resolve(
    process.cwd(),
    "resources",
    "remotion-binaries",
    targetKey
  );

  await fs.mkdir(targetDir, { recursive: true });

  for (const fileName of binaryNames) {
    const sourcePath = path.join(sourceDir, fileName);
    const targetPath = path.join(targetDir, fileName);
    await assertFileExists(sourcePath);
    await fs.copyFile(sourcePath, targetPath);
  }

  // eslint-disable-next-line no-console
  console.log(
    `[prepare-remotion-binaries] Prepared ${binaryNames.length} binaries in ${targetDir}`
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[prepare-remotion-binaries] Failed:", error);
  process.exitCode = 1;
});

