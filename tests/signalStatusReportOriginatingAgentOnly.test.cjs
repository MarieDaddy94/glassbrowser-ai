const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('status report commentary uses originating agent when present', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('const resolveOriginatingAgent = (entry: SignalEntry) => {'), true);
  assert.equal(app.includes("const agentId = String(entry?.agentId || '').trim();"), true);
  assert.equal(app.includes("const agentName = String(entry?.agentName || '').trim().toLowerCase();"), true);
  assert.equal(app.includes('{ agent: originAgent }'), true);
});
