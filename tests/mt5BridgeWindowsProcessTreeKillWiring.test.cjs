const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('main entrypoints include windows process-tree kill fallback for mt5 sidecar shutdown', () => {
  const electronMain = read('electron/main.cjs');
  const rootMain = read('main.cjs');

  for (const source of [electronMain, rootMain]) {
    assert.equal(source.includes('function killProcessTreeWindows(pid)'), true);
    assert.equal(source.includes("spawn('taskkill', ['/PID', String(targetPid), '/T', '/F']"), true);
    assert.equal(source.includes("taskkill /T /F"), true);
    assert.equal(source.includes('lastTerminationRequestedAtMs'), true);
    assert.equal(source.includes('lastTerminationAckAtMs'), true);
  }
});

