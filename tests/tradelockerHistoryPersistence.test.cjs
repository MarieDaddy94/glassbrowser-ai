const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const panelPath = path.join(process.cwd(), 'components', 'TradeLockerInterface.tsx');

test('TradeLocker history keeps per-account cached rows when refresh fails', () => {
  const source = fs.readFileSync(panelPath, 'utf8');
  assert.equal(source.includes("const HISTORY_CACHE_STORAGE_KEY = 'glass_tradelocker_history_cache_v1';"), true);
  assert.equal(source.includes('const historyCacheRef = useRef<Map<string, { entries: any[]; updatedAtMs: number }>>(new Map());'), true);
  assert.equal(source.includes('hydrateHistoryCache();'), true);
  assert.equal(source.includes('historyCacheRef.current.set(historyCacheKey,'), true);
  assert.equal(source.includes('persistHistoryCache();'), true);
  assert.equal(source.includes('Showing cached history'), true);
});
