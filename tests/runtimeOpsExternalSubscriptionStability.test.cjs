const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'App.tsx');

test('App runtime external command listener uses stable ref dispatch and does not resubscribe on handler identity churn', () => {
  const source = fs.readFileSync(APP, 'utf8');

  assert.equal(source.includes('const runtimeOpsExternalCommandHandlerRef = React.useRef<((incoming: any) => void) | null>(null);'), true);
  assert.equal(source.includes('runtimeOpsExternalCommandHandlerRef.current = (incoming: any) => {'), true);
  assert.equal(source.includes('runtimeOpsExternalCommandHandlerRef.current?.(payload);'), true);
  assert.equal(source.includes('}, [runtimeOpsFeatureFlags.runtimeOpsBridgeStabilityV1]);'), true);
});
