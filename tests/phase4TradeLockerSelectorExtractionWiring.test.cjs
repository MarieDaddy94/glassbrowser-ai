const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('phase4 tradelocker selector runtime extraction wiring is present', () => {
  const app = read('App.tsx');
  const hook = read('hooks/orchestrators/useTradeLockerAccountSelectorRuntime.ts');
  const orchestrator = read('orchestrators/tradeLockerAccountSelectorOrchestrator.ts');
  const commandBuilder = read('orchestrators/app/builders/buildCommandActionsModel.ts');

  assert.equal(app.includes("import { useTradeLockerAccountSelectorRuntime } from './hooks/orchestrators/useTradeLockerAccountSelectorRuntime';"), true);
  assert.equal(app.includes("import { buildCommandActionsModel } from './orchestrators/app/builders/buildCommandActionsModel';"), true);
  assert.equal(app.includes('} = useTradeLockerAccountSelectorRuntime({'), true);

  assert.equal(app.includes('const tradeLockerAccountSelectorBaseRows = React.useMemo(() => {'), false);
  assert.equal(app.includes('const tradeLockerAccountSelectorItems = React.useMemo<TradeLockerAccountSelectorItem[]>(() => {'), false);
  assert.equal(app.includes('const tradeLockerAccountSelectorModel = React.useMemo(() => {'), false);

  assert.equal(hook.includes('const tradeLockerAccountSelectorBaseRows = React.useMemo(() => {'), true);
  assert.equal(hook.includes('const tradeLockerAccountSelectorItems = React.useMemo(() => {'), true);
  assert.equal(hook.includes('const tradeLockerAccountSelectorModel = React.useMemo('), true);
  assert.equal(hook.includes('const handleTradeLockerAccountSelectorSelect = React.useCallback('), true);
  assert.equal(hook.includes('const res = await handleSnapshotSourceChange(nextKey);'), true);

  assert.equal(orchestrator.includes('export const buildTradeLockerAccountSelectorBaseRows = ('), true);
  assert.equal(orchestrator.includes('export const buildTradeLockerAccountSelectorItems = ('), true);
  assert.equal(orchestrator.includes('export const buildTradeLockerAccountSelectorSnapshot = ('), true);
  assert.equal(orchestrator.includes('export const buildTradeLockerAccountSelectorModel = ('), true);

  assert.equal(commandBuilder.includes('export const buildCommandActionsModel = ('), true);
  assert.equal(commandBuilder.includes("{ id: 'open-chat', label: 'Open Chat', group: 'Panels'"), true);
  assert.equal(commandBuilder.includes("id: 'context-pack-copy'"), true);
});
