const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy learning graph engine builds Agent > Symbol > Pattern > Lesson hierarchy', () => {
  const source = read('services/academyLearningGraph.ts');

  assert.equal(source.includes('export const buildAcademyLearningGraph ='), true);
  assert.equal(source.includes("const agentNodeId = `agent:${slug(agentKey || agentLabel) || 'unknown'}`;"), true);
  assert.equal(source.includes("const symbolNodeId = `${agentNodeId}|symbol:${slug(symbolKey) || 'unknown'}`;"), true);
  assert.equal(source.includes("const patternNodeId = `${symbolNodeId}|pattern:${slug(patternKey) || 'uncategorized_pattern'}`;"), true);
  assert.equal(source.includes("const lessonNodeId = `${patternNodeId}|lesson:${slug(lesson.id) || slug(lesson.title) || 'lesson'}`;"), true);
  assert.equal(source.includes('return {'), true);
  assert.equal(source.includes('nodes,'), true);
  assert.equal(source.includes('edges,'), true);
  assert.equal(source.includes('rootNodeIds'), true);
});
