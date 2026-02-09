const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('Native chart routes history/constraints through broker bridge with explicit source tags', () => {
  const source = read('components/NativeChartInterface.tsx');
  assert.equal(source.includes('requestBrokerCoordinated'), true);
  assert.equal(source.includes("source: `nativechart.history.${frame.id}`"), true);
  assert.equal(source.includes("source: 'nativechart.constraints'"), true);
  assert.equal(source.includes('maxAgeMs: force ? 0 : frame.maxAgeMs'), true);
  assert.equal(source.includes('aggregate: true'), true);
});

test('broker request coordinator dedupe key includes timeframe for chart toggle collapse', () => {
  const app = read('App.tsx');
  const coordinator = read('services/brokerRequestCoordinator.ts');
  assert.equal(app.includes("const timeframe = String((payload as any)?.timeframe || (payload as any)?.resolution || '').trim() || null;"), true);
  assert.equal(app.includes('const coordinated = await brokerRequestCoordinator.run('), true);
  assert.equal(coordinator.includes('keyPart(ctx.timeframe)'), true);
  assert.equal(coordinator.includes('this.dedupeHits += 1;'), true);
});
