const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy learning graph nodes support drilldown into case and lesson filters', () => {
  const academy = read('components/AcademyInterface.tsx');

  assert.equal(academy.includes('const applyLearningGraphDrilldown = useCallback((nodeId: string) => {'), true);
  assert.equal(academy.includes('setFilterAgent(agentLabel);'), true);
  assert.equal(academy.includes('setLessonAgent(agentLabel);'), true);
  assert.equal(academy.includes('setFilterSymbol(symbolLabel);'), true);
  assert.equal(academy.includes('setLessonSymbol(symbolLabel);'), true);
  assert.equal(academy.includes('setQuery(patternLabel);'), true);
  assert.equal(academy.includes('setLessonQuery(lessonLabel);'), true);
  assert.equal(academy.includes("setActiveTab('cases');"), true);
  assert.equal(academy.includes('onClick={() => applyLearningGraphDrilldown(node.id)}'), true);
});
