const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('autopilot interface consumes task-tree and action catalog buses', () => {
  const source = read('components/AutoPilotInterface.tsx');

  assert.equal(source.includes("onResumeTaskTreeRun?: (input: {"), true);
  assert.equal(source.includes("onRunActionFlow?: (flow: ActionFlowRecommendation"), true);
  assert.equal(source.includes("onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> })"), true);
  assert.equal(source.includes('onClick={() => onRunActionFlow(flow, {'), true);
  assert.equal(source.includes('window.glass?.broker?.request'), false);
});

test('app wires shadow auto panel through shared task-tree and action bus props', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('<AutoPilotInterface'), true);
  assert.equal(app.includes('taskTreeResumeEntries={taskTreeResumeEntries}'), true);
  assert.equal(app.includes('taskTreeRuns={taskTreeRunsState}'), true);
  assert.equal(app.includes('actionTaskTreeRuns={actionTaskTreeRunsState}'), true);
  assert.equal(app.includes('onRunActionFlow={runRecommendedActionFlow}'), true);
  assert.equal(app.includes('onRunActionCatalog={runActionCatalog}'), true);
});

test('recommended auto workflow run emits audit and refreshes shadow metrics', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const runRecommendedActionFlow = useCallback((flow: ActionFlowRecommendation, opts?: {'), true);
  assert.equal(app.includes('const res = enqueuePlaybookRun({'), true);
  assert.equal(app.includes("eventType: 'autopilot_action_flow_started'"), true);
  assert.equal(app.includes("eventType: 'autopilot_action_flow_failed'"), true);
  assert.equal(app.includes('void refreshShadowTrades({ force: true, includeCompare: true });'), true);
});
