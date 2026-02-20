const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('learning graph inspector exposes operational tabs and evidence case actions', () => {
  const inspector = read('components/academy/LearningGraphInspector.tsx');
  const workbench = read('components/academy/LearningGraphWorkbench.tsx');
  const academy = read('components/AcademyInterface.tsx');

  assert.equal(inspector.includes("(['overview', 'evidence', 'actions'] as LearningGraphInspectorView[])"), true);
  assert.equal(inspector.includes("onCaseAction?.({ caseId: String(entry.id), action: 'open_chart' }, entry);"), true);
  assert.equal(inspector.includes("onCaseAction?.({ caseId: String(entry.id), action: 'replay_case' }, entry);"), true);
  assert.equal(inspector.includes("onCaseAction?.({ caseId: String(entry.id), action: 'show_reasoning' }, entry);"), true);

  assert.equal(workbench.includes('onCaseAction={onCaseAction}'), true);
  assert.equal(academy.includes('const handleLearningGraphCaseAction = useCallback((payload: LearningCaseAction, entry: AcademyCase) => {'), true);
  assert.equal(academy.includes("if (action === 'open_chart') {"), true);
  assert.equal(academy.includes("} else if (action === 'replay_case') {"), true);
  assert.equal(academy.includes("} else if (action === 'show_reasoning') {"), true);
});
