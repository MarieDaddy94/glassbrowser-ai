const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

test('home url setting is wired through SettingsModal storage load/save', () => {
  const source = fs.readFileSync(path.join(ROOT, 'components', 'SettingsModal.tsx'), 'utf8');
  assert.match(source, /browserHomeUrl:\s*"glass_browser_home_url_v1"/);
  assert.match(source, /setBrowserHomeUrl\(localStorage\.getItem\(STORAGE\.browserHomeUrl\)\s*\|\|\s*""\)/);
  assert.match(source, /persist\(STORAGE\.browserHomeUrl,\s*browserHomeUrl\)/);
});

test('tabs hook uses browser home url for startup and new tab defaults', () => {
  const source = fs.readFileSync(path.join(ROOT, 'hooks', 'useTabs.ts'), 'utf8');
  assert.match(source, /browserHomeUrl:\s*'glass_browser_home_url_v1'/);
  assert.match(source, /DEFAULT_BROWSER_HOME_URL\s*=\s*'https:\/\/tradingview\.com'/);
  assert.match(source, /const resolveHomeUrl = useCallback/);
  assert.match(source, /url:\s*resolveHomeUrl\(\)/);
  assert.match(source, /const addTab = useCallback\(\(rawUrl: string = resolveHomeUrl\(\)\)/);
});
