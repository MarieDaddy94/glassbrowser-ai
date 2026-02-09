const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('audit trail reads consolidated action-catalog source with ledger fallback', () => {
  const auditPanel = read('components/AuditTrailInterface.tsx');
  const auditRuntime = read('services/auditActionRuntime.ts');

  assert.equal(auditPanel.includes("onRunActionCatalog({ actionId: 'audit.list', payload: { limit } })"), true);
  assert.equal(auditPanel.includes('const ledger = (window as any)?.glass?.tradeLedger;'), true);
  assert.equal(auditPanel.includes('const res = await ledger.list({ limit });'), true);

  assert.equal(auditRuntime.includes("if (actionId === 'audit.list') {"), true);
  assert.equal(auditRuntime.includes("entries = entries.filter((entry: any) => entry?.kind === 'audit_event');"), true);
});

test('audit trail exposes task-tree replay hooks and app wiring', () => {
  const auditPanel = read('components/AuditTrailInterface.tsx');
  const app = read('App.tsx');

  assert.equal(auditPanel.includes('onReplayTaskTree?: (summary: TaskTreeRunSummary) => void;'), true);
  assert.equal(auditPanel.includes("entry?.eventType === 'task_tree_persist'"), true);
  assert.equal(auditPanel.includes('onClick={() => onReplayTaskTree(selectedSignalRun.summary)}'), true);
  assert.equal(auditPanel.includes('onClick={() => onReplayTaskTree(selectedActionRun.summary)}'), true);
  assert.equal(auditPanel.includes('onClick={() => onReplayTaskTree(replayPayload as TaskTreeRunSummary)}'), true);

  assert.equal(app.includes('<AuditTrailInterface'), true);
  assert.equal(app.includes('onReplayTaskTree={handleReplayTaskTree}'), true);
  assert.equal(app.includes('onRunActionCatalog={runActionCatalog}'), true);
});
