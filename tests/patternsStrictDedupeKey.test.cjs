const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('chart engine applies strict deterministic pattern key dedupe', () => {
  const source = read('services/chartEngine.ts');
  const app = read('App.tsx');

  assert.equal(source.includes('const MAX_PATTERN_EVENT_KEY_CACHE = 20000;'), true);
  assert.equal(source.includes('private patternEventKeyCache = new Set<string>();'), true);
  assert.equal(source.includes('const buildPatternEventKey = (event: Partial<PatternEvent> | null | undefined) => {'), true);
  assert.equal(source.includes('if (patternKey && this.patternEventKeyCache.has(patternKey)) {'), true);
  assert.equal(source.includes('this.patternDetectionDedupeSuppressed += 1;'), true);
  assert.equal(source.includes('this.rememberPatternEventKey(patternKey);'), true);
  assert.equal(source.includes('patternKey?: string | null;'), true);
  assert.equal(source.includes("source?: 'live' | 'refresh' | 'startup_backfill' | string | null;"), true);
  assert.equal(app.includes('patternKey: payload.patternKey ? String(payload.patternKey) : null,'), true);
  assert.equal(app.includes('source: payload.source ? String(payload.source) : null'), true);
});
