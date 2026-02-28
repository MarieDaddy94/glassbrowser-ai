const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const panelPath = path.join(process.cwd(), 'components', 'TradeLockerInterface.tsx');

test('TradeLocker panel tracks snapshot switch pending/error state', () => {
  const source = fs.readFileSync(panelPath, 'utf8');
  assert.match(source, /const \[snapshotSwitching,\s*setSnapshotSwitching\] = useState\(false\);/);
  assert.match(source, /const \[snapshotSwitchError,\s*setSnapshotSwitchError\] = useState<string \| null>\(null\);/);
  assert.match(source, /const handleSnapshotSourceSelect = useCallback\(async \(nextKey: string\) => \{/);
});

test('snapshot source selector disables during switch and renders explicit errors', () => {
  const source = fs.readFileSync(panelPath, 'utf8');
  assert.match(source, /disabled=\{snapshotSwitching\}/);
  assert.match(source, /Switching account\.\.\./);
  assert.match(source, /snapshotSwitchError/);
});
