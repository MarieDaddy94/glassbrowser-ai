const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('learning graph uses normalized agent keys for options and filtering', () => {
  const service = read('services/academyLearningGraph.ts');
  const academy = read('components/AcademyInterface.tsx');

  assert.equal(service.includes('export const normalizeLearningGraphAgentKey = (value: any) => {'), true);
  assert.equal(service.includes('const selectedAgentKey = selectedAgentRaw ? normalizeLearningGraphAgentKey(selectedAgentRaw) : \'\';'), true);
  assert.equal(service.includes('const entryAgentKey = normalizeLearningGraphAgentKey(entry.agentId || entry.agentName || \'unknown_agent\');'), true);
  assert.equal(service.includes('agentKey,'), true);

  assert.equal(academy.includes('normalizeLearningGraphAgentKey(meta.agentKey || node.label || node.id)'), true);
  assert.equal(academy.includes('value={option.agentKey}'), true);
  assert.equal(academy.includes('const fallback ='), true);
  assert.equal(academy.includes('setLearningGraphAgentId(fallback);'), true);
});
