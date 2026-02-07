const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('critical bridge-heavy panels are wired through panel connectivity runner', () => {
  const targets = [
    ['components/CalendarInterface.tsx', 'calendar'],
    ['components/AgentMemoryInterface.tsx', 'agentmemory'],
    ['components/MT5Interface.tsx', 'mt5'],
    ['components/NativeChartInterface.tsx', 'nativechart'],
    ['components/TradeLockerInterface.tsx', 'tradelocker']
  ];
  for (const [relPath, panelKey] of targets) {
    const source = read(relPath);
    assert.equal(source.includes('createPanelActionRunner'), true, `${relPath} missing connectivity runner`);
    assert.equal(new RegExp(`panel\\s*:\\s*['"]${panelKey}['"]`).test(source), true, `${relPath} missing panel key ${panelKey}`);
    assert.equal(/onRunActionCatalog\s*\(\s*\{/.test(source), false, `${relPath} still calls onRunActionCatalog directly`);
  }
});

test('app action catalog is routed through panel connectivity engine', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('panelConnectivityEngine.runAction({'), true);
  assert.equal(app.includes("panel: 'app'"), true);
});
