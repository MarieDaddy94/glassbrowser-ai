const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'App.tsx');

test('app wires startup recovery, beforeunload fallback, and main shutdown handshake', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.equal(source.includes('const runStartupAcademyRecovery = async () => {'), true);
  assert.equal(source.includes('void runStartupAcademyRecovery();'), true);
  assert.equal(source.includes("void flushAcademyForShutdown('beforeunload', ACADEMY_SHUTDOWN_TIMEOUT_MS);"), true);
  assert.equal(source.includes('const subscribePrepareShutdown = window.glass?.app?.onPrepareShutdown;'), true);
  assert.equal(source.includes("const result = await flushAcademyForShutdown('app_prepare_shutdown', timeoutMs);"), true);
  assert.equal(source.includes('await notifyShutdownReady({'), true);
});

