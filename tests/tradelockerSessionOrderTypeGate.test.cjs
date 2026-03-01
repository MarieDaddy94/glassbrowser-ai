const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(process.cwd(), 'electron', 'tradelocker.cjs'), 'utf8');

test('session status capabilities are extracted for order types', () => {
  assert.match(source, /function extractSessionOrderTypeCapabilities\(sessionStatus\)/);
  assert.match(source, /orderTypeAllowed = extractSessionOrderTypeCapabilities\(sessionStatus\)/);
  assert.match(source, /orderTypeAllowed: \{ market: null, limit: null, stop: null \}/);
});

test('placeOrder rejects blocked order types before submit', () => {
  assert.match(source, /const orderTypeAllowed = constraints\?\.orderTypeAllowed \|\| \{\}/);
  assert.match(source, /SESSION_ORDER_TYPE_BLOCKED/);
  assert.match(source, /Session status does not allow \${orderType\.toUpperCase\(\)\} orders/);
});

