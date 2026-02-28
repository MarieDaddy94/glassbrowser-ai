const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('runtime ops live actions are protected by guardrail checks before execution', () => {
  const guardrails = read('services/runtimeOpsGuardrails.ts');
  const controller = read('services/runtimeOpsController.ts');

  assert.equal(guardrails.includes("if (!canRunLive) {"), true);
  assert.equal(guardrails.includes("blockedReasons.push('live_execution_disabled');"), true);
  assert.equal(guardrails.includes("blockedReasons.push('kill_switch_active');"), true);
  assert.equal(guardrails.includes("blockedReasons.push('broker_not_connected');"), true);
  assert.equal(controller.includes('const guardrail = evaluateRuntimeOpsGuardrails({'), true);
  assert.equal(controller.includes('if (!guardrail.pass || this.state.mode === \'observe_only\') {'), true);
});

