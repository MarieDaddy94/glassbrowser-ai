const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('App external command handler replies before outcome audit persistence', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const logExternalAudit = ('), true);
  assert.equal(app.includes("logExternalAudit('runtime_ops_external_command', 'info'"), true);
  assert.equal(app.includes('await runtimeOpsApi.replyExternalCommand({'), true);
  assert.equal(app.includes("runtime_ops_external_command_succeeded"), true);
  const replyIdx = app.indexOf('await runtimeOpsApi.replyExternalCommand({');
  const auditIdx = app.indexOf("runtime_ops_external_command_succeeded");
  assert.equal(replyIdx > -1, true);
  assert.equal(auditIdx > -1, true);
  assert.equal(replyIdx < auditIdx, true);
});

