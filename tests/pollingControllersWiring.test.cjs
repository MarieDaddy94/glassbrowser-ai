const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), "utf8");

const controllerFiles = [
  "controllers/outcomeFeedRefreshController.ts",
  "controllers/setupWatcherBackgroundController.ts",
  "controllers/tradingViewPriceController.ts",
  "controllers/mt5AccountSpecController.ts",
  "controllers/mt5TelemetryController.ts",
  "controllers/liveCaptureController.ts"
];

test("extracted polling controllers are scheduler-backed", () => {
  for (const file of controllerFiles) {
    const source = read(file);
    assert.equal(source.includes("registerTask({"), true, `${file} should register scheduler task`);
    assert.equal(source.includes("FeatureController"), true, `${file} should expose FeatureController`);
  }
});

test("App loads extracted polling controllers", () => {
  const app = read("App.tsx");
  assert.equal(app.includes("loadOutcomeFeedRefreshControllerModule"), true);
  assert.equal(app.includes("loadSetupWatcherBackgroundControllerModule"), true);
  assert.equal(app.includes("loadTradingViewPriceControllerModule"), true);
  assert.equal(app.includes("loadMt5AccountSpecControllerModule"), true);
  assert.equal(app.includes("loadMt5TelemetryControllerModule"), true);
  assert.equal(app.includes("loadLiveCaptureControllerModule"), true);
});
