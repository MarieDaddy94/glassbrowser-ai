const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('chat panel is lazy-loaded and chat workflow/tool modules are dynamically imported', () => {
  const app = read('App.tsx');
  const useChat = read('hooks/useChat.ts');

  assert.equal(app.includes("const loadChatInterface = () => import('./components/ChatInterface');"), true);
  assert.equal(app.includes('const ChatInterface = React.lazy(loadChatInterface);'), true);
  assert.equal(app.includes("case 'chat':"), true);
  assert.equal(app.includes('safe(loadChatInterface());'), true);

  assert.equal(useChat.includes("chatWorkflowIntentModulePromise = import('../services/chatWorkflowIntent')"), true);
  assert.equal(useChat.includes("chatPromptBuildersModulePromise = import('../services/chatPromptBuilders')"), true);
  assert.equal(useChat.includes("chatToolCallRouterModulePromise = import('../services/chatToolCallRouter')"), true);
});

test('chat interface routes send/tool/voice flows through shared handlers', () => {
  const chat = read('components/ChatInterface.tsx');
  const app = read('App.tsx');

  assert.equal(chat.includes('onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;'), true);
  assert.equal(chat.includes('void onRunActionCatalog({ actionId, payload: { ...payload, channel: normalizedChannel } });'), true);
  assert.equal(chat.includes('onSendMessage: (text: string, image?: string | Array<{ dataUrl?: string; label?: string; meta?: any }> | null) => void;'), true);
  assert.equal(chat.includes("startLiveSession: (type: 'camera' | 'screen' | 'audio') => void;"), true);
  assert.equal(chat.includes('stopLiveSession: () => void;'), true);
  assert.equal(chat.includes('speakMessage: (id: string, text: string, agentName?: string) => void;'), true);

  assert.equal(app.includes('<ChatInterface'), true);
  assert.equal(app.includes('onRunActionCatalog={runActionCatalog}'), true);
});
