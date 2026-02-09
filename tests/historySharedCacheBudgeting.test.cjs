const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), "utf8");

test("history shared cache registers cache budget and emits telemetry hooks", () => {
  const source = read("services/historySharedCache.ts");

  assert.equal(source.includes('const HISTORY_CACHE_BUDGET_NAME = "snapshot.historySharedCache";'), true);
  assert.equal(source.includes("cacheBudgetManager.register({"), true);
  assert.equal(source.includes("cacheBudgetManager.noteGet(HISTORY_CACHE_BUDGET_NAME"), true);
  assert.equal(source.includes("cacheBudgetManager.noteSet(HISTORY_CACHE_BUDGET_NAME"), true);
  assert.equal(source.includes("cacheBudgetManager.noteEviction(HISTORY_CACHE_BUDGET_NAME"), true);
  assert.equal(source.includes("cacheBudgetManager.setSize(HISTORY_CACHE_BUDGET_NAME"), true);
});
