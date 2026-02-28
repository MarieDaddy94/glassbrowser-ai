const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('rank panel reads persisted scorecards/signal outcomes and avoids hidden polling loops', () => {
  const app = read('App.tsx');
  const leaderboard = read('components/LeaderboardInterface.tsx');

  // Persisted rank inputs from trade ledger.
  assert.equal(app.includes("const refreshSignalHistory = useCallback(async (opts?: { force?: boolean; limit?: number; _fullRetry?: boolean }) => {"), true);
  assert.equal(app.includes("kind: 'signal_history'"), true);
  assert.equal(app.includes('buildIncrementalListOptions(limit, syncCursor, true)'), true);
  assert.equal(app.includes('const mergeResult = mergeSignalHistoryEntries(signalHistoryRef.current || [], incoming);'), true);
  assert.equal(app.includes('setSignalHistory(mergeResult.merged);'), true);

  assert.equal(app.includes("const refreshAgentScorecards = useCallback(async (opts?: { limit?: number }) => {"), true);
  assert.equal(app.includes("ledger.listAgentMemory({ limit, kind: 'agent_scorecard' })"), true);
  assert.equal(app.includes('const mergeResult = mergeAgentScorecards(agentScorecardsRef.current || [], entries);'), true);
  assert.equal(app.includes('setAgentScorecards(mergeResult.merged);'), true);

  // Startup restore path for ranking inputs after restart.
  assert.equal(app.includes('void refreshSignalHistory({ force: true });'), true);
  assert.equal(app.includes('if (signalHistory.length > 0) return;'), true);
  assert.equal(app.includes('void refreshAgentScorecards({ limit: 200 });'), true);

  // Leaderboard panel consumes orchestrated persisted props.
  assert.equal(app.includes('history={leaderboardHistory}'), true);
  assert.equal(app.includes('scorecards={agentScorecards}'), true);

  // No hidden polling loops inside Leaderboard panel.
  assert.equal(/setInterval\s*\(/.test(leaderboard), false);
  assert.equal(/setTimeout\s*\(/.test(leaderboard), false);

  // Leaderboard ranking path remains prop-driven (no direct broker side-channel).
  assert.equal(/broker\.request\s*\(/.test(leaderboard), false);
});
