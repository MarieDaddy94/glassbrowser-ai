const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('signal quant telemetry type is defined in shared types', () => {
  const types = read('types.ts');
  assert.equal(types.includes('export interface SignalQuantTelemetry {'), true);
  assert.equal(types.includes("status: 'pass' | 'warn' | 'block';"), true);
  assert.equal(types.includes("metaDecision?: 'take' | 'skip' | 'size_down' | null;"), true);
  assert.equal(types.includes('warnReasons?: string[] | null;'), true);
  assert.equal(types.includes('blockReasons?: string[] | null;'), true);
});

test('app computes and persists quant telemetry across execution paths', () => {
  const app = read('App.tsx');
  assert.equal(app.includes("const quantTelemetry: SignalEntry['quantTelemetry'] = {"), true);
  assert.equal(app.includes("status: quantBlock.length > 0 ? 'block' : quantWarn.length > 0 ? 'warn' : 'pass'"), true);
  assert.equal(app.includes("{ ...item, status: 'FAILED', executionError: error, quantTelemetry }"), true);
  assert.equal(app.includes('{ ...item, quantTelemetry }'), true);
  assert.equal(app.includes('quantTelemetry: entry.quantTelemetry ?? null,'), true);
  assert.equal(app.includes('const quantRaw = payload.quantTelemetry'), true);
});

test('signal interface exposes quant explainability badges', () => {
  const signal = read('components/SignalInterface.tsx');
  assert.equal(signal.includes('quantTelemetry?: SignalQuantTelemetry | null;'), true);
  assert.equal(signal.includes('const quantTelemetry = signal.quantTelemetry || null;'), true);
  assert.equal(signal.includes('Q {quantStatusLabel}'), true);
  assert.equal(signal.includes('Regime {String(quantTelemetry.regimeLabel).toUpperCase()}'), true);
  assert.equal(signal.includes("Meta {String(quantTelemetry.metaDecision).toUpperCase()}"), true);
  assert.equal(signal.includes("Risk {quantTelemetry.portfolioAllowed ? 'OK' : 'BLOCK'}"), true);
});
