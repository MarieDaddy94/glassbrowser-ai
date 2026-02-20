const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('semantic zoom + declutter model is wired for learning graph canvas', () => {
  const model = read('services/learningGraphCanvasModel.ts');
  const canvas = read('components/academy/LearningGraphCanvas.tsx');

  assert.equal(model.includes("type ZoomBand = 'far' | 'mid' | 'near';"), true);
  assert.equal(model.includes('export const computeZoomBand = (zoom: number): ZoomBand => {'), true);
  assert.equal(model.includes('export const buildLabelVisibilityPlan = (input: {'), true);
  assert.equal(model.includes('export const applyCollisionDeclutter = ('), true);
  assert.equal(model.includes('const isSelected = id === selectedId;'), true);
  assert.equal(model.includes('const isHovered = id === hoveredId;'), true);
  assert.equal(model.includes('const isHighlighted = highlighted.has(id);'), true);
  assert.equal(model.includes('const priority ='), true);
  assert.equal(canvas.includes('buildGraphRenderState'), true);
  assert.equal(canvas.includes('displayLabel'), true);
});
