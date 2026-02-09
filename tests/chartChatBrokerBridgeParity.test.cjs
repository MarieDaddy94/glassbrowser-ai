const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), "utf8");

test("chart chat context flow uses broker bridge/coordinator paths", () => {
  const app = read("App.tsx");

  assert.equal(app.includes("const getChartContextPack = useCallback"), true);
  assert.equal(app.includes("const captureChartContextPack = useCallback"), true);
  assert.equal(app.includes("kind: 'chart_context_pack'"), true);
  assert.equal(app.includes("requestBrokerWithAudit('getHistorySeries'"), true);
  assert.equal(app.includes("requestBrokerWithAudit('getQuote'"), true);
});

test("chart chat uses the same runActionCatalog wiring as chat", () => {
  const app = read("App.tsx");
  const chartChannelIndex = app.indexOf('channel="chart"');
  const busIndex = app.indexOf("onRunActionCatalog={runActionCatalog}", chartChannelIndex);
  assert.equal(chartChannelIndex >= 0, true);
  assert.equal(busIndex > chartChannelIndex, true);
});
