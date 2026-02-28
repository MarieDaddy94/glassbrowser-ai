const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'App.tsx');

test('App tracks runtime external command subscription health and reasserts subscription', () => {
  const source = fs.readFileSync(APP, 'utf8');
  assert.equal(source.includes('commandSubscriberHealthy: false'), true);
  assert.equal(source.includes("id: 'runtime.ops.external_command.reassert'"), true);
  assert.equal(source.includes('runtime_ops_external_command_subscriber_ready'), true);
  assert.equal(source.includes('runtime_ops_external_command_subscribe_failed'), true);
  assert.equal(source.includes('runtimeOpsControllerStateRef.current?.commandSubscriberHealthy === true'), true);
});
