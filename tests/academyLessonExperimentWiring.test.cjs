const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('app wires lesson simulation to experiment memory persistence', () => {
  const app = read('App.tsx');

  assert.equal(app.includes("import { runLessonCounterfactualExperiment } from './services/academyLessonExperimentService';"), true);
  assert.equal(app.includes('const runAcademyLessonSimulation = useCallback(async (lessonId: string) => {'), true);
  assert.equal(app.includes("kind: 'academy_lesson_experiment'"), true);
  assert.equal(app.includes('academy_lesson_experiment:'), true);
  assert.equal(app.includes('onSimulateLesson={(lessonId) => {'), true);
});
