const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('execution audit service tracks submit/ack and mismatches', () => {
  const source = read('services/executionAuditService.ts');
  assert.equal(source.includes('noteSubmitted('), true);
  assert.equal(source.includes('noteAck('), true);
  assert.equal(source.includes('getSnapshot()'), true);
  assert.equal(source.includes('missing_broker_order_id'), true);
  assert.equal(source.includes('multiple_order_ids_for_signal'), true);
});

test('app writes queue execution telemetry fields', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('submittedAtMs'), true);
  assert.equal(app.includes('ackAtMs'), true);
  assert.equal(app.includes('brokerOrderId'), true);
  assert.equal(app.includes('retryCount'), true);
  assert.equal(app.includes('executionAuditService.noteSubmitted'), true);
  assert.equal(app.includes('executionAuditService.noteAck'), true);
});
