const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('learning graph cockpit renders explorer + canvas + inspector with Cytoscape canvas', () => {
  const workbench = read('components/academy/LearningGraphWorkbench.tsx');
  const canvas = read('components/academy/LearningGraphCanvas.tsx');
  const explorer = read('components/academy/LearningGraphExplorer.tsx');
  const inspector = read('components/academy/LearningGraphInspector.tsx');
  const minimap = read('components/academy/LearningGraphMiniMap.tsx');

  assert.equal(workbench.includes('LearningGraphExplorer'), true);
  assert.equal(workbench.includes('LearningGraphCanvas'), true);
  assert.equal(workbench.includes('LearningGraphInspector'), true);
  assert.equal(workbench.includes('grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_360px]'), true);

  assert.equal(canvas.includes("import CytoscapeComponent from 'react-cytoscapejs';"), true);
  assert.equal(canvas.includes('Fit Graph'), true);
  assert.equal(canvas.includes('Fit Selection'), true);
  assert.equal(canvas.includes('Zoom to Focus'), true);
  assert.equal(canvas.includes('<LearningGraphMiniMap'), true);
  assert.equal(minimap.includes('Mini-map: N'), true);
  assert.equal(explorer.includes('Explorer'), true);
  assert.equal(inspector.includes('Inspector'), true);
});
