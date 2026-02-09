const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

const loadTsModule = (relPath) => {
  const source = read(relPath);
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText;
  const mod = { exports: {} };
  const sandbox = {
    module: mod,
    exports: mod.exports,
    require: () => ({}),
    console,
    Date,
    Math
  };
  vm.runInNewContext(transpiled, sandbox, { filename: `${relPath}.compiled.cjs` });
  return mod.exports;
};

test('calendar controller schedules foreground/background tasks with slower background cadence', async () => {
  const calendarControllerModule = loadTsModule('controllers/calendarController.ts');
  const { createCalendarController } = calendarControllerModule;
  assert.equal(typeof createCalendarController, 'function');

  const tasks = [];
  let disposed = 0;
  const scheduler = {
    registerTask(task) {
      tasks.push(task);
      return () => {
        disposed += 1;
      };
    }
  };

  const controller = createCalendarController({
    intervalMs: 30_000,
    backgroundIntervalMs: 90_000,
    tick: async () => {}
  });

  controller.start({ scheduler });
  assert.equal(tasks.length, 2, 'expected foreground + background calendar tasks');

  const foreground = tasks.find((task) => task.id === 'controller.calendar.tick.foreground');
  const background = tasks.find((task) => task.id === 'controller.calendar.tick.background');

  assert.ok(foreground, 'missing foreground calendar task');
  assert.ok(background, 'missing background calendar task');
  assert.equal(foreground.visibilityMode, 'foreground');
  assert.equal(background.visibilityMode, 'background');
  assert.equal(background.intervalMs > foreground.intervalMs, true, 'background cadence should be slower');

  await foreground.run();
  const health = controller.getHealth();
  assert.equal(health.lastTickAtMs != null, true);
  assert.equal(health.detail.lastTickMode, 'foreground');

  controller.stop();
  assert.equal(disposed, 2);
});

test('app wires calendar sync polling through calendar controller', () => {
  const app = read('App.tsx');
  assert.equal(app.includes("type CalendarControllerModule = typeof import('./controllers/calendarController');"), true);
  assert.equal(app.includes('const loadCalendarControllerModule = () => {'), true);
  assert.equal(app.includes('const controller = mod.createCalendarController({'), true);
  assert.equal(app.includes('backgroundIntervalMs: 90 * 60 * 1000,'), true);
  assert.equal(app.includes("await syncEconomicCalendar({ force: false, reason: 'poll' });"), true);
  assert.equal(app.includes('controller.start({ scheduler: runtimeScheduler });'), true);
  assert.equal(app.includes('stop = mod.startIntervalControllerSafe({\n        intervalMs: 30 * 60 * 1000,'), false);
});

test('calendar controller source declares visibility-aware calendar task ids', () => {
  const source = read('controllers/calendarController.ts');
  assert.equal(source.includes('id: "controller.calendar.tick.foreground"'), true);
  assert.equal(source.includes('id: "controller.calendar.tick.background"'), true);
  assert.equal(source.includes('visibilityMode: "foreground"'), true);
  assert.equal(source.includes('visibilityMode: "background"'), true);
});

