const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('chart engine marks first refresh pass as startup backfill and tracks source telemetry', () => {
  const source = read('services/chartEngine.ts');

  assert.equal(source.includes('type PatternDetectionSource = \'live\' | \'refresh\' | \'startup_backfill\';'), true);
  assert.equal(source.includes('const hadHistoryBeforeFetch = Number.isFinite(Number(session.lastHistoryFetchAtMs || 0)) && Number(session.lastHistoryFetchAtMs || 0) > 0;'), true);
  assert.equal(source.includes('const detectionSource: PatternDetectionSource = opts?.detectionSource || (hadHistoryBeforeFetch ? \'refresh\' : \'startup_backfill\');'), true);
  assert.equal(source.includes('fromStartupBackfill: Math.max(0, Number(this.patternDetectionFromStartupBackfill || 0)),'), true);
  assert.equal(source.includes("else if (source === 'startup_backfill') this.patternDetectionFromStartupBackfill += 1;"), true);
  assert.equal(source.includes('this.refreshSessionHistory(session, { force: false });'), true);
});
