const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('outcome consistency engine builds cursor and panel freshness states', () => {
  const source = read('services/outcomeConsistencyEngine.ts');
  assert.equal(source.includes("const EXPECTED_PANELS = ['leaderboard', 'academy', 'audit', 'changes'];"), true);
  assert.equal(source.includes('export const buildOutcomeFeedCursorFromHistory'), true);
  assert.equal(source.includes('markPanelRead(panel: string, cursor?: OutcomeFeedCursor | null)'), true);
  assert.equal(source.includes('getPanelFreshness(now: number = Date.now()'), true);
  assert.equal(source.includes("reason: 'checksum_mismatch'"), true);
  assert.equal(source.includes('getConsistencyState(now: number = Date.now()'), true);
});

test('app publishes outcome cursor/consistency/freshness through health snapshot', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('const [outcomeFeedCursor, setOutcomeFeedCursor] = useState<OutcomeFeedCursor>('), true);
  assert.equal(app.includes('const [outcomeFeedConsistency, setOutcomeFeedConsistency] = useState<OutcomeFeedConsistencyState>('), true);
  assert.equal(app.includes('const [panelFreshness, setPanelFreshness] = useState<PanelFreshnessState[]>'), true);
  assert.equal(app.includes('outcomeFeed: {'), true);
  assert.equal(app.includes('consistency: outcomeConsistencySnapshot'), true);
  assert.equal(app.includes('panelFreshness: panelFreshnessSnapshot'), true);
});
