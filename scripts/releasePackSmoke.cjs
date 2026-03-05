const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');

const REQUIRED_PATHS = [
  '/electron/preload.cjs',
  '/electron/generated/ipcScopes.cjs',
  '/services/runtimeOpsExternalBridge.cjs'
];
const RENDERER_ASSET_ATTR_RE = /\b(?:src|href)=["']([^"']+)["']/gi;
const NON_LOCAL_PREFIX_RE = /^(?:[a-z]+:|\/\/|#)/i;
const APP_ASAR_MIN_BYTES = 70 * 1024 * 1024;
const SETUP_EXE_MIN_BYTES = 45 * 1024 * 1024;
const WIN_UNPACKED_MIN_BYTES = 180 * 1024 * 1024;
const SIDE_CAR_MIN_BYTES = 5 * 1024 * 1024;
const SIDECAR_RELATIVE_DIR = path.join('backend', 'mt5_bridge', 'dist', 'mt5_bridge');
const SIDECAR_EXE_NAME = 'mt5_bridge.exe';
const SIDECAR_MANIFEST_NAME = 'sidecar-manifest.json';

const RELEASE_DIRS = ['release', 'release-beta'];

function resolveReleaseDirs(rootDir) {
  return RELEASE_DIRS
    .map((dir) => path.join(rootDir, dir))
    .filter((dirPath) => fs.existsSync(dirPath));
}

function resolvePackAsar(rootDir) {
  const candidates = resolveReleaseDirs(rootDir).flatMap((releaseDir) => [
    path.join(releaseDir, 'win-unpacked', 'resources', 'app.asar')
  ]);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function normalizeAsarEntry(entry) {
  const normalized = String(entry || '').replace(/\\/g, '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function normalizeRendererAssetReference(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return null;
  if (NON_LOCAL_PREFIX_RE.test(raw)) return null;

  let normalized = raw.split('#')[0].split('?')[0].trim().replace(/\\/g, '/');
  if (!normalized) return null;
  if (normalized.startsWith('./')) normalized = normalized.slice(2);
  if (normalized.startsWith('/')) normalized = normalized.slice(1);
  if (!normalized.startsWith('assets/')) return null;
  if (normalized.includes('..')) return null;
  return normalized;
}

function extractRendererAssetRefsFromHtml(htmlText) {
  const refs = new Set();
  const source = String(htmlText || '');
  RENDERER_ASSET_ATTR_RE.lastIndex = 0;
  let match = null;
  while ((match = RENDERER_ASSET_ATTR_RE.exec(source)) !== null) {
    const normalized = normalizeRendererAssetReference(match[1]);
    if (normalized) refs.add(normalized);
  }
  return Array.from(refs).sort();
}

function extractPackagedDistIndexHtml(appAsarPath) {
  for (const candidate of ['/dist/index.html', 'dist/index.html']) {
    try {
      const html = asar.extractFile(appAsarPath, candidate);
      return { entryPath: normalizeAsarEntry(candidate), html: String(html || '') };
    } catch {
      // try next candidate
    }
  }
  throw new Error('dist/index.html not found in packaged app.asar.');
}

function assertPackagedRendererAssets(appAsarPath, entries) {
  const extracted = extractPackagedDistIndexHtml(appAsarPath);
  const refs = extractRendererAssetRefsFromHtml(extracted.html);
  const missing = refs
    .map((ref) => `/dist/${ref}`)
    .filter((asPath) => !entries.has(asPath));
  if (missing.length > 0) {
    throw new Error(
      `Pack smoke check failed: missing renderer asset entries referenced by dist/index.html: ${missing.join(', ')}`
    );
  }
  return {
    distIndexEntryPath: extracted.entryPath,
    rendererAssetRefs: refs,
    rendererMissingAssets: missing
  };
}

function readLatestArtifactPath(latestYmlPath) {
  try {
    const raw = fs.readFileSync(latestYmlPath, 'utf8');
    const pathMatch = raw.match(/^path:\s*["']?(.+?)["']?\s*$/m);
    if (pathMatch && pathMatch[1]) return String(pathMatch[1]).trim();
    const urlMatch = raw.match(/^\s*-\s*url:\s*["']?(.+?\.exe)["']?\s*$/m);
    if (urlMatch && urlMatch[1]) return String(urlMatch[1]).trim();
  } catch {
    return null;
  }
  return null;
}

function resolveSetupExe(rootDir) {
  const releaseDirs = resolveReleaseDirs(rootDir);
  for (const releaseDir of releaseDirs) {
    const latestYmlPath = path.join(releaseDir, 'latest.yml');
    if (!fs.existsSync(latestYmlPath)) continue;
    const relPath = readLatestArtifactPath(latestYmlPath);
    if (!relPath) continue;
    const candidate = path.join(releaseDir, relPath);
    if (fs.existsSync(candidate)) return candidate;
  }

  // Fallback: pick newest setup exe in known release dirs.
  let newest = null;
  for (const releaseDir of releaseDirs) {
    let entries = [];
    try {
      entries = fs.readdirSync(releaseDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!/Setup\s+[\d.]+\.exe$/i.test(entry.name)) continue;
      const fullPath = path.join(releaseDir, entry.name);
      let stat = null;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (!newest || stat.mtimeMs > newest.mtimeMs) {
        newest = { path: fullPath, mtimeMs: stat.mtimeMs };
      }
    }
  }
  return newest ? newest.path : null;
}

function computeDirectorySize(dirPath) {
  let total = 0;
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        total += fs.statSync(fullPath).size;
      } catch {
        // ignore stat failures for best-effort aggregate
      }
    }
  }
  return total;
}

function readInstallerPolicy(repoRoot) {
  const packagePath = path.join(repoRoot, 'package.json');
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch (error) {
    throw new Error(`Pack smoke check failed: unable to read package.json (${error?.message || error}).`);
  }
  const runAfterFinish = pkg?.build?.nsis?.runAfterFinish;
  if (runAfterFinish !== false) {
    throw new Error('Pack smoke check failed: build.nsis.runAfterFinish must be false.');
  }
  return { runAfterFinish };
}

function computeSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex').toLowerCase();
}

function validatePackagedSidecar(winUnpackedDir, packageVersion) {
  const sidecarDir = path.join(winUnpackedDir, 'resources', SIDECAR_RELATIVE_DIR);
  const sidecarExePath = path.join(sidecarDir, SIDECAR_EXE_NAME);
  const sidecarManifestPath = path.join(sidecarDir, SIDECAR_MANIFEST_NAME);

  if (!fs.existsSync(sidecarExePath)) {
    throw new Error(`Pack smoke check failed: packaged MT5 sidecar executable missing at ${sidecarExePath}`);
  }
  const sidecarExeBytes = fs.statSync(sidecarExePath).size;
  if (sidecarExeBytes < SIDE_CAR_MIN_BYTES) {
    throw new Error(
      `Pack smoke check failed: packaged MT5 sidecar executable too small (${sidecarExeBytes} bytes, min ${SIDE_CAR_MIN_BYTES}).`
    );
  }
  if (!fs.existsSync(sidecarManifestPath)) {
    throw new Error(`Pack smoke check failed: packaged MT5 sidecar manifest missing at ${sidecarManifestPath}`);
  }
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(sidecarManifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Pack smoke check failed: invalid sidecar manifest JSON (${error?.message || error}).`);
  }
  const manifestVersion = String(manifest?.version || '').trim();
  if (!manifestVersion) {
    throw new Error('Pack smoke check failed: sidecar manifest missing version.');
  }
  if (packageVersion && manifestVersion !== packageVersion) {
    throw new Error(
      `Pack smoke check failed: sidecar manifest version ${manifestVersion} does not match package version ${packageVersion}.`
    );
  }
  const manifestHash = String(manifest?.sha256 || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(manifestHash)) {
    throw new Error('Pack smoke check failed: sidecar manifest sha256 is missing or invalid.');
  }
  const computedHash = computeSha256(sidecarExePath);
  if (computedHash !== manifestHash) {
    throw new Error(
      `Pack smoke check failed: sidecar hash mismatch (manifest=${manifestHash}, computed=${computedHash}).`
    );
  }

  return {
    sidecarDir,
    sidecarExePath,
    sidecarManifestPath,
    sidecarExeBytes,
    sidecarManifestVersion: manifestVersion,
    sidecarManifestHash: manifestHash
  };
}

function runReleasePackSmoke(repoRoot) {
  const installerPolicy = readInstallerPolicy(repoRoot);
  let packageVersion = null;
  try {
    packageVersion = String(JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))?.version || '').trim() || null;
  } catch {
    packageVersion = null;
  }
  const appAsarPath = resolvePackAsar(repoRoot);
  if (!appAsarPath) {
    throw new Error('Pack smoke check failed: packaged app.asar not found in release/win-unpacked or release-beta/win-unpacked.');
  }

  const entries = new Set(asar.listPackage(appAsarPath).map(normalizeAsarEntry));
  const missing = REQUIRED_PATHS.filter((requiredPath) => !entries.has(requiredPath));

  if (missing.length > 0) {
    throw new Error(`Pack smoke check failed: missing required app.asar entries: ${missing.join(', ')}`);
  }

  const rendererAssetReport = assertPackagedRendererAssets(appAsarPath, entries);

  const appAsarBytes = fs.statSync(appAsarPath).size;
  if (appAsarBytes < APP_ASAR_MIN_BYTES) {
    throw new Error(
      `Pack smoke check failed: app.asar too small (${appAsarBytes} bytes, min ${APP_ASAR_MIN_BYTES}).`
    );
  }

  const winUnpackedDir = path.resolve(path.dirname(appAsarPath), '..');
  const winUnpackedBytes = computeDirectorySize(winUnpackedDir);
  if (winUnpackedBytes < WIN_UNPACKED_MIN_BYTES) {
    throw new Error(
      `Pack smoke check failed: win-unpacked payload too small (${winUnpackedBytes} bytes, min ${WIN_UNPACKED_MIN_BYTES}).`
    );
  }

  const setupExePath = resolveSetupExe(repoRoot);
  if (!setupExePath) {
    throw new Error('Pack smoke check failed: setup executable not found in release outputs.');
  }

  const setupExeBytes = fs.statSync(setupExePath).size;
  if (setupExeBytes < SETUP_EXE_MIN_BYTES) {
    throw new Error(
      `Pack smoke check failed: setup executable too small (${setupExeBytes} bytes, min ${SETUP_EXE_MIN_BYTES}).`
    );
  }

  const sidecarReport = validatePackagedSidecar(winUnpackedDir, packageVersion);

  const result = {
    appAsarPath,
    setupExePath,
    winUnpackedDir,
    checked: REQUIRED_PATHS.slice(),
    rendererAssetRefs: rendererAssetReport.rendererAssetRefs,
    distIndexEntryPath: rendererAssetReport.distIndexEntryPath,
    installerPolicy,
    thresholds: {
      appAsarMinBytes: APP_ASAR_MIN_BYTES,
      setupExeMinBytes: SETUP_EXE_MIN_BYTES,
      winUnpackedMinBytes: WIN_UNPACKED_MIN_BYTES
    },
    appAsarBytes,
    setupExeBytes,
    winUnpackedBytes,
    sidecar: sidecarReport
  };
  try {
    const artifactsDir = path.join(repoRoot, 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(path.join(artifactsDir, 'release-pack-smoke.json'), JSON.stringify(result, null, 2), 'utf8');
  } catch {
    // best-effort artifact output
  }
  return result;
}

if (require.main === module) {
  const repoRoot = process.cwd();
  const result = runReleasePackSmoke(repoRoot);
  console.log(`[releasePackSmoke] ok (${result.checked.join(', ')})`);
  console.log(
    `[releasePackSmoke] app.asar=${result.appAsarBytes}B setupExe=${result.setupExeBytes}B winUnpacked=${result.winUnpackedBytes}B`
  );
  console.log(`[releasePackSmoke] inspected ${result.appAsarPath}`);
}

module.exports = {
  runReleasePackSmoke,
  REQUIRED_PATHS,
  extractRendererAssetRefsFromHtml,
  APP_ASAR_MIN_BYTES,
  SETUP_EXE_MIN_BYTES,
  WIN_UNPACKED_MIN_BYTES,
  SIDE_CAR_MIN_BYTES
};
