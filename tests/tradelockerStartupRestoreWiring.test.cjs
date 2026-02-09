const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('TradeLocker startup auto-restore is gated to one deterministic attempt per boot', () => {
  const hook = read('hooks/useTradeLocker.ts');
  assert.equal(hook.includes('const autoConnectAttemptedRef = useRef(false);'), true);
  assert.equal(hook.includes('if (autoConnectAttemptedRef.current) return;'), true);
  assert.equal(hook.includes('if (!startupBridgeReady) return;'), true);
  assert.equal(hook.includes('if (startupPhase === "booting") return;'), true);
  assert.equal(hook.includes('if (status === "connected" || status === "connecting") return;'), true);
  assert.equal(hook.includes('autoConnectAttemptedRef.current = true;'), true);
  assert.equal(hook.includes('setStartupAutoRestore({'), true);
  assert.equal(hook.includes('setStartupAutoRestore((prev) => ({'), true);
});

test('App passes startup bridge gate to TradeLocker hook exactly once per boot cycle', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('const [tradeLockerStartupGate, setTradeLockerStartupGate] = useState'), true);
  assert.equal(app.includes('startupPhase: tradeLockerStartupGate.phase,'), true);
  assert.equal(app.includes('startupBridgeReady: tradeLockerStartupGate.bridgeReady'), true);
  assert.equal(app.includes('setTradeLockerStartupGate((prev) => {'), true);
});
