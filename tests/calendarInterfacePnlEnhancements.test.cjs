const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('calendar pnl ui includes account selector, source badges, and per-account overlays', () => {
  const calendar = read('components/CalendarInterface.tsx');
  const app = read('App.tsx');

  assert.equal(calendar.includes('pnlAccountOptions?: CalendarPnlAccountOption[];'), true);
  assert.equal(calendar.includes('pnlActiveAccountKey?: string | null;'), true);
  assert.equal(calendar.includes('const [pnlAccountKey, setPnlAccountKey] = useState<string>('), true);
  assert.equal(calendar.includes('accountKey: accountKeyRaw || null'), true);
  assert.equal(calendar.includes('<span>Account</span>'), true);
  assert.equal(calendar.includes('Realized PnL source:'), true);
  assert.equal(calendar.includes('Per-account month overlay'), true);
  assert.equal(calendar.includes('Src {String(trade.pnlSourceKind || \'unknown\').toUpperCase()}'), true);
  assert.equal(calendar.includes("if (!exists) setPnlAccountKey('');"), true);

  assert.equal(app.includes('pnlAccountOptions={(Array.isArray(tlAccounts) ? tlAccounts : [])'), true);
  assert.equal(app.includes('pnlActiveAccountKey={getTradeLockerAccountKey()}'), true);
  assert.equal(app.includes('accountKey: requestedAccountKeyRaw || null,'), true);
});
