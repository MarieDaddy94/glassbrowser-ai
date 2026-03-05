const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const indexPath = path.join(process.cwd(), 'index.tsx');

test('index root render is wrapped with ErrorBoundary to avoid silent blank screen on render crashes', () => {
  const source = fs.readFileSync(indexPath, 'utf8');
  assert.equal(source.includes("import ErrorBoundary from './components/ErrorBoundary';"), true);
  assert.match(source, /<ErrorBoundary>\s*<SystemBoot \/>\s*<\/ErrorBoundary>/);
});
