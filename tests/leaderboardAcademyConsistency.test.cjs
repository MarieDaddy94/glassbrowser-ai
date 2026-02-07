const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('app marks leaderboard/academy/audit/changes against the same outcome feed cursor', () => {
  const app = read('App.tsx');
  assert.equal(app.includes("outcomeConsistencyEngine.markPanelRead('leaderboard', cursor);"), true);
  assert.equal(app.includes("outcomeConsistencyEngine.markPanelRead('academy', outcomeFeedCursor);"), true);
  assert.equal(app.includes("outcomeConsistencyEngine.markPanelRead('audit', outcomeFeedCursor);"), true);
  assert.equal(app.includes("outcomeConsistencyEngine.markPanelRead('changes', outcomeFeedCursor);"), true);
});

test('leaderboard, academy, audit, and changes panels expose shared outcome feed state', () => {
  const leaderboard = read('components/LeaderboardInterface.tsx');
  const academy = read('components/AcademyInterface.tsx');
  const audit = read('components/AuditTrailInterface.tsx');
  const changes = read('components/ChangesInterface.tsx');

  assert.equal(leaderboard.includes('outcomeFeedCursor?: OutcomeFeedCursor | null;'), true);
  assert.equal(leaderboard.includes('outcomeFeedConsistency?: OutcomeFeedConsistencyState | null;'), true);
  assert.equal(leaderboard.includes('panelFreshness?: PanelFreshnessState | null;'), true);

  assert.equal(academy.includes('outcomeFeedCursor?: OutcomeFeedCursor | null;'), true);
  assert.equal(academy.includes('outcomeFeedConsistency?: OutcomeFeedConsistencyState | null;'), true);
  assert.equal(academy.includes('panelFreshness?: PanelFreshnessState | null;'), true);

  assert.equal(audit.includes('outcomeFeedCursor?: OutcomeFeedCursor | null;'), true);
  assert.equal(audit.includes('outcomeFeedConsistency?: OutcomeFeedConsistencyState | null;'), true);
  assert.equal(audit.includes('panelFreshness?: PanelFreshnessState | null;'), true);

  assert.equal(changes.includes('outcomeFeedCursor?: OutcomeFeedCursor | null;'), true);
  assert.equal(changes.includes('outcomeFeedConsistency?: OutcomeFeedConsistencyState | null;'), true);
  assert.equal(changes.includes('panelFreshness?: PanelFreshnessState | null;'), true);
});
