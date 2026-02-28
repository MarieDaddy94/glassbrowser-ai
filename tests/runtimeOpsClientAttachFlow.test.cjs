const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CLIENT = path.join(ROOT, 'scripts', 'runtimeOpsClient.cjs');

test('runtimeOpsClient exposes attach flow that checks state/target then tails logs', () => {
  const source = fs.readFileSync(CLIENT, 'utf8');
  assert.equal(source.includes('async function runAttach(flags)'), true);
  assert.equal(source.includes('await runStatus();'), true);
  assert.equal(source.includes('await runState();'), true);
  assert.equal(source.includes('await runTarget();'), true);
  assert.equal(source.includes('await runLogs({'), true);
  assert.equal(source.includes("if (command === 'attach')"), true);
});
