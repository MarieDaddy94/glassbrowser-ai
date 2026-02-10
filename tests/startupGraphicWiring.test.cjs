const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const bootPath = path.join(process.cwd(), 'components', 'SystemBoot.tsx');

test('launcher uses explicit local startup wallpaper with fallback rendering', () => {
  const source = fs.readFileSync(bootPath, 'utf8');
  assert.equal(source.includes("const STARTUP_WALLPAPER_URL = new URL('../assets/startup-wallpaper.svg', import.meta.url).href;"), true);
  assert.equal(source.includes('const [wallpaperAvailable, setWallpaperAvailable] = useState(true);'), true);
  assert.equal(source.includes('image.onerror = () => {'), true);
  assert.equal(source.includes('if (!cancelled) setWallpaperAvailable(false);'), true);
  assert.equal(source.includes('url("${STARTUP_WALLPAPER_URL}")'), true);
  assert.equal(source.includes('radial-gradient(circle at 20% 20%'), true);
});
