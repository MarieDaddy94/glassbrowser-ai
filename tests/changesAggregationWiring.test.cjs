const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('changes runtime collapses repeated audit bursts into aggregated deltas', () => {
  const runtime = read('services/changesShadowActionRuntime.ts');

  assert.equal(runtime.includes('const CHANGE_AGGREGATION_WINDOW_MS = 90_000;'), true);
  assert.equal(runtime.includes('const aggregateChangeEntries = (entries: any[], limit: number) => {'), true);
  assert.equal(runtime.includes('payload.aggregatedCount = group.count;'), true);
  assert.equal(runtime.includes('payload.suppressedCount = Math.max(0, group.count - 1);'), true);
  assert.equal(runtime.includes("const res = await input.executeCatalogAction({ actionId: 'audit.list', payload });"), true);
  assert.equal(runtime.includes('const aggregatedEntries = aggregateChangeEntries(entries, limit);'), true);
  assert.equal(runtime.includes('entries: aggregatedEntries,'), true);
  assert.equal(runtime.includes('aggregatedWindowMs: CHANGE_AGGREGATION_WINDOW_MS'), true);
});

test('changes panel renders reduced deltas with aggregated counters', () => {
  const panel = read('components/ChangesInterface.tsx');

  assert.equal(panel.includes('const collapseChangeBursts = (entries: AuditEntry[]) => {'), true);
  assert.equal(panel.includes('const reducedEntries = useMemo(() => {'), true);
  assert.equal(panel.includes('return collapseChangeBursts(filteredEntries);'), true);
  assert.equal(panel.includes('Raw {filteredEntries.length}'), true);
  assert.equal(panel.includes('x{aggregateCount}'), true);
  assert.equal(panel.includes('suppressed {suppressedCount}'), true);
});
