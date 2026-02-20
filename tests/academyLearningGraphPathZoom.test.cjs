const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('learning graph path zoom wiring fits highlighted path and emits app telemetry hook', () => {
  const workbench = read('components/academy/LearningGraphWorkbench.tsx');
  const canvas = read('components/academy/LearningGraphCanvas.tsx');
  const app = read('App.tsx');

  assert.equal(workbench.includes('const zoomToPath = () => {'), true);
  assert.equal(workbench.includes('setPathZoomNonce((prev) => prev + 1);'), true);
  assert.equal(workbench.includes('onPathZoom?.({'), true);
  assert.equal(workbench.includes('Zoom to Path'), true);
  assert.equal(workbench.includes('pathZoomNonce={pathZoomNonce}'), true);

  assert.equal(canvas.includes('pathZoomNonce?: number;'), true);
  assert.equal(canvas.includes('if (!Number.isFinite(Number(pathZoomNonce)) || Number(pathZoomNonce) <= 0) return;'), true);
  assert.equal(canvas.includes('cyRef.current.fit(collection, 38);'), true);

  assert.equal(app.includes("eventType: 'academy_graph_path_zoom'"), true);
  assert.equal(app.includes('onLearningGraphPathZoom={recordAcademyLearningGraphPathZoom}'), true);
});
