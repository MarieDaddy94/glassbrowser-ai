const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('Performance dashboard consumes persisted research registry model without panel polling loops', () => {
  const dashboard = read('components/PerformanceDashboard.tsx');
  const app = read('App.tsx');

  // Dashboard model is loaded from service output (registry-backed), not in-panel heavy recompute from raw trades.
  assert.equal(dashboard.includes("import { buildPerformanceDashboardModel, startResearchSession } from '../services/researchAutopilotService';"), true);
  assert.equal(dashboard.includes('const payload = await buildPerformanceDashboardModel(String(session.sessionId), { sessionLimit: sessionWindow });'), true);

  // Persisted reads come from research session registry APIs.
  assert.equal(dashboard.includes('ledger.listResearchSessions({ limit: 20 })'), true);
  assert.equal(dashboard.includes('ledger.getResearchSession({ sessionId: String(session.sessionId) })'), true);

  // No hidden dashboard polling loop.
  assert.equal(/setInterval\s*\(/.test(dashboard), false);
  assert.equal(/setTimeout\s*\(/.test(dashboard), false);

  // App wiring keeps dashboard action bus integration in orchestrated path.
  assert.equal(app.includes('<PerformanceDashboard'), true);
  assert.equal(app.includes('onRunActionCatalog={runActionCatalog}'), true);
});

test('dashboard model builder caps session scope and reads registry summaries', () => {
  const service = read('services/researchAutopilotService.ts');

  assert.equal(service.includes('export const buildPerformanceDashboardModel = async ('), true);
  assert.equal(service.includes('const limit = Number.isFinite(Number(options?.sessionLimit))'), true);
  assert.equal(service.includes('Math.max(3, Math.min(50, Math.floor(Number(options?.sessionLimit))))'), true);
  assert.equal(service.includes('ledger.listResearchSessions({'), true);
  assert.equal(service.includes('ledger.listResearchSteps({ sessionId: String(entry.sessionId), limit: 200 })'), true);
});
