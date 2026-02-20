const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('learning graph focus mode controls and dimming behavior are implemented', () => {
  const lensBar = read('components/academy/LearningGraphLensBar.tsx');
  const model = read('services/learningGraphCanvasModel.ts');

  assert.equal(lensBar.includes('Focus'), true);
  assert.equal(lensBar.includes('<option value="hop1">1-Hop</option>'), true);
  assert.equal(lensBar.includes('<option value="hop2">2-Hop</option>'), true);
  assert.equal(lensBar.includes('<option value="path">Path</option>'), true);

  assert.equal(model.includes('const buildFocusNodeSet = (input: {'), true);
  assert.equal(model.includes("if (mode === 'path')"), true);
  assert.equal(model.includes("const depth = mode === 'hop2' ? 2 : 1;"), true);
  assert.equal(model.includes('nodeOpacity[id] = focusNodes.has(id) ? 1 : 0.12;'), true);
});

