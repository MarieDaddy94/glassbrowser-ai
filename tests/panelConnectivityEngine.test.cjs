const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('panel connectivity engine provides catalog-first execution with fallback and health snapshots', () => {
  const source = read('services/panelConnectivityEngine.ts');
  assert.equal(source.includes('class PanelConnectivityEngine'), true);
  assert.equal(source.includes('async runAction(input: RunActionInput)'), true);
  assert.equal(source.includes('if (input.runActionCatalog)'), true);
  assert.equal(source.includes('if (input.fallback)'), true);
  assert.equal(source.includes('getSnapshot(now: number = Date.now())'), true);
  assert.equal(source.includes('createPanelActionRunner'), true);
});

test('panel connectivity engine enforces timeout, retry, and backoff controls', () => {
  const source = read('services/panelConnectivityEngine.ts');
  assert.equal(source.includes('DEFAULT_TIMEOUT_MS'), true);
  assert.equal(source.includes('DEFAULT_RETRIES'), true);
  assert.equal(source.includes('DEFAULT_RETRY_DELAY_MS'), true);
  assert.equal(source.includes('MAX_BACKOFF_MS'), true);
  assert.equal(source.includes('if (state.failureCount >= 3)'), true);
  assert.equal(source.includes('source_blocked_until_'), true);
});
