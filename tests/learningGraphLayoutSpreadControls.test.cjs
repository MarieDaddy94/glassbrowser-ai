const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('learning graph layout controls map to deterministic layout configs', () => {
  const lensBar = read('components/academy/LearningGraphLensBar.tsx');
  const workbench = read('components/academy/LearningGraphWorkbench.tsx');
  const layoutService = read('services/learningGraphLayout.ts');

  assert.equal(lensBar.includes('Layout'), true);
  assert.equal(lensBar.includes('Spread'), true);
  assert.equal(lensBar.includes('Re-run Layout'), true);
  assert.equal(workbench.includes('layoutRunNonce'), true);
  assert.equal(workbench.includes('onRerunLayout={() => setLayoutRunNonce((prev) => prev + 1)}'), true);

  assert.equal(layoutService.includes("export type LearningGraphLayoutMode = 'hierarchy' | 'radial' | 'force';"), true);
  assert.equal(layoutService.includes("if (mode === 'hierarchy')"), true);
  assert.equal(layoutService.includes("if (mode === 'radial')"), true);
  assert.equal(layoutService.includes("name: 'cose'"), true);
});

