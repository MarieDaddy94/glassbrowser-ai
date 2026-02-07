const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('targeted runtime panels do not use direct polling intervals', () => {
  const zeroIntervalFiles = [
    'App.tsx',
    'hooks/usePortfolio.ts',
    'components/TradeLockerInterface.tsx',
    'components/MonitorInterface.tsx',
    'components/SettingsModal.tsx',
    'components/NativeChartInterface.tsx'
  ];

  for (const relPath of zeroIntervalFiles) {
    const source = read(relPath);
    assert.equal(/setInterval\s*\(/.test(source), false, `${relPath} still uses setInterval`);
  }
});

test('Backtester keeps only replay-local interval loop', () => {
  const relPath = 'components/BacktesterInterface.tsx';
  const source = read(relPath);
  const matches = source.match(/setInterval\s*\(/g) || [];
  assert.equal(matches.length, 1, 'BacktesterInterface.tsx should only have one local replay timer');
  assert.equal(source.includes('if (!replayEnabled || !isPlaying) return;'), true);
});

