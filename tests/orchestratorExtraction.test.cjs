const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('orchestrator modules exist for execution, panel, and startup domains', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'orchestrators', 'executionOrchestrator.ts')), true);
  assert.equal(fs.existsSync(path.join(ROOT, 'orchestrators', 'panelOrchestrator.ts')), true);
  assert.equal(fs.existsSync(path.join(ROOT, 'orchestrators', 'startupOrchestrator.ts')), true);
});

test('App composes extracted orchestrator helpers', () => {
  const source = read('App.tsx');
  assert.equal(source.includes("from './orchestrators/executionOrchestrator'"), true);
  assert.equal(source.includes("from './orchestrators/panelOrchestrator'"), true);
  assert.equal(source.includes("from './orchestrators/startupOrchestrator'"), true);
  assert.equal(source.includes('buildMirrorExecutions('), true);
  assert.equal(source.includes('normalizePanelConnectivitySnapshot('), true);
  assert.equal(source.includes('buildSystemInitializedMessage('), true);
});
