const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy learning graph nodes support drilldown into case and lesson filters', () => {
  const workbench = read('components/academy/LearningGraphWorkbench.tsx');

  assert.equal(workbench.includes('const handleDrilldownNode = (node: LearningGraphNode) => {'), true);
  assert.equal(workbench.includes("if (!target.lesson && cursor.type === 'lesson') target.lesson = toText(cursor.label);"), true);
  assert.equal(workbench.includes("if (!target.pattern && cursor.type === 'pattern') target.pattern = toText(cursor.label);"), true);
  assert.equal(workbench.includes("if (!target.symbol && cursor.type === 'symbol') target.symbol = toText(cursor.label);"), true);
  assert.equal(workbench.includes("if (!target.agent && cursor.type === 'agent') target.agent = toText(cursor.label);"), true);
  assert.equal(workbench.includes('onDrilldown(target);'), true);
  assert.equal(workbench.includes('onDrilldownNode={handleDrilldownNode}'), true);
});
