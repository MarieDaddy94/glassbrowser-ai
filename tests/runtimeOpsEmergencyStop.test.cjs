const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('runtime ops controller exposes emergency stop flow that halts autonomous execution', () => {
  const controller = read('services/runtimeOpsController.ts');
  const monitor = read('components/MonitorInterface.tsx');

  assert.equal(controller.includes("this.state.mode = 'emergency_stop';"), true);
  assert.equal(controller.includes('this.state.armed = false;'), true);
  assert.equal(controller.includes("if (this.state.mode === 'disarmed' || this.state.mode === 'emergency_stop') return false;"), true);
  assert.equal(controller.includes("'runtime_ops_emergency_stop'"), true);
  assert.equal(monitor.includes('Emergency Stop'), true);
});
