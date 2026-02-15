const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('agent memory retention policy is defined and applied in JSON ledgers', () => {
  const electronJson = read('electron/tradeLedger.cjs');
  const fallbackJson = read('tradeLedger.cjs');

  for (const source of [electronJson, fallbackJson]) {
    assert.equal(source.includes('const AGENT_MEMORY_KIND_FLOORS = Object.freeze({'), true);
    assert.equal(source.includes('academy_case: 2000'), true);
    assert.equal(source.includes('signal_history: 2000'), true);
    assert.equal(source.includes('const AGENT_MEMORY_KIND_CEILINGS = Object.freeze({'), true);
    assert.equal(source.includes('chart_event: 500'), true);
    assert.equal(source.includes('action_trace: 250'), true);
    assert.equal(source.includes('unknown: 500'), true);
    assert.equal(source.includes('function normalizeAgentMemoryKindForRetention('), true);
    assert.equal(source.includes('function trimAgentMemoriesWithPolicy(list)'), true);
  }

  assert.equal(electronJson.includes('agentMemories: trimAgentMemoriesWithPolicy('), true);
  assert.equal(electronJson.includes('this.state.agentMemories = trimAgentMemoriesWithPolicy(list);'), true);
  assert.equal(fallbackJson.includes('agentMemories: trimAgentMemoriesWithPolicy(agentMemories),'), true);
  assert.equal(fallbackJson.includes('this.state.agentMemories = trimAgentMemoriesWithPolicy(list);'), true);
});

test('agent memory retention policy is enforced in sqlite trim path', () => {
  const sqlite = read('electron/tradeLedgerSqlite.cjs');

  assert.equal(sqlite.includes('const AGENT_MEMORY_KIND_FLOORS = Object.freeze({'), true);
  assert.equal(sqlite.includes('const AGENT_MEMORY_KIND_CEILINGS = Object.freeze({'), true);
  assert.equal(sqlite.includes('const NON_PRUNABLE_AGENT_MEMORY_KINDS = Object.freeze(['), true);
  assert.equal(sqlite.includes('function normalizeAgentMemoryKindForRetention(value) {'), true);
  assert.equal(sqlite.includes('// Step A: enforce noisy-kind ceilings first.'), true);
  assert.equal(sqlite.includes('// Step B: if still over cap, trim oldest rows from kinds outside protected/no-prune sets.'), true);
  assert.equal(sqlite.includes('// Step C: if still over, trim protected kinds above floor budgets, excluding no-prune kinds.'), true);
  assert.equal(sqlite.includes('// Step D: emergency fallback trim only from non-no-prune kinds.'), true);
  assert.equal(sqlite.includes("console.warn('[agent_memory_trim_skipped_non_prunable]'"), true);
});
