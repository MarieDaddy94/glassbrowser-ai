const fs = require('fs');
const path = require('path');

const ASSET_ATTR_RE = /\b(?:src|href)=["']([^"']+)["']/gi;
const NON_LOCAL_PREFIX_RE = /^(?:[a-z]+:|\/\/|#)/i;

function normalizeAssetReference(rawValue) {
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

function extractAssetReferencesFromHtml(htmlText) {
  const refs = new Set();
  const source = String(htmlText || '');
  ASSET_ATTR_RE.lastIndex = 0;
  let match = null;
  while ((match = ASSET_ATTR_RE.exec(source)) !== null) {
    const normalized = normalizeAssetReference(match[1]);
    if (normalized) refs.add(normalized);
  }
  return Array.from(refs).sort();
}

function runDistAssetIntegrityCheck(repoRoot, options = {}) {
  const distDir = path.resolve(String(options.distDir || path.join(repoRoot, 'dist')));
  const indexPath = path.resolve(String(options.indexPath || path.join(distDir, 'index.html')));
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Dist asset integrity check failed: index.html not found at ${indexPath}`);
  }

  const html = fs.readFileSync(indexPath, 'utf8');
  const references = extractAssetReferencesFromHtml(html);
  const missingAssets = [];

  for (const ref of references) {
    const absPath = path.resolve(path.join(distDir, ref));
    let exists = false;
    try {
      exists = fs.existsSync(absPath) && fs.statSync(absPath).isFile();
    } catch {
      exists = false;
    }
    if (!exists) missingAssets.push(ref);
  }

  const result = {
    ok: missingAssets.length === 0,
    checkedAtMs: Date.now(),
    distDir,
    indexPath,
    references,
    missingAssets
  };

  try {
    const artifactsDir = path.join(repoRoot, 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(path.join(artifactsDir, 'dist-asset-integrity.json'), JSON.stringify(result, null, 2), 'utf8');
  } catch {
    // best-effort artifact output
  }

  return result;
}

if (require.main === module) {
  const repoRoot = process.cwd();
  const result = runDistAssetIntegrityCheck(repoRoot);
  if (!result.ok) {
    const detail = result.missingAssets.map((entry) => `- ${entry}`).join('\n');
    throw new Error(
      `Dist asset integrity check failed: ${result.missingAssets.length} referenced files are missing from dist/assets.\n` +
      `${detail}\n` +
      'Run `npm run build` to regenerate dist and retry packaging.'
    );
  }
  console.log(`[distAssetIntegrity] ok (${result.references.length} referenced assets)`);
}

module.exports = {
  runDistAssetIntegrityCheck,
  extractAssetReferencesFromHtml,
  normalizeAssetReference
};
