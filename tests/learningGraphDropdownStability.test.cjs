const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('learning graph dropdown options come from academy datasets and selected agent stays stable', () => {
  const academy = read('components/AcademyInterface.tsx');

  assert.equal(academy.includes('const learningGraphAgentGraph = useMemo<LearningGraphSnapshot>(() => ('), true);
  assert.equal(academy.includes('const learningGraphAgentOptions = useMemo(() => {'), true);
  assert.equal(academy.includes('for (const entry of cases || []) {'), true);
  assert.equal(academy.includes('for (const lesson of lessons || []) {'), true);
  assert.equal(academy.includes('const selectedExists = learningGraphAgentOptions.some((option) => option.agentKey === selectedKey);'), true);
  assert.equal(academy.includes('learningGraphLastStableAgentKeyRef.current'), true);
  assert.equal(academy.includes('const learningGraphSelectedAgentNodeId = useMemo(() => {'), true);
  assert.equal(academy.includes('{learningGraphSelectedAgentNodeId ? renderLearningGraphNode(learningGraphSelectedAgentNodeId, 0) : null}'), true);
});
