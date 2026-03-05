const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('thread metadata and routing are wired through send pipeline', () => {
  const app = read('App.tsx');
  const useChat = read('hooks/useChat.ts');
  const runtime = read('services/catalogChatLiveRuntime.ts');

  assert.equal(useChat.includes('const includeMessageInThreadHistory = (message: Message | null | undefined, threadMetaInput: any): boolean => {'), true);
  assert.equal(useChat.includes('const historySnapshot = (messages || []).filter((entry) => includeMessageInThreadHistory(entry, requestThreadMeta));'), true);
  assert.equal(useChat.includes('sendMessageToOpenAI('), true);
  assert.equal(useChat.includes('historySnapshot,'), true);
  assert.equal(useChat.includes('threadKind: meta.threadKind,'), true);

  assert.equal(runtime.includes('const threadKindRaw = String(payload.threadKind || \'\').trim().toLowerCase();'), true);
  assert.equal(runtime.includes('const signalId = String(payload.signalId || \'\').trim();'), true);

  assert.equal(app.includes('threadKind: effectiveThreadKind,'), true);
  assert.equal(app.includes('threadId: effectiveThreadId,'), true);
  assert.equal(app.includes('signalId: effectiveSignalId || null'), true);
});
