const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'App.tsx'), 'utf8');
const USE_SIDEBAR = fs.readFileSync(path.join(ROOT, 'hooks', 'useSidebar.ts'), 'utf8');
const USE_CHAT = fs.readFileSync(path.join(ROOT, 'hooks', 'useChat.ts'), 'utf8');
const SIDEBAR_FRAME = fs.readFileSync(path.join(ROOT, 'components', 'SidebarFrame.tsx'), 'utf8');
const CHAT_INTERFACE = fs.readFileSync(path.join(ROOT, 'components', 'ChatInterface.tsx'), 'utf8');
const CHAT_RUNTIME = fs.readFileSync(path.join(ROOT, 'services', 'catalogChatLiveRuntime.ts'), 'utf8');

test('sidebar defaults to chartchat and aliases legacy chat mode', () => {
  assert.match(USE_SIDEBAR, /useState<SidebarMode>\('chartchat'\)/);
  assert.match(USE_SIDEBAR, /if \(nextMode === 'chat'\) return 'chartchat';/);
});

test('sidebar frame exposes a single chat tab wired to chartchat', () => {
  assert.doesNotMatch(SIDEBAR_FRAME, /onSwitchMode\('chat'\)/);
  assert.doesNotMatch(SIDEBAR_FRAME, /<span>Chart Chat<\/span>/);
  assert.match(SIDEBAR_FRAME, /onSwitchMode\('chartchat'\)/);
  assert.match(SIDEBAR_FRAME, /<span>Chat<\/span>/);
});

test('app command palette routes open-chat to chartchat and removes duplicate action', () => {
  assert.match(APP, /id: 'open-chat'[\s\S]*openSidebarMode\('chartchat'\)/);
  assert.doesNotMatch(APP, /id: 'open-chart-chat'/);
});

test('app renders a single visible chat surface through unified mode gate', () => {
  assert.doesNotMatch(APP, /\{mode === 'chat' && \(/);
  assert.match(APP, /\{isUnifiedChatMode\(mode\) && \(/);
});

test('unified chat state uses migration seed and replaceMessages support', () => {
  assert.match(USE_CHAT, /initialMessages\?: Message\[];/);
  assert.match(USE_CHAT, /const replaceMessages = useCallback\(/);
  assert.match(USE_CHAT, /replaceMessages,/);
  assert.match(APP, /initialMessages: unifiedChatSeedMessages,/);
  assert.match(APP, /replaceMessages,/);
});

test('legacy chat channel aliases to chart channel across runtime and UI', () => {
  assert.match(APP, /if \(!raw\) return 'chart';/);
  assert.match(APP, /if \(raw === 'chart' \|\| raw === 'chartchat' \|\| raw === 'chart_chat' \|\| raw === 'chat'\) return 'chart';/);
  assert.match(CHAT_RUNTIME, /if \(raw === 'chart' \|\| raw === 'chartchat' \|\| raw === 'chart_chat' \|\| raw === 'chat'\) return 'chart';/);
  assert.match(CHAT_INTERFACE, /const normalizedChannel: 'chat' \| 'chart' = 'chart';/);
});

test('chat send payload forwards thread metadata through UI and runtime', () => {
  assert.match(CHAT_INTERFACE, /threadKind: activeThreadKind/);
  assert.match(CHAT_INTERFACE, /threadId: activeThreadId/);
  assert.match(CHAT_INTERFACE, /signalId: activeSignalIdForThread \|\| null/);
  assert.match(CHAT_RUNTIME, /const threadKindRaw = String\(payload\.threadKind \|\| ''\)\.trim\(\)\.toLowerCase\(\);/);
  assert.match(CHAT_RUNTIME, /const threadIdRaw = String\(payload\.threadId \|\| ''\)\.trim\(\);/);
  assert.match(CHAT_RUNTIME, /await chartHandlers\.sendMessage\(text, context, \[\], image, options\);/);
});
