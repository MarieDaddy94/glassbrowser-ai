const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('phase4 render tree extraction removes direct shell/panel tags from App.tsx', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('<BrowserChrome'), false);
  assert.equal(app.includes('<SidebarFrame'), false);
  assert.equal(app.includes('<WindowFrame'), false);
  assert.equal(app.includes('<ToastContainer'), false);
  assert.equal(app.includes('<CommandPalette'), false);
  assert.equal(app.includes('<OnboardingGate'), false);
  assert.equal(app.includes('<SettingsModal'), false);

  assert.equal(app.includes('const appSidebarPanelsCtx = {'), false);
  assert.equal(app.includes('const appOrchestratorShell = {'), false);
  assert.equal(app.includes('const appOrchestratorOutsideShell = {'), false);
  assert.equal(app.includes('const appSidebarLegacyPanelsModel = buildSidebarLegacyPanelModel({'), true);
  assert.equal(app.includes('const appSidebarPanelsModel = buildSidebarPanelsModel({'), true);
  assert.equal(app.includes('const appOrchestratorShell = buildShellContentModel({'), true);
  assert.equal(app.includes('const appOrchestratorOutsideShell = buildOutsideShellModel({'), true);
  assert.equal(app.includes('const appOrchestratorDeps = buildAppOrchestratorDeps({'), true);
  assert.equal(app.includes('deps={appOrchestratorDeps}'), true);
});
