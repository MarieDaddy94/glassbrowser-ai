const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGET_DIRS = ['components', 'hooks', 'services', 'controllers'];
const ALLOWLIST = new Set(['App.tsx']);

const walk = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(next, out);
      continue;
    }
    if (!/\.(ts|tsx|js|cjs|mjs)$/.test(entry.name)) continue;
    out.push(next);
  }
  return out;
};

test('runtime broker calls are routed through brokerRequestBridge', () => {
  const violations = [];
  for (const relDir of TARGET_DIRS) {
    const dir = path.join(ROOT, relDir);
    const files = walk(dir);
    for (const file of files) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      if (ALLOWLIST.has(path.basename(file))) continue;
      const source = fs.readFileSync(file, 'utf8');
      if (/broker\.request\s*\(/.test(source)) {
        violations.push(rel);
      }
    }
  }
  assert.deepEqual(violations, [], `broker.request bypasses found:\n${violations.join('\n')}`);
});

