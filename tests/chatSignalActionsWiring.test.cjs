const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('chat signal actions are guarded and routed to existing handlers', () => {
  const app = read('App.tsx');
  const chat = read('components/ChatInterface.tsx');

  assert.equal(app.includes('const executeSignalFromChat = useCallback((signalId: string) => {'), true);
  assert.equal(app.includes('void executeSignalTrade(id, \'manual\');'), true);
  assert.equal(app.includes('const rejectSignalFromChat = useCallback((signalId: string) => {'), true);
  assert.equal(app.includes("void rejectSignalEntry(id, 'Rejected from chat workspace');"), true);
  assert.equal(app.includes('const cancelSignalOrderFromChat = useCallback((signalId: string) => {'), true);
  assert.equal(app.includes('void cancelSignalOrder(id);'), true);
  assert.equal(app.includes("eventType: 'chat_signal_action_requested'"), true);

  assert.equal(chat.includes('onExecuteSignalFromChat?: (signalId: string) => void;'), true);
  assert.equal(chat.includes('onRejectSignalFromChat?: (signalId: string) => void;'), true);
  assert.equal(chat.includes('onCancelSignalOrderFromChat?: (signalId: string) => void;'), true);
  assert.equal(chat.includes('>Execute</button>'), true);
  assert.equal(chat.includes('>Reject</button>'), true);
  assert.equal(chat.includes('>Cancel Pending</button>'), true);
});
