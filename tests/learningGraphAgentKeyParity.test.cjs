const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('learning graph uses normalized agent keys for options and filtering', () => {
  const service = read('services/academyLearningGraph.ts');
  const workbench = read('components/academy/LearningGraphWorkbench.tsx');

  assert.equal(service.includes('export const normalizeLearningGraphAgentKey = (value: any) => {'), true);
  assert.equal(service.includes('const selectedAgentKey = asText(filters?.agentId) ? normalizeLearningGraphAgentKey(filters?.agentId) : \'\';'), true);
  assert.equal(service.includes("const agentKey = normalizeLearningGraphAgentKey(entry.agentId || entry.agentName || 'unknown_agent');"), true);
  assert.equal(service.includes('agentKey,'), true);

  assert.equal(workbench.includes('const lastStableAgentRef = useRef<string>(toText(initial.selectedAgentKey));'), true);
  assert.equal(workbench.includes('if (selectedAgentKey && agentOptions.some((entry) => entry.agentKey === selectedAgentKey)) {'), true);
  assert.equal(workbench.includes('const fallback = agentOptions.some((entry) => entry.agentKey === lastStableAgentRef.current)'), true);
  assert.equal(workbench.includes('setSelectedAgentKey(fallback);'), true);
  assert.equal(workbench.includes('normalizeLearningGraphAgentKey(rawKey || rawLabel || \'unknown_agent\')'), true);
});
