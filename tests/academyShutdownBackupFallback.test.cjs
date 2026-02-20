const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'App.tsx');

test('academy shutdown writes backup markers for pending timeout and error fallbacks', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.equal(source.includes("const ACADEMY_SHUTDOWN_BACKUP_KEY = 'glass_academy_shutdown_backup_v1';"), true);
  assert.equal(source.includes("persistAcademyShutdownBackup('shutdown_pending'"), true);
  assert.equal(source.includes("persistAcademyShutdownBackup('shutdown_timeout'"), true);
  assert.equal(source.includes("persistAcademyShutdownBackup('shutdown_error'"), true);
  assert.equal(source.includes('localStorage.setItem(ACADEMY_SHUTDOWN_BACKUP_KEY,'), true);
});

