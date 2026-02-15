const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy force-focus bypass keeps targeted case visible even when filters hide it', () => {
  const academy = read('components/AcademyInterface.tsx');

  assert.equal(academy.includes('const [forcedFocusCaseId, setForcedFocusCaseId] = useState<string | null>(null);'), true);
  assert.equal(academy.includes('const displayedCases = useMemo(() => {'), true);
  assert.equal(academy.includes('const includePinned = (pinId: string | null | undefined) => {'), true);
  assert.equal(academy.includes('const alreadyVisible = next.some((entry) => entry.id === key || entry.signalId === key);'), true);
  assert.equal(academy.includes('const focused = (cases || []).find((entry) => entry.id === key || entry.signalId === key);'), true);
  assert.equal(academy.includes('includePinned(forcedFocusCaseId);'), true);
  assert.equal(academy.includes('includePinned(selectedCaseId);'), true);

  assert.equal(academy.includes('if (focusRequest?.forceVisible) {'), true);
  assert.equal(academy.includes("setForcedFocusCaseId(String(matched.id || matched.signalId || targetId || '').trim() || null);"), true);
  assert.equal(academy.includes('setForcedFocusCaseId(targetId);'), true);
  assert.equal(academy.includes("onFocusRequestConsumed?.(requestId, 'matched');"), true);
});
