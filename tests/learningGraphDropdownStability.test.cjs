const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('learning graph dropdown options come from academy datasets and selected agent stays stable', () => {
  const workbench = read('components/academy/LearningGraphWorkbench.tsx');
  const academy = read('components/AcademyInterface.tsx');

  assert.equal(workbench.includes('const agentOptions = useMemo(() => buildAgentOptions(cases, lessons), [cases, lessons]);'), true);
  assert.equal(workbench.includes('const lastStableAgentRef = useRef<string>('), true);
  assert.equal(workbench.includes('const selectedAgentKey = toText(initial.selectedAgentKey);') || workbench.includes('const [selectedAgentKey, setSelectedAgentKey] = useState'), true);
  assert.equal(workbench.includes('agentOptions.some((entry) => entry.agentKey === selectedAgentKey)'), true);
  assert.equal(workbench.includes('setSelectedAgentKey(fallback);'), true);
  assert.equal(workbench.includes('<LearningGraphExplorer'), true);
  assert.equal(workbench.includes('<LearningGraphCanvas'), true);
  assert.equal(workbench.includes('<LearningGraphInspector'), true);
  assert.equal(academy.includes('<LearningGraphWorkbench'), true);
});
