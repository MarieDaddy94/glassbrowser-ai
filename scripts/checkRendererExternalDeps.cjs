const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');

const BANNED_PATTERNS = [
  { id: 'http_url', regex: /https?:\/\//gi },
  { id: 'importmap', regex: /<script[^>]*type=["']importmap["']/gi },
  { id: 'tailwind_cdn', regex: /cdn\.tailwindcss\.com/gi },
  { id: 'google_fonts', regex: /fonts\.googleapis\.com|fonts\.gstatic\.com/gi },
  { id: 'unsplash', regex: /unsplash\.com/gi }
];

const resolvePackAsar = (rootDir) => {
  const candidates = [
    path.join(rootDir, 'release', 'win-unpacked', 'resources', 'app.asar'),
    path.join(rootDir, 'release-beta', 'win-unpacked', 'resources', 'app.asar')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

const inspectContent = (label, text) => {
  const violations = [];
  const source = String(text || '');
  for (const rule of BANNED_PATTERNS) {
    const matches = source.match(rule.regex);
    if (!matches || matches.length === 0) continue;
    violations.push({
      rule: rule.id,
      count: matches.length,
      sample: String(matches[0]).slice(0, 140)
    });
  }
  return {
    label,
    ok: violations.length === 0,
    violations
  };
};

const runRendererExternalDepsCheck = (repoRoot, options = {}) => {
  const includePackaged = !!options.includePackaged;
  const reports = [];

  const sourceIndexPath = path.join(repoRoot, 'index.html');
  if (fs.existsSync(sourceIndexPath)) {
    reports.push(inspectContent('source:index.html', fs.readFileSync(sourceIndexPath, 'utf8')));
  }

  const distIndexPath = path.join(repoRoot, 'dist', 'index.html');
  if (fs.existsSync(distIndexPath)) {
    reports.push(inspectContent('dist:index.html', fs.readFileSync(distIndexPath, 'utf8')));
  }

  if (includePackaged) {
    const appAsarPath = resolvePackAsar(repoRoot);
    if (!appAsarPath) {
      reports.push({
        label: 'packaged:app.asar',
        ok: false,
        violations: [{ rule: 'pack_missing', count: 1, sample: 'packaged app.asar not found' }]
      });
    } else {
      try {
        let distIndex = null;
        let matchedPath = null;
        for (const relPath of ['/dist/index.html', 'dist/index.html']) {
          try {
            distIndex = asar.extractFile(appAsarPath, relPath);
            matchedPath = relPath;
            break;
          } catch {
            // try next candidate
          }
        }
        if (!distIndex || !matchedPath) {
          throw new Error('dist/index.html not found in packaged app.asar');
        }
        reports.push(inspectContent(`packaged:${appAsarPath}::${matchedPath}`, distIndex));
      } catch (error) {
        reports.push({
          label: `packaged:${appAsarPath}`,
          ok: false,
          violations: [
            {
              rule: 'pack_extract_failed',
              count: 1,
              sample: error && error.message ? String(error.message) : 'failed to extract dist/index.html from asar'
            }
          ]
        });
      }
    }
  }

  const ok = reports.every((item) => item.ok);
  const output = { ok, checkedAtMs: Date.now(), reports };

  try {
    const artifactsDir = path.join(repoRoot, 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(path.join(artifactsDir, 'renderer-deps-check.json'), JSON.stringify(output, null, 2), 'utf8');
  } catch {
    // best-effort only
  }

  return output;
};

if (require.main === module) {
  const repoRoot = process.cwd();
  const includePackaged = process.argv.includes('--packaged');
  const result = runRendererExternalDepsCheck(repoRoot, { includePackaged });
  if (!result.ok) {
    const detail = result.reports
      .filter((report) => !report.ok)
      .map((report) => `${report.label}: ${report.violations.map((v) => `${v.rule}(${v.count})`).join(', ')}`)
      .join('\n');
    throw new Error(`Renderer external dependency check failed:\n${detail}`);
  }
  console.log(`[rendererDeps] ok (${result.reports.length} checks)`);
}

module.exports = {
  runRendererExternalDepsCheck
};
