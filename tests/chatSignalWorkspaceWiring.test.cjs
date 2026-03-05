const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('signal workspace types and chat props are wired', () => {
  const types = read('types.ts');
  const app = read('App.tsx');
  const chat = read('components/ChatInterface.tsx');

  assert.equal(types.includes('export interface SignalChatThreadSummary {'), true);
  assert.equal(types.includes('export interface SignalChatContextSnapshot {'), true);
  assert.equal(types.includes("threadKind?: 'global' | 'signal';"), true);
  assert.equal(types.includes('chatSignalActiveThreadId?: string | null;'), true);

  assert.equal(app.includes('const chatSignalWorkspaceFlags = React.useMemo(() => {'), true);
  assert.equal(app.includes('signalThreads={chatSignalWorkspaceV1 ? signalThreads : []}'), true);
  assert.equal(app.includes('activeSignalThreadId={chatSignalWorkspaceV1 ? activeSignalThreadId : null}'), true);

  assert.equal(chat.includes('signalThreads?: SignalChatThreadSummary[];'), true);
  assert.equal(chat.includes('activeSignalThreadId?: string | null;'), true);
  assert.equal(chat.includes('onSelectSignalThread?: (signalId: string | null) => void;'), true);
});
