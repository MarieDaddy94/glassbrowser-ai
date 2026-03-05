const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('phase4 context builder extraction wiring is present', () => {
  const app = read('App.tsx');
  const models = read('components/app/models.ts');
  const appOrchestrator = read('components/app/AppOrchestrator.tsx');
  const appShellContent = read('components/app/AppShellContent.tsx');

  assert.equal(app.includes("import { buildChatPanelModel } from './orchestrators/app/builders/buildChatPanelModel';"), true);
  assert.equal(app.includes("import { buildSignalPanelModel } from './orchestrators/app/builders/buildSignalPanelModel';"), true);
  assert.equal(
    app.includes("import { buildTradeLockerPanelModel } from './orchestrators/app/builders/buildTradeLockerPanelModel';"),
    true
  );
  assert.equal(app.includes("import { buildShellContentModel } from './orchestrators/app/builders/buildShellContentModel';"), true);
  assert.equal(app.includes("import { buildOutsideShellModel } from './orchestrators/app/builders/buildOutsideShellModel';"), true);
  assert.equal(app.includes("import { buildSidebarPanelsModel } from './orchestrators/app/builders/buildSidebarPanelsModel';"), true);
  assert.equal(
    app.includes("import { buildSidebarLegacyPanelModel } from './orchestrators/app/builders/buildSidebarLegacyPanelModel';"),
    true
  );
  assert.equal(
    app.includes("import { buildAppOrchestratorDeps } from './orchestrators/app/builders/buildAppOrchestratorDeps';"),
    true
  );

  assert.equal(app.includes('const appChatPanelModel = buildChatPanelModel({'), true);
  assert.equal(app.includes('const appSignalPanelModel = buildSignalPanelModel({'), true);
  assert.equal(app.includes('const appTradeLockerPanelModel = buildTradeLockerPanelModel({'), true);
  assert.equal(app.includes('const appSidebarLegacyPanelsModel = buildSidebarLegacyPanelModel({'), true);
  assert.equal(app.includes('const appSidebarPanelsModel = buildSidebarPanelsModel({'), true);
  assert.equal(app.includes('const appOrchestratorDeps = buildAppOrchestratorDeps({'), true);

  assert.equal(models.includes('export interface AppSidebarPanelsModel {'), true);
  assert.equal(models.includes('export interface AppShellContentModel {'), true);
  assert.equal(models.includes('export type AppOutsideShellModel = Record<string, unknown>;'), true);
  assert.equal(models.includes('export type AppSidebarPanelsCtx ='), true);

  assert.equal(appOrchestrator.includes('sidebarPanels: AppSidebarPanelsModel;'), true);
  assert.equal(appOrchestrator.includes('mainSlot: <AppShellContent ctx={{ ...shell, sidebarPanels }} />'), true);
  assert.equal(appShellContent.includes('sidebarPanels'), true);
  assert.equal(appShellContent.includes('<AppSidebarPanels model={sidebarPanels} />'), true);
});
