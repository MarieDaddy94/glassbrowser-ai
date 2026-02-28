const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');

const REQUIRED_PATHS = [
  '/electron/preload.cjs',
  '/electron/generated/ipcScopes.cjs',
  '/services/runtimeOpsExternalBridge.cjs'
];

function resolvePackAsar(rootDir) {
  const candidates = [
    path.join(rootDir, 'release', 'win-unpacked', 'resources', 'app.asar'),
    path.join(rootDir, 'release-beta', 'win-unpacked', 'resources', 'app.asar')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function normalizeAsarEntry(entry) {
  return String(entry || '').replace(/\\/g, '/');
}

function runReleasePackSmoke(repoRoot) {
  const appAsarPath = resolvePackAsar(repoRoot);
  if (!appAsarPath) {
    throw new Error('Pack smoke check failed: packaged app.asar not found in release/win-unpacked or release-beta/win-unpacked.');
  }

  const entries = new Set(asar.listPackage(appAsarPath).map(normalizeAsarEntry));
  const missing = REQUIRED_PATHS.filter((requiredPath) => !entries.has(requiredPath));

  if (missing.length > 0) {
    throw new Error(`Pack smoke check failed: missing required app.asar entries: ${missing.join(', ')}`);
  }

  const result = {
    appAsarPath,
    checked: REQUIRED_PATHS.slice()
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
  console.log(`[releasePackSmoke] inspected ${result.appAsarPath}`);
}

module.exports = {
  runReleasePackSmoke
};
