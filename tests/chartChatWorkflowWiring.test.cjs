const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), "utf8");

test("chart chat panel renders with chart channel and shared action bus", () => {
  const app = read("App.tsx");
  const chat = read("components/ChatInterface.tsx");
  const sessions = read("hooks/useChartSessions.ts");

  assert.equal(app.includes("import { useChartSessions } from './hooks/useChartSessions';"), true);
  assert.equal(app.includes("const chartSessions = useChartSessions();"), true);
  assert.equal(app.includes('channel="chart"'), true);
  assert.equal(app.includes("chartSessions={chartSessions.sessions}"), true);
  assert.equal(app.includes("onRunActionCatalog={runActionCatalog}"), true);

  assert.equal(chat.includes("const normalizedChannel: 'chat' | 'chart' = channel === 'chart' ? 'chart' : 'chat';"), true);
  assert.equal(chat.includes("void onRunActionCatalog({ actionId, payload: { ...payload, channel: normalizedChannel } });"), true);
  assert.equal(sessions.includes("export function useChartSessions()"), true);
});
