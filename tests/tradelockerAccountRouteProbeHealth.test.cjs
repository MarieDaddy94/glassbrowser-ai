const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(process.cwd(), 'electron', 'tradelocker.cjs'), 'utf8');

test('account-route verification uses account-scoped probe endpoint', () => {
  assert.match(source, /verifyActiveAccountContext\(\{ allowRepair = true, probePath = null \} = \{\}\)/);
  assert.match(source, /const fallback = `\/trade\/accounts\/\$\{normalizedAccountId\}\/state`/);
  assert.match(source, /this\.apiRequestMeta\(probeTarget, \{ includeAccNum: true \}\)/);
});

test('status exposes account probe health metadata', () => {
  assert.match(source, /accountProbePath: this\.accountProbePath \|\| null/);
  assert.match(source, /accountProbeHealthyAtMs: this\.accountProbeHealthyAtMs \|\| null/);
  assert.match(source, /accountProbeLastError: this\.accountProbeLastError \|\| null/);
});

