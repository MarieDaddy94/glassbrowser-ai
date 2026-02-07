const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function collectBundleStats(repoRoot) {
  const distAssetsDir = path.join(repoRoot, 'dist', 'assets');
  if (!fs.existsSync(distAssetsDir)) {
    throw new Error('dist/assets not found. Run `npm run build` first.');
  }

  const pkg = readJson(path.join(repoRoot, 'package.json'), {});
  const version = String(pkg?.version || '').trim() || null;
  const files = fs.readdirSync(distAssetsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  const byBase = new Map();
  for (const name of files) {
    const assetPath = path.join(distAssetsDir, name);
    const stats = fs.statSync(assetPath);
    const isMap = name.endsWith('.map');
    const key = isMap ? name.slice(0, -4) : name;
    if (!byBase.has(key)) {
      byBase.set(key, {
        file: key,
        rawBytes: 0,
        gzipBytes: 0,
        mapBytes: 0
      });
    }
    const entry = byBase.get(key);
    if (isMap) {
      entry.mapBytes = Number(stats.size || 0);
      continue;
    }
    const raw = fs.readFileSync(assetPath);
    entry.rawBytes = Number(stats.size || 0);
    entry.gzipBytes = zlib.gzipSync(raw).length;
  }

  const chunks = Array.from(byBase.values())
    .filter((entry) => entry.file.endsWith('.js') || entry.file.endsWith('.css'))
    .sort((a, b) => b.rawBytes - a.rawBytes);

  const measuredAtMs = Date.now();
  const payload = {
    schemaVersion: 1,
    measuredAtMs,
    measuredAtIso: new Date(measuredAtMs).toISOString(),
    appVersion: version,
    chunkCount: chunks.length,
    chunks
  };

  const artifactsDir = path.join(repoRoot, 'artifacts');
  ensureDir(artifactsDir);
  const outPath = path.join(artifactsDir, 'bundle-stats.json');
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  return { ok: true, outPath, stats: payload };
}

function runCli() {
  const repoRoot = process.cwd();
  const res = collectBundleStats(repoRoot);
  console.log(`[collectBundleStats] wrote ${res.outPath} (${res.stats.chunkCount} chunks)`);
}

if (require.main === module) {
  runCli();
}

module.exports = {
  collectBundleStats
};

