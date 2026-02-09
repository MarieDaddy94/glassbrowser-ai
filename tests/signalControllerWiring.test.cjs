const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('Signal auto-refresh scheduling is owned by signal controller', () => {
  const app = read('App.tsx');
  const controller = read('controllers/signalController.ts');

  assert.equal(app.includes("const loadSignalControllerModule = () => {"), true);
  assert.equal(app.includes('mod.createSignalController({'), true);
  assert.equal(app.includes('taskId: SIGNAL_AUTO_REFRESH_TASK_ID'), true);
  assert.equal(app.includes("groupId: 'signal'"), true);
  assert.equal(app.includes('controller.start({ scheduler: runtimeScheduler });'), true);
  assert.equal(app.includes('const dispose = runtimeScheduler.registerTask({\n      id: SIGNAL_AUTO_REFRESH_TASK_ID,'), false);

  assert.equal(controller.includes('ctx.scheduler.registerTask({'), true);
  assert.equal(controller.includes('id: options.taskId || "controller.signal.tick"'), true);
});

test('Signal scans still tag broker calls with signal scan source metadata', () => {
  const app = read('App.tsx');
  assert.equal(app.includes("source: 'signal.scan'"), true);
});
