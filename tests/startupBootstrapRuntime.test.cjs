const test = require('node:test');
const assert = require('node:assert/strict');

const modPromise = import('../services/startupBootstrapRuntime.js');

test('startup bootstrap success uses local fallback key and saved tradelocker readiness', async () => {
  const { runStartupBootstrap, APP_BOOT_PERMISSION_SCOPES } = await modPromise;
  const setCalls = [];
  const api = {
    permissions: {
      set: (payload) => {
        setCalls.push(payload);
        return { ok: true, scopes: payload.scopes };
      },
      get: () => ({ ok: true, scopes: APP_BOOT_PERMISSION_SCOPES.slice() })
    },
    secrets: {
      getStatus: () => ({ ok: true, openai: { hasKey: false } })
    },
    broker: {
      getActive: () => ({ ok: true, activeId: 'tradelocker' })
    },
    tradeLedger: {
      stats: () => ({ ok: true, entriesCount: 1 })
    },
    tradelocker: {
      getSavedConfig: () => ({ ok: true, server: 'demo.tradelocker.com', email: 'u@example.com', accountId: 42 })
    }
  };

  const result = await runStartupBootstrap(api, {
    source: 'unit_success',
    readLocalOpenAiKey: () => 'sk-test'
  });

  assert.equal(setCalls.length, 1);
  assert.equal(result.openaiBlocked, false);
  assert.equal(result.openaiReady, true);
  assert.equal(result.openaiProbeSource, 'local_cache');
  assert.equal(result.tradeLockerProbeReady, true);
  assert.equal(result.tradeLockerProbeSource, 'saved_config_probe');
  assert.deepEqual(result.blockedScopes, []);
  assert.equal(result.permissionError, null);
});

test('startup bootstrap retries with accepted scopes when unknown scopes are returned', async () => {
  const { runStartupBootstrap } = await modPromise;
  const setCalls = [];
  const accepted = ['secrets', 'broker', 'tradeLedger', 'tradelocker'];
  const api = {
    permissions: {
      set: (payload) => {
        setCalls.push(payload);
        if (setCalls.length === 1) {
          return { ok: false, unknownScopes: ['diagnostics'], acceptedScopes: accepted };
        }
        return { ok: true, scopes: payload.scopes };
      },
      get: () => ({ ok: true, scopes: accepted })
    },
    secrets: {
      getStatus: () => ({ ok: true, openai: { hasKey: true } })
    },
    broker: {
      getActive: () => ({ ok: true })
    },
    tradeLedger: {
      stats: () => ({ ok: true })
    },
    tradelocker: {
      getSavedConfig: () => ({ ok: false, error: 'not configured' })
    }
  };

  const result = await runStartupBootstrap(api, { source: 'unit_unknown_scope' });

  assert.equal(setCalls.length, 2);
  assert.equal(setCalls[0].source, 'unit_unknown_scope');
  assert.equal(setCalls[1].source, 'unit_unknown_scope:filtered_retry');
  assert.deepEqual(setCalls[1].scopes, accepted);
  assert.deepEqual(result.activeScopes, accepted);
  assert.deepEqual(result.unknownScopes, []);
});

test('startup bootstrap pre-filters requested scopes using allowedScopes when available', async () => {
  const { runStartupBootstrap } = await modPromise;
  const setCalls = [];
  const allowed = ['secrets', 'broker', 'tradeLedger', 'tradelocker'];
  const api = {
    permissions: {
      allowedScopes: () => ({ ok: true, scopes: allowed }),
      set: (payload) => {
        setCalls.push(payload);
        return { ok: true, scopes: payload.scopes };
      },
      get: () => ({ ok: true, scopes: allowed })
    },
    secrets: {
      getStatus: () => ({ ok: true, openai: { hasKey: true } })
    },
    broker: {
      getActive: () => ({ ok: true })
    },
    tradeLedger: {
      stats: () => ({ ok: true })
    },
    tradelocker: {
      getSavedConfig: () => ({ ok: true, server: 'demo', email: 'u@example.com', accountId: 1 })
    }
  };

  const result = await runStartupBootstrap(api, { source: 'unit_allowed_scopes' });

  assert.equal(setCalls.length, 1);
  assert.deepEqual(setCalls[0].scopes.slice().sort(), allowed.slice().sort());
  assert.deepEqual(result.requestedScopes.slice().sort(), allowed.slice().sort());
  assert.ok(Array.isArray(result.skippedScopes));
  assert.ok(result.skippedScopes.length > 0);
});

test('startup bootstrap marks blocked scopes when probes return permission denied', async () => {
  const { runStartupBootstrap } = await modPromise;
  const api = {
    permissions: {
      set: () => ({ ok: true, scopes: ['secrets', 'broker', 'tradeLedger', 'tradelocker'] }),
      get: () => ({ ok: true, scopes: ['secrets', 'broker', 'tradeLedger', 'tradelocker'] })
    },
    secrets: {
      getStatus: () => ({ ok: false, code: 'permission_denied', error: 'Permission denied (secrets).' })
    },
    broker: {
      getActive: () => ({ ok: false, error: 'Permission denied (broker).' })
    },
    tradeLedger: {
      stats: () => ({ ok: false, message: 'permission denied (tradeLedger).' })
    },
    tradelocker: {
      getSavedConfig: () => ({ ok: false, code: 'PERMISSION_DENIED', error: 'permission denied (tradelocker).' })
    }
  };

  const result = await runStartupBootstrap(api, { source: 'unit_blocked' });

  assert.equal(result.openaiBlocked, true);
  assert.equal(result.openaiReady, false);
  assert.equal(result.openaiReadinessState, 'unknown');
  assert.equal(result.tradeLockerBlocked, true);
  assert.equal(result.tradeLockerProbeReady, false);
  assert.equal(result.tradeLockerReadinessState, 'unknown');
  assert.deepEqual(result.blockedScopes, ['secrets', 'broker', 'tradeLedger', 'tradelocker']);
  assert.match(String(result.diagnosticWarning || ''), /blocked scopes/i);
});
