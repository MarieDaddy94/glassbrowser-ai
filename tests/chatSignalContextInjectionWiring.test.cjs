const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('focused signal context injection and inspector wiring are present', () => {
  const app = read('App.tsx');
  const chat = read('components/ChatInterface.tsx');

  assert.equal(app.includes('const buildSignalThreadContext = useCallback((signalIdInput?: string | null) => {'), true);
  assert.equal(app.includes('const buildChatContextPack = useCallback((opts?: { focusedSignalId?: string | null }) => {'), true);
  assert.equal(app.includes("title: 'FOCUSED SIGNAL CONTEXT'"), true);
  assert.equal(app.includes("eventType: 'chat_signal_context_injected'"), true);
  assert.equal(app.includes("eventType: 'chat_signal_context_missing'"), true);
  assert.equal(app.includes('setChatContextInspectorState({'), true);

  assert.equal(chat.includes('contextInspector?: {'), true);
  assert.equal(chat.includes('Context Inspector ('), true);
});
