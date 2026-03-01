const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const electronPath = path.join(process.cwd(), 'electron', 'tradelocker.cjs');

test('getAccountState fallback uses strict selected-account resolution', () => {
  const source = fs.readFileSync(electronPath, 'utf8');
  assert.match(source, /const selected = this\.findSelectedAccount\(accounts\);/);
  assert.equal(source.includes('if (activeAccountId != null && aId != null && aId === activeAccountId) return true;'), false);
  assert.equal(source.includes('if (activeAccNum != null && aAccNum != null && aAccNum === activeAccNum) return true;'), false);
});

