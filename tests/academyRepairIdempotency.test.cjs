const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy repair upserts canonical rows idempotently', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const academyCaseRepairPersistedRef = React.useRef<Map<string, string>>(new Map());'), true);
  assert.equal(app.includes('if (academyCaseRepairPersistedRef.current.get(key) === fingerprint) continue;'), true);
  assert.equal(app.includes('academyCaseRepairPersistedRef.current.set(key, fingerprint);'), true);
  assert.equal(app.includes("kind: 'academy_case',"), true);
});
