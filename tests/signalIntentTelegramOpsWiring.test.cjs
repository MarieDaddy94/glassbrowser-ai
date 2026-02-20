const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), "utf8");

test("telegram runtime wires signal intent commands and App passes handlers", () => {
  const runtime = read("services/telegramMessageRuntime.ts");
  const app = read("App.tsx");

  assert.equal(runtime.includes("'/intents [n] [status] - list signal intents'"), true);
  assert.equal(runtime.includes("if (command === '/intents')"), true);
  assert.equal(runtime.includes("if (command === '/intent' || command === '/intent_status')"), true);
  assert.equal(runtime.includes("if (command === '/intent_pause')"), true);
  assert.equal(runtime.includes("if (command === '/intent_resume')"), true);
  assert.equal(runtime.includes("signalIntentsRef: MutableRef<SignalIntentLike[]>"), true);
  assert.equal(runtime.includes("signalIntentRunsRef: MutableRef<SignalIntentRunLike[]>"), true);
  assert.equal(runtime.includes('signalIntentTelegramOpsEnabled?: boolean;'), true);
  assert.equal(runtime.includes("resolveTelegramSignalIntent"), true);
  assert.equal(runtime.includes("pauseSignalIntent"), true);
  assert.equal(runtime.includes("resumeSignalIntent"), true);
  assert.equal(runtime.includes('if (!intentOpsEnabled)'), true);

  assert.equal(app.includes("signalIntentsRef,"), true);
  assert.equal(app.includes("signalIntentRunsRef,"), true);
  assert.equal(app.includes('signalIntentTelegramOpsEnabled: signalIntentFeatureFlags.signalIntentV1TelegramOps,'), true);
  assert.equal(app.includes("resolveTelegramSignalIntent: resolveSignalIntentByToken"), true);
  assert.equal(app.includes("pauseSignalIntent,"), true);
  assert.equal(app.includes("resumeSignalIntent,"), true);
  assert.equal(app.includes("entry.intentId ? `Intent"), true);
});
