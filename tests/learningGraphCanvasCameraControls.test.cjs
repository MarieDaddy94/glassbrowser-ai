const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('learning graph canvas exposes camera controls and keyboard shortcuts', () => {
  const canvas = read('components/academy/LearningGraphCanvas.tsx');

  assert.equal(canvas.includes('Fit Graph'), true);
  assert.equal(canvas.includes('Fit Selection'), true);
  assert.equal(canvas.includes('Home'), true);
  assert.equal(canvas.includes('zoomBy(0.12)'), true);
  assert.equal(canvas.includes('zoomBy(-0.12)'), true);
  assert.equal(canvas.includes("if (key === '0')"), true);
  assert.equal(canvas.includes("else if (key === '=' || key === '+')"), true);
  assert.equal(canvas.includes("else if (key === '-')"), true);
  assert.equal(canvas.includes("else if (key === 'f')"), true);
  assert.equal(canvas.includes('setZoomPercent'), true);
});

