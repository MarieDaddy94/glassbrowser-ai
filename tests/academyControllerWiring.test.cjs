const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('Academy refresh and lesson filtering are wired through persisted ledger paths', () => {
  const app = read('App.tsx');
  const academy = read('components/AcademyInterface.tsx');

  // Scheduler-managed academy refresh controller wiring.
  assert.equal(app.includes('const loadAcademyControllerModule = () => {'), true);
  assert.equal(app.includes('mod.createAcademyController({'), true);
  assert.equal(app.includes('controller.start({ scheduler: runtimeScheduler });'), true);
  assert.equal(app.includes('refreshAcademyCases({ force: true })'), true);
  assert.equal(app.includes('refreshAcademyLessons()'), true);
  assert.equal(app.includes('refreshAcademySymbolLearnings()'), true);

  // Persisted reads for academy domains use incremental list options + archive-inclusive continuity.
  assert.equal(app.includes("buildIncrementalListOptions(limit"), true);
  assert.equal(app.includes("kind: 'academy_case'"), true);
  assert.equal(app.includes("kind: 'academy_lesson'"), true);
  assert.equal(app.includes("kind: 'academy_symbol_learning'"), true);
  assert.equal(app.includes('includeArchived: true'), true);

  // Persisted writes for academy outcomes/lessons.
  assert.equal(app.includes("kind: 'academy_case'"), true);
  assert.equal(app.includes("kind: 'academy_lesson'"), true);
  assert.equal(app.includes("await ledger.upsertAgentMemory({"), true);

  // Lesson filters stay panel-prop-driven (no hidden polling loops in Academy UI).
  assert.equal(/setInterval\s*\(/.test(academy), false);
  assert.equal(/setTimeout\s*\(/.test(academy), false);
  assert.equal(academy.includes('const filteredLessons = useMemo(() => {'), true);
  assert.equal(academy.includes('return lessons.filter((lesson) => {'), true);
});

test('restart path includes persisted lesson and score restore inputs', () => {
  const app = read('App.tsx');

  // Academy startup restore
  assert.equal(app.includes('void refreshAcademyCases({ force: true });'), true);
  assert.equal(app.includes('void refreshAcademyLessons();'), true);
  assert.equal(app.includes('void refreshAcademySymbolLearnings();'), true);

  // Rank score persistence restore (paired proof requirement)
  assert.equal(app.includes("ledger.listAgentMemory({ limit, kind: 'agent_scorecard' })"), true);
  assert.equal(app.includes('setAgentScorecards(mergeResult.merged);'), true);
});
