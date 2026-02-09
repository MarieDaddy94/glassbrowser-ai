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

test('shadow controller registers scheduler-managed task', async () => {
  const shadowControllerModule = loadTsModule('controllers/shadowController.ts');
  const { createShadowController } = shadowControllerModule;
  assert.equal(typeof createShadowController, 'function');

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

  const controller = createShadowController({
    intervalMs: 5000,
    tick: async () => {}
  });
  controller.start({ scheduler });

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, 'controller.shadow.tick');
  assert.equal(tasks[0].groupId, 'shadow');
  assert.equal(tasks[0].intervalMs, 5000);
  assert.equal(tasks[0].visibilityMode, 'foreground');

  await tasks[0].run();
  const health = controller.getHealth();
  assert.equal(health.lastTickAtMs != null, true);
  assert.equal(health.running, true);

  controller.stop();
  assert.equal(disposed, 1);
});

test('app wires shadow evaluation through shadow controller, not ad-hoc timer loop', () => {
  const app = read('App.tsx');

  assert.equal(app.includes("type ShadowControllerModule = typeof import('./controllers/shadowController');"), true);
  assert.equal(app.includes('const loadShadowControllerModule = () => {'), true);
  assert.equal(app.includes('const controller = mod.createShadowController({'), true);
  assert.equal(app.includes('intervalMs: 5_000,'), true);
  assert.equal(app.includes('await evaluateShadowTrades();'), true);
  assert.equal(app.includes('await Promise.resolve(maybeExecutePendingLiveSignalsRef.current?.());'), true);
  assert.equal(app.includes('controller.start({ scheduler: runtimeScheduler });'), true);
  assert.equal(app.includes('timer = window.setTimeout(tick, 5_000);'), false);
});

test('health snapshot and monitor include shadow scheduler telemetry', () => {
  const app = read('App.tsx');
  const monitor = read('components/MonitorInterface.tsx');

  assert.equal(app.includes("const shadowSchedulerTask = (schedulerStats.tasks || []).find((entry) => entry.id === SHADOW_CONTROLLER_TASK_ID) || null;"), true);
  assert.equal(app.includes('shadowTaskId: SHADOW_CONTROLLER_TASK_ID,'), true);
  assert.equal(app.includes('runCount: shadowSchedulerTask.runCount,'), true);
  assert.equal(app.includes('errorCount: shadowSchedulerTask.errorCount,'), true);
  assert.equal(monitor.includes('Shadow Task'), true);
  assert.equal(monitor.includes('Shadow Runs'), true);
  assert.equal(monitor.includes('Shadow Last Duration'), true);
});
