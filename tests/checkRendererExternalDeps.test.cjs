const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { runRendererExternalDepsCheck } = require('../scripts/checkRendererExternalDeps.cjs');

const mkTmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'renderer-deps-'));

test('renderer external dependency check passes for local-only index', () => {
  const root = mkTmp();
  fs.writeFileSync(
    path.join(root, 'index.html'),
    '<!doctype html><html><head><meta charset="utf-8" /></head><body><div id="root"></div></body></html>',
    'utf8'
  );
  const result = runRendererExternalDepsCheck(root, { includePackaged: false });
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(root, 'artifacts', 'renderer-deps-check.json')), true);
});

test('renderer external dependency check fails when external URLs/importmap exist', () => {
  const root = mkTmp();
  fs.writeFileSync(
    path.join(root, 'index.html'),
    [
      '<!doctype html><html><head>',
      '<script src="https://cdn.tailwindcss.com"></script>',
      '<script type="importmap">{}</script>',
      '</head><body></body></html>'
    ].join(''),
    'utf8'
  );
  const result = runRendererExternalDepsCheck(root, { includePackaged: false });
  assert.equal(result.ok, false);
  const report = result.reports.find((entry) => entry.label === 'source:index.html');
  assert.equal(!!report, true);
  assert.equal(report.violations.some((entry) => entry.rule === 'tailwind_cdn'), true);
  assert.equal(report.violations.some((entry) => entry.rule === 'importmap'), true);
});
