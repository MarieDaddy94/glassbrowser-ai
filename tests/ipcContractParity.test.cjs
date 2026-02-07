const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const { checkParity } = require('../scripts/checkIpcContractParity.cjs');

test('ipc contract file exists', () => {
  const contractPath = path.join(process.cwd(), 'contracts', 'ipc.contract.json');
  assert.equal(fs.existsSync(contractPath), true, `Missing contract file: ${contractPath}`);
});

test('ipc contract parity check passes', () => {
  const result = checkParity();
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
});

