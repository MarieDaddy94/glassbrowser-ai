const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'App.tsx');

test('App external command listener cleanup unsubscribes before marking dispatcher disposed', () => {
  const source = fs.readFileSync(APP, 'utf8');
  const anchor = source.indexOf('const unsubscribe = runtimeOpsApi.onExternalCommand((payload: any) => {');
  assert.equal(anchor > -1, true);
  const window = source.slice(anchor, anchor + 1200);
  const unsubscribeIdx = window.indexOf('unsubscribe?.();');
  const disposedIdx = window.indexOf('disposed = true;');

  assert.equal(unsubscribeIdx > -1, true);
  assert.equal(disposedIdx > -1, true);
  assert.equal(unsubscribeIdx < disposedIdx, true);
});
