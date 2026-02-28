const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('runtime controller state carries active stream metadata for external state.get', () => {
  const app = read('App.tsx');
  const types = read('types.ts');
  const controller = read('services/runtimeOpsController.ts');

  assert.equal(types.includes('activeStreamId?: string | null;'), true);
  assert.equal(types.includes('streamConnectedAtMs?: number | null;'), true);
  assert.equal(types.includes('streamLastError?: string | null;'), true);
  assert.equal(controller.includes('activeStreamId: null,'), true);
  assert.equal(controller.includes('streamConnectedAtMs: null,'), true);
  assert.equal(controller.includes('streamLastError: null,'), true);
  assert.equal(app.includes('setRuntimeOpsStreamStatus(\'connected\', {'), true);
});

