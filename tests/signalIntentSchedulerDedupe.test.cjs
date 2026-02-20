const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('signal intent scheduler computes deterministic due slots and dedupes seen slots', () => {
  const source = read('services/signalIntentScheduler.ts');

  assert.equal(source.includes("slotKey: `${intent.id}:${parts.ymd}:${parts.hhmm}:${timezone}`"), true);
  assert.equal(source.includes('if (seenSlots.has(check.slotKey)) continue;'), true);
  assert.equal(source.includes('const maxMinutes = 8 * 24 * 60;'), true);
  assert.equal(source.includes("if (!intent || intent.status !== 'active') return { due: false, slotKey: null };"), true);
});

