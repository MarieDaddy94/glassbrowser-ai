const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(process.cwd(), 'services', 'workerFallbackPolicy.ts'), 'utf8');

test('worker fallback policy defines standardized fallback reasons', () => {
  assert.equal(source.includes("'worker_init_failed'"), true);
  assert.equal(source.includes("'worker_timeout'"), true);
  assert.equal(source.includes("'worker_error'"), true);
  assert.equal(source.includes("'invalid_payload'"), true);
});

test('worker fallback policy tracks per-domain fallback stats', () => {
  assert.equal(source.includes('const statsMap = new Map<string, WorkerFallbackStats>()'), true);
  assert.equal(source.includes('fallbackUsed'), true);
  assert.equal(source.includes('fallbackReasons'), true);
  assert.equal(source.includes('getWorkerFallbackStats'), true);
});

