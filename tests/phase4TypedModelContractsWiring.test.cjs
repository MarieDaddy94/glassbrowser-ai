const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('phase4 app model contracts use concrete types for chat/signal/tradelocker known fields', () => {
  const models = read('components/app/models.ts');
  const chatBuilder = read('orchestrators/app/builders/buildChatPanelModel.ts');
  const signalBuilder = read('orchestrators/app/builders/buildSignalPanelModel.ts');
  const tlBuilder = read('orchestrators/app/builders/buildTradeLockerPanelModel.ts');

  assert.equal(models.includes('signalThreads: SignalChatThreadSummary[];'), true);
  assert.equal(models.includes('signalContextById: Record<string, SignalChatContextSnapshot>;'), true);
  assert.equal(models.includes('signalStatusReportsBySignalId: SignalStatusReportMap;'), true);
  assert.equal(models.includes('tlAccountMetrics: TradeLockerAccountMetrics | null;'), true);
  assert.equal(models.includes('export type AppSidebarPanelsCtx ='), true);

  assert.equal(chatBuilder.includes('activeSignalThreadId: input.activeSignalThreadId ?? null'), true);
  assert.equal(chatBuilder.includes('signalThreads: Array.isArray(input.signalThreads) ? input.signalThreads : []'), true);
  assert.equal(signalBuilder.includes('signalEntries: Array.isArray(input.signalEntries) ? input.signalEntries : []'), true);
  assert.equal(tlBuilder.includes('tlAccountMetrics: input.tlAccountMetrics ?? null'), true);
});

