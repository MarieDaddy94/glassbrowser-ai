const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('app passes native chart visibility and keeps native chart layout scroll-safe', () => {
  const app = read('App.tsx');
  assert.equal(app.includes("isPanelVisible={mode === 'nativechart'}"), true);
  assert.equal(app.includes("mode === 'nativechart' ? 'flex flex-1 flex-col min-h-0 overflow-y-auto'"), true);
});

test('native chart refresh loop is gated to panel visibility and persists frame selection', () => {
  const source = read('components/NativeChartInterface.tsx');
  assert.equal(source.includes("const NATIVE_CHART_UI_STORAGE_KEY = 'glass_native_chart_ui_v1';"), true);
  assert.equal(source.includes("const [activeFrameIds, setActiveFrameIds] = useState<string[]>(() => loadNativeChartUiState().activeFrameIds);"), true);
  assert.equal(source.includes('if (!isPanelVisible) return;'), true);
  assert.equal(source.includes('min-h-0 overflow-hidden text-gray-200'), true);
  assert.equal(source.includes('min-h-0 overflow-y-auto custom-scrollbar'), true);
});
