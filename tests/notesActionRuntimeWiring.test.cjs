const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('Notes capture/replay actions are catalog-driven with replay runtime dispatch', () => {
  const notesUi = read('components/NotesInterface.tsx');
  const notesRuntime = read('services/notesActionRuntime.ts');
  const actionCatalog = read('services/actionCatalog.ts');
  const app = read('App.tsx');

  assert.equal(actionCatalog.includes("'notes.append': {"), true);
  assert.equal(actionCatalog.includes("'notes.trade.replay': {"), true);
  assert.equal(actionCatalog.includes("auditEventType: 'notes_trade_replay'"), true);

  assert.equal(notesRuntime.includes("if (actionId === 'notes.append')"), true);
  assert.equal(notesRuntime.includes("if (actionId === 'notes.trade.replay')"), true);
  assert.equal(notesRuntime.includes("window.dispatchEvent(new CustomEvent('glass_notes_trade_replay'"), true);

  assert.equal(notesUi.includes("runActionOr('notes.trade.replay'"), true);
  assert.equal(notesUi.includes("window.addEventListener('glass_notes_trade_replay'"), true);
  assert.equal(/onClick\s*=\s*\{\(\)\s*=>\s*onReplayTrade\?\.\(/.test(notesUi), false);

  assert.equal(app.includes('onReplayTrade={handleReplayTrade}'), true);
  assert.equal(app.includes('onRunActionCatalog={runActionCatalog}'), true);
});
