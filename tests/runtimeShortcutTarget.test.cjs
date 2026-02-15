const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('main process includes runtime stamp and shortcut target self-heal for temp extract paths', () => {
  const main = read('electron/main.cjs');

  assert.equal(main.includes('function isTempExtractExecutablePath(executablePath) {'), true);
  assert.equal(main.includes('function logRuntimeStamp() {'), true);
  assert.equal(main.includes('function healWindowsShortcutsToInstalledBinary() {'), true);
  assert.equal(main.includes('shell.readShortcutLink(shortcutPath)'), true);
  assert.equal(main.includes("shell.writeShortcutLink(shortcutPath, 'update'"), true);
  assert.equal(main.includes('const shortcutRepair = healWindowsShortcutsToInstalledBinary();'), true);
});
