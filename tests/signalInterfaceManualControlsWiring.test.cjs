const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('SignalInterface exposes manual override controls for force scan and status refresh', () => {
  const source = read('components/SignalInterface.tsx');
  assert.equal(source.includes('onRunScanForceBypass?: () => void;'), true);
  assert.equal(source.includes('onRunSignalStatusReport?: () => void;'), true);
  assert.equal(source.includes('signalStatusReportsBySignalId?: Record<string, SignalStatusReportEntry[]>;'), true);
  assert.equal(source.includes('const handleRunScanForceBypass = useCallback(() => {'), true);
  assert.equal(source.includes('const handleRunSignalStatusReport = useCallback(() => {'), true);
  assert.equal(source.includes('Force New Signals'), true);
  assert.equal(source.includes('Agent Status Update'), true);
});
