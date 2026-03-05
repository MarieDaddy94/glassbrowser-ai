const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MIN_SIDECAR_EXE_BYTES = 5 * 1024 * 1024;
const SIDECAR_RELATIVE_DIR = path.join('backend', 'mt5_bridge', 'dist', 'mt5_bridge');
const SIDECAR_EXE_NAME = 'mt5_bridge.exe';
const SIDECAR_MANIFEST_NAME = 'sidecar-manifest.json';
const RELEASE_DIR_CANDIDATES = ['release', 'release-beta'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function computeSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex').toLowerCase();
}

function resolveSidecarPaths(rootDir) {
  const sidecarDir = path.join(rootDir, SIDECAR_RELATIVE_DIR);
  return {
    sidecarDir,
    exePath: path.join(sidecarDir, SIDECAR_EXE_NAME),
    manifestPath: path.join(sidecarDir, SIDECAR_MANIFEST_NAME)
  };
}

function resolvePackagedResourcesDir(repoRoot, overrideReleaseDir) {
  if (overrideReleaseDir) return path.resolve(String(overrideReleaseDir));
  for (const dirName of RELEASE_DIR_CANDIDATES) {
    const candidate = path.join(repoRoot, dirName, 'win-unpacked', 'resources');
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(repoRoot, 'release', 'win-unpacked', 'resources');
}

function validateSidecarPayload(paths, expectedVersion) {
  if (!fs.existsSync(paths.exePath)) {
    throw new Error(`MT5 sidecar packaging check failed: executable missing at ${paths.exePath}`);
  }
  if (!fs.statSync(paths.exePath).isFile()) {
    throw new Error(`MT5 sidecar packaging check failed: executable path is not a file (${paths.exePath})`);
  }
  const exeBytes = fs.statSync(paths.exePath).size;
  if (exeBytes < MIN_SIDECAR_EXE_BYTES) {
    throw new Error(
      `MT5 sidecar packaging check failed: executable too small (${exeBytes} bytes, min ${MIN_SIDECAR_EXE_BYTES}).`
    );
  }
  if (!fs.existsSync(paths.manifestPath)) {
    throw new Error(`MT5 sidecar packaging check failed: manifest missing at ${paths.manifestPath}`);
  }
  const manifest = readJson(paths.manifestPath);
  const manifestVersion = String(manifest?.version || '').trim();
  if (!manifestVersion) {
    throw new Error('MT5 sidecar packaging check failed: sidecar manifest missing version.');
  }
  if (expectedVersion && manifestVersion !== expectedVersion) {
    throw new Error(
      `MT5 sidecar packaging check failed: manifest version ${manifestVersion} does not match package version ${expectedVersion}.`
    );
  }
  const manifestHash = String(manifest?.sha256 || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(manifestHash)) {
    throw new Error('MT5 sidecar packaging check failed: sidecar manifest sha256 is missing or invalid.');
  }
  const computedHash = computeSha256(paths.exePath);
  if (computedHash !== manifestHash) {
    throw new Error(
      `MT5 sidecar packaging check failed: executable hash mismatch (manifest=${manifestHash}, computed=${computedHash}).`
    );
  }
  return {
    ok: true,
    exeBytes,
    manifestVersion,
    manifestHash,
    computedHash
  };
}

function runMt5SidecarPackagingCheck(repoRoot, options = {}) {
  const mode = String(options.mode || 'prepackage').trim().toLowerCase();
  const releaseDir = resolvePackagedResourcesDir(repoRoot, options.releaseDir);
  const packageVersion = String(readJson(path.join(repoRoot, 'package.json'))?.version || '').trim() || null;

  const prepackagePaths = resolveSidecarPaths(repoRoot);
  const prepackage = validateSidecarPayload(prepackagePaths, packageVersion);

  let packaged = null;
  if (mode === 'packaged' || mode === 'all') {
    const packagedPaths = resolveSidecarPaths(releaseDir);
    packaged = validateSidecarPayload(packagedPaths, packageVersion);
  }

  const result = {
    ok: true,
    mode,
    checkedAtMs: Date.now(),
    packageVersion,
    minExeBytes: MIN_SIDECAR_EXE_BYTES,
    prepackage: {
      ...prepackage,
      exePath: prepackagePaths.exePath,
      manifestPath: prepackagePaths.manifestPath
    },
    packaged: packaged
      ? {
          ...packaged,
          exePath: resolveSidecarPaths(releaseDir).exePath,
          manifestPath: resolveSidecarPaths(releaseDir).manifestPath,
          releaseDir
        }
      : null
  };

  try {
    const artifactsDir = path.join(repoRoot, 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(path.join(artifactsDir, 'mt5-sidecar-packaging.json'), JSON.stringify(result, null, 2), 'utf8');
  } catch {
    // best-effort artifact output
  }

  return result;
}

if (require.main === module) {
  const repoRoot = process.cwd();
  const args = process.argv.slice(2);
  let mode = 'prepackage';
  let releaseDir = null;
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i] || '').trim();
    if (arg === '--mode' && args[i + 1]) {
      mode = String(args[i + 1]).trim();
      i += 1;
      continue;
    }
    if (arg === '--release-dir' && args[i + 1]) {
      releaseDir = String(args[i + 1]).trim();
      i += 1;
    }
  }
  const result = runMt5SidecarPackagingCheck(repoRoot, {
    mode,
    releaseDir
  });
  const packagedSummary = result.packaged
    ? ` packagedExe=${result.packaged.exePath}`
    : '';
  console.log(
    `[mt5SidecarPackaging] ok mode=${result.mode} prepackageExe=${result.prepackage.exePath}${packagedSummary}`
  );
}

module.exports = {
  runMt5SidecarPackagingCheck,
  resolveSidecarPaths,
  resolvePackagedResourcesDir,
  validateSidecarPayload,
  computeSha256,
  MIN_SIDECAR_EXE_BYTES,
  SIDECAR_RELATIVE_DIR,
  SIDECAR_EXE_NAME,
  SIDECAR_MANIFEST_NAME
};
