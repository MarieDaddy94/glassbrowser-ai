const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('app runtime ops stream uses scheduler fallback polling when push stream is unavailable', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('runtime.ops.stream.reconnect'), true);
  assert.equal(app.includes('runtime.ops.stream.fallback_poll'), true);
  assert.equal(app.includes('setRuntimeOpsStreamStatus(\'fallback_polling\', {'), true);
  assert.equal(app.includes('diagnostics.getMainLog({ maxLines: 120, maxBytes: 100_000 })'), true);
  assert.equal(app.includes('code: \'fallback_poll\''), true);
});
