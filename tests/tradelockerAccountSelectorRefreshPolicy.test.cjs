const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'App.tsx');
const hookPath = path.join(process.cwd(), 'hooks/orchestrators/useTradeLockerAccountSelectorRuntime.ts');

test('account selector refresh policy is mode-aware and pauses in cooldown', () => {
  const appSource = fs.readFileSync(appPath, 'utf8');
  const hookSource = fs.readFileSync(hookPath, 'utf8');
  assert.equal(appSource.includes('const TL_ACCOUNT_SELECTOR_NORMAL_REFRESH_MS = 90_000;'), true);
  assert.equal(appSource.includes('const TL_ACCOUNT_SELECTOR_GUARDED_REFRESH_MS = 240_000;'), true);
  assert.equal(hookSource.includes("if (mode === 'cooldown') return;"), true);
  assert.equal(
    hookSource.includes("const intervalMs = mode === 'guarded' ? guardedRefreshMs : normalRefreshMs;"),
    true
  );
});

test('account selector refresh runs through queued inactive-card hydration', () => {
  const source = fs.readFileSync(hookPath, 'utf8');
  assert.equal(
    source.includes('const enqueueTradeLockerAccountSelectorRefresh = React.useCallback('),
    true
  );
  assert.equal(source.includes('const runTradeLockerAccountSelectorQueue = React.useCallback(() => {'), true);
  assert.equal(source.includes('await refreshTradeLockerAccountCardMetrics(nextKey);'), true);
  assert.equal(source.includes('await enqueueTradeLockerAccountSelectorRefresh(targetKeys);'), true);
});
