const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('phase4 sidebar legacy model extraction wiring is present', () => {
  const app = read('App.tsx');
  const legacyBuilder = read('orchestrators/app/builders/buildSidebarLegacyPanelModel.ts');
  const depsBuilder = read('orchestrators/app/builders/buildAppOrchestratorDeps.ts');
  const sidebarBuilder = read('orchestrators/app/builders/buildSidebarPanelsModel.ts');
  const sidebarPanels = read('components/app/AppSidebarPanels.tsx');

  assert.equal(app.includes('const appSidebarLegacyPanelsModel = {'), false);
  assert.equal(app.includes('const appSidebarLegacyPanelsModel = buildSidebarLegacyPanelModel({'), true);
  assert.equal(app.includes('const appOrchestratorDeps = buildAppOrchestratorDeps({'), true);

  assert.equal(legacyBuilder.includes('export const buildSidebarLegacyPanelModel ='), true);
  assert.equal(depsBuilder.includes('export const buildAppOrchestratorDeps ='), true);
  assert.equal(sidebarBuilder.includes('ctx:'), true);
  assert.equal(sidebarBuilder.includes('...(input.legacy || {})'), true);
  assert.equal(sidebarBuilder.includes('...(input.chat || {})'), true);
  assert.equal(sidebarBuilder.includes('...(input.signal || {})'), true);
  assert.equal(sidebarBuilder.includes('...(input.tradeLocker || {})'), true);

  assert.equal(sidebarPanels.includes('const mergedCtx = model.ctx;'), true);
  assert.equal(sidebarPanels.includes('React.useMemo'), false);
});

