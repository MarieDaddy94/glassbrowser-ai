import { _electron as electron, test, expect } from '@playwright/test';
import path from 'path';
import { execFileSync } from 'child_process';
import electronPath from 'electron';

const supportsPlaywrightElectronLaunch = (() => {
  try {
    const help = execFileSync(electronPath as unknown as string, ['--help'], { encoding: 'utf8' });
    return help.includes('remote-debugging-port');
  } catch {
    return false;
  }
})();

test('electron app boots and shows a window', async () => {
  test.skip(!supportsPlaywrightElectronLaunch, 'Electron binary does not expose remote-debugging-port; skipping Playwright Electron smoke in this environment.');
  const appPath = path.resolve(process.cwd(), '.');
  let electronApp: Awaited<ReturnType<typeof electron.launch>>;
  try {
    electronApp = await electron.launch({
      args: [appPath],
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: '1'
      }
    });
  } catch (error) {
    throw error;
  }

  try {
    const window = await electronApp.firstWindow();
    await expect(window).toBeTruthy();
    const title = await window.title();
    expect(typeof title).toBe('string');
  } finally {
    await electronApp.close();
  }
});
