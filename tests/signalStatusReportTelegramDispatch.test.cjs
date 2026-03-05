const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('signal status reports are dispatched through signal telegram relay with dedupe/cooldown', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('const SIGNAL_STATUS_REPORT_TELEGRAM_SAME_VERDICT_COOLDOWN_MS = 5 * 60_000;'), true);
  assert.equal(app.includes('const signalStatusReportTelegramSentRef = React.useRef<Map<string, { reportId: string; verdict: string; sentAtMs: number }>>(new Map());'), true);
  assert.equal(app.includes('const buildSignalStatusReportTelegramText = useCallback(('), true);
  assert.equal(app.includes("if (!signalTelegramEnabled || !signalTelegramBotToken || !signalTelegramChatId) return;"), true);
  assert.equal(app.includes("if (!signalTelegramAllowStatus) return;"), true);
  assert.equal(app.includes("latest.source === 'chart_update' &&"), true);
  assert.equal(app.includes('void sendTelegramText(message).catch(() => null);'), true);
});
