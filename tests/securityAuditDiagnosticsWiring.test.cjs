const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('security diagnostics endpoints are wired through main and preload', () => {
  const electronMain = read('electron/main.cjs');
  const rootMain = read('main.cjs');
  const preload = read('electron/preload.cjs');
  const globals = read('global.d.ts');

  assert.equal(electronMain.includes("ipcMain.handle('diagnostics:securityAuditSnapshot'"), true);
  assert.equal(electronMain.includes("ipcMain.handle('diagnostics:renderPerfSnapshot'"), true);
  assert.equal(rootMain.includes("ipcMain.handle('diagnostics:securityAuditSnapshot'"), true);
  assert.equal(rootMain.includes("ipcMain.handle('diagnostics:renderPerfSnapshot'"), true);
  assert.equal(preload.includes("getSecurityAuditSnapshot: () => guardedInvoke('diagnostics', 'diagnostics:securityAuditSnapshot')"), true);
  assert.equal(preload.includes("getRenderPerfSnapshot: () => guardedInvoke('diagnostics', 'diagnostics:renderPerfSnapshot')"), true);
  assert.equal(globals.includes('getSecurityAuditSnapshot: () => Promise<{'), true);
  assert.equal(globals.includes('getRenderPerfSnapshot: () => Promise<{'), true);
});
