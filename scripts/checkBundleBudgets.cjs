const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function resolveChunk(stats, needle) {
  return (stats?.chunks || []).find((chunk) => String(chunk?.file || '').includes(needle)) || null;
}

function prettyBytes(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '--';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
}

function checkBundleBudgets(repoRoot) {
  const budgetsPath = path.join(repoRoot, 'scripts', 'bundle-budgets.json');
  const statsPath = path.join(repoRoot, 'artifacts', 'bundle-stats.json');
  const budgets = readJson(budgetsPath);
  const stats = readJson(statsPath);

  const errors = [];
  const warnings = [];
  const rows = [];

  for (const [label, budget] of Object.entries(budgets || {})) {
    const needle = String(budget?.match || '').trim();
    if (!needle) continue;
    const metric = String(budget?.metric || 'rawBytes');
    const hard = Number(budget?.hard || 0);
    const target = Number(budget?.target || 0);
    const chunk = resolveChunk(stats, needle);
    if (!chunk) {
      errors.push(`${label}: chunk match "${needle}" not found in bundle stats`);
      continue;
    }
    const value = Number(chunk?.[metric] || 0);
    const row = {
      label,
      chunk: chunk.file,
      metric,
      value,
      hard,
      target
    };
    rows.push(row);
    if (hard > 0 && value > hard) {
      errors.push(`${label}: ${metric} ${value} exceeds hard cap ${hard} (${chunk.file})`);
    } else if (target > 0 && value > target) {
      warnings.push(`${label}: ${metric} ${value} above target ${target} (${chunk.file})`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, rows };
}

function runCli() {
  const repoRoot = process.cwd();
  const result = checkBundleBudgets(repoRoot);
  for (const row of result.rows) {
    console.log(
      `[bundle:budget] ${row.label}: ${prettyBytes(row.value)} ` +
      `(target ${prettyBytes(row.target)} | hard ${prettyBytes(row.hard)}) -> ${row.chunk}`
    );
  }
  for (const warn of result.warnings) {
    console.warn(`[bundle:budget] WARN ${warn}`);
  }
  if (!result.ok) {
    for (const err of result.errors) {
      console.error(`[bundle:budget] ERROR ${err}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('[bundle:budget] ok');
}

if (require.main === module) {
  runCli();
}

module.exports = {
  checkBundleBudgets
};

