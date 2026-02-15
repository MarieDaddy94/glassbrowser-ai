const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'App.tsx');

test('calendar broker-history fallback avoids synthetic BUY/now/zero defaults', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.equal(source.includes("const sideRaw = String(order?.side || order?.action || '').trim().toUpperCase();"), true);
  assert.equal(source.includes("if (sideRaw !== 'BUY' && sideRaw !== 'SELL') return null;"), true);
  assert.equal(source.includes('const createdAtMs ='), true);
  assert.equal(source.includes('toEpochMs(order?.closedAt) ||'), true);
  assert.equal(source.includes('null;'), true);
  assert.equal(source.includes('if (!Number.isFinite(Number(createdAtMs)) || !Number.isFinite(Number(closedAtMs))) return null;'), true);
  assert.equal(source.includes('brokerClosePrice: closePrice,'), true);
  assert.equal(source.includes('realizedPnl: realizedPnl,'), true);
  assert.equal(source.includes('positionClosedPnl: realizedPnl,'), true);
  assert.equal(source.includes('realizedPnl: realizedPnl ?? 0,'), false);
  assert.equal(source.includes('positionClosedPnl: realizedPnl ?? 0,'), false);
});

