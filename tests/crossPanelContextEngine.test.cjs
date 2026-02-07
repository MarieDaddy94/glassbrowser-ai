const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('cross panel context engine supports debounced publish/subscribe and clear', () => {
  const source = read('services/crossPanelContextEngine.ts');
  assert.equal(source.includes('class CrossPanelContextEngine'), true);
  assert.equal(source.includes('publish(input: Partial<CrossPanelContext>, options?: PublishOptions)'), true);
  assert.equal(source.includes('this.timer = setTimeout(() => {'), true);
  assert.equal(source.includes('subscribe(listener: ContextListener)'), true);
  assert.equal(source.includes('clear(originPanel?: string)'), true);
});

test('app wires cross panel context producers and consumers', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('crossPanelContextEngine.publish({'), true);
  assert.equal(app.includes('crossPanelContext={crossPanelContext}'), true);
  assert.equal(app.includes('const [crossPanelContext, setCrossPanelContext] = useState<CrossPanelContext | null>'), true);
  assert.equal(app.includes('crossPanelContextEngine.subscribe((next) => {'), true);
});
