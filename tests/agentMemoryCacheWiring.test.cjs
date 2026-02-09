const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('Agent Memory panel reads persisted memory and uses budgeted query cache', () => {
  const source = read('components/AgentMemoryInterface.tsx');
  assert.equal(source.includes('getCacheBudgetManager'), true);
  assert.equal(source.includes("const AGENT_MEMORY_QUERY_CACHE_BUDGET = 'agent_memory.query_cache';"), true);
  assert.equal(source.includes('const queryCacheRef = useRef<Map<string, { entries: AgentMemoryEntry[]; fetchedAtMs: number }>>(new Map());'), true);
  assert.equal(source.includes('cacheBudgetManager.register({'), true);
  assert.equal(source.includes("runPanelAction('agent.memory.list'"), true);
  assert.equal(source.includes('ledger.listAgentMemory(payload);'), true);
});

test('Agent Memory cache tracks hits/misses and stays bounded with eviction telemetry', () => {
  const source = read('components/AgentMemoryInterface.tsx');
  assert.equal(source.includes('cacheBudgetManager.noteGet(AGENT_MEMORY_QUERY_CACHE_BUDGET, cacheKey, true);'), true);
  assert.equal(source.includes('cacheBudgetManager.noteGet(AGENT_MEMORY_QUERY_CACHE_BUDGET, cacheKey, false);'), true);
  assert.equal(source.includes('cacheBudgetManager.noteSet(AGENT_MEMORY_QUERY_CACHE_BUDGET, cacheKey);'), true);
  assert.equal(source.includes('cacheBudgetManager.apply('), true);
  assert.equal(source.includes('cacheBudgetManager.noteEviction(AGENT_MEMORY_QUERY_CACHE_BUDGET, cache.size, \'lru\');'), true);
  assert.equal(source.includes('clearQueryCache();'), true);
});
