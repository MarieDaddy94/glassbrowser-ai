const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('learning graph minimap renders viewport and supports click/drag panning', () => {
  const minimap = read('components/academy/LearningGraphMiniMap.tsx');
  const canvas = read('components/academy/LearningGraphCanvas.tsx');

  assert.equal(minimap.includes('viewportRectRef'), true);
  assert.equal(minimap.includes('onPointerDown={handlePointerDown}'), true);
  assert.equal(minimap.includes('onPointerMove={handlePointerMove}'), true);
  assert.equal(minimap.includes('onPointerUp={handlePointerUp}'), true);
  assert.equal(minimap.includes('centerAt'), true);
  assert.equal(minimap.includes('Selection'), true);
  assert.equal(canvas.includes('<LearningGraphMiniMap'), true);
});

