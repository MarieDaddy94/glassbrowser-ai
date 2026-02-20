const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy interface mounts learning graph workbench with drilldown and lesson actions', () => {
  const academy = read('components/AcademyInterface.tsx');

  assert.equal(academy.includes("import LearningGraphWorkbench from './academy/LearningGraphWorkbench';"), true);
  assert.equal(academy.includes('<LearningGraphWorkbench'), true);
  assert.equal(academy.includes('onDrilldown={(target) => {'), true);
  assert.equal(academy.includes('onApplyLesson={onApplyLesson}'), true);
  assert.equal(academy.includes('onSimulateLesson={onSimulateLesson}'), true);
  assert.equal(academy.includes('onPinLesson={onPinLesson}'), true);
  assert.equal(academy.includes('onSetLessonLifecycle={onSetLessonLifecycle}'), true);
});
