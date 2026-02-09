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
  assert.equal(source.includes('source_cooldown_active'), true);
  assert.equal(source.includes('retryAfterMs'), true);
  assert.equal(source.includes('blockedUntilMs'), true);
});

test('blocked panel sources do not increment failure count while cooldown is active', () => {
  const source = read('services/panelConnectivityEngine.ts');
  const blockedStart = source.indexOf('if (this.isBlocked(panel, source, now)) {');
  assert.equal(blockedStart >= 0, true);
  const blockedBody = source.slice(blockedStart, source.indexOf('const startedAt = Date.now();', blockedStart));
  assert.equal(blockedBody.includes('this.markFailure(panel, source, msg, null);'), false);
  assert.equal(blockedBody.includes('blocked: true'), true);
  assert.equal(blockedBody.includes('blockedReason'), true);
});
