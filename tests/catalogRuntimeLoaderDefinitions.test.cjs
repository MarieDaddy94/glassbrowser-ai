const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'App.tsx');

test('App defines all catalog runtime lazy loaders used by executeCatalogAction', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.match(source, /const loadCatalogUiRuntimeModule = \(\) =>/);
  assert.match(source, /const loadCatalogPlaybookRuntimeModule = \(\) =>/);
  assert.match(source, /const loadCatalogChartRuntimeModule = \(\) =>/);
  assert.match(source, /const loadCatalogChatLiveRuntimeModule = \(\) =>/);
  assert.match(source, /const loadCatalogSettingsAutopilotRuntimeModule = \(\) =>/);
  assert.match(source, /const loadCatalogBrokerRuntimeModule = \(\) =>/);
  assert.match(source, /await loadCatalogUiRuntimeModule\(\)/);
  assert.match(source, /await loadCatalogPlaybookRuntimeModule\(\)/);
  assert.match(source, /await loadCatalogChartRuntimeModule\(\)/);
  assert.match(source, /await loadCatalogChatLiveRuntimeModule\(\)/);
  assert.match(source, /await loadCatalogSettingsAutopilotRuntimeModule\(\)/);
  assert.match(source, /await loadCatalogBrokerRuntimeModule\(\)/);
});
