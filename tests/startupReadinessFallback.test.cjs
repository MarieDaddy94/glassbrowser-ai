const test = require('node:test');
const assert = require('node:assert/strict');

const modPromise = import('../services/startupBootstrapRuntime.js');

test('startup bootstrap marks OpenAI as assumed_ready when probe is blocked but last known state exists', async () => {
  const { runStartupBootstrap } = await modPromise;
  const result = await runStartupBootstrap(
    {
      permissions: {
        set: () => ({ ok: true, scopes: ['secrets', 'broker', 'tradeLedger', 'tradelocker'] }),
        get: () => ({ ok: true, scopes: ['secrets', 'broker', 'tradeLedger', 'tradelocker'] })
      },
      secrets: {
        getStatus: () => ({ ok: false, code: 'permission_denied', error: 'Permission denied (secrets).' })
      },
      broker: {
        getActive: () => ({ ok: true, activeId: 'tradelocker' })
      },
      tradeLedger: {
        stats: () => ({ ok: true })
      },
      tradelocker: {
        getSavedConfig: () => ({ ok: true, server: 'demo', email: 'u@example.com', accountId: 42 })
      }
    },
    {
      source: 'unit_assumed_openai',
      lastKnownOpenAiReady: true
    }
  );

  assert.equal(result.openaiReadinessState, 'assumed_ready');
  assert.equal(result.openaiReady, true);
});

test('startup bootstrap marks TradeLocker as assumed_ready when probe is blocked but persisted config exists', async () => {
  const { runStartupBootstrap } = await modPromise;
  const result = await runStartupBootstrap(
    {
      permissions: {
        set: () => ({ ok: true, scopes: ['secrets', 'broker', 'tradeLedger', 'tradelocker'] }),
        get: () => ({ ok: true, scopes: ['secrets', 'broker', 'tradeLedger', 'tradelocker'] })
      },
      secrets: {
        getStatus: () => ({ ok: true, openai: { hasKey: true } })
      },
      broker: {
        getActive: () => ({ ok: false, error: 'broker unavailable' })
      },
      tradeLedger: {
        stats: () => ({ ok: true })
      },
      tradelocker: {
        getSavedConfig: () => ({ ok: false, code: 'permission_denied', error: 'Permission denied (tradelocker).' })
      }
    },
    {
      source: 'unit_assumed_tradelocker',
      tradeLockerSavedConfig: {
        server: 'demo.tradelocker.com',
        email: 'u@example.com',
        accountId: 99
      }
    }
  );

  assert.equal(result.tradeLockerReadinessState, 'assumed_ready');
  assert.equal(result.tradeLockerReady, true);
});

test('startup bootstrap keeps missing state when no fallback exists', async () => {
  const { runStartupBootstrap } = await modPromise;
  const result = await runStartupBootstrap(
    {
      permissions: {
        set: () => ({ ok: true, scopes: ['secrets', 'broker', 'tradeLedger', 'tradelocker'] }),
        get: () => ({ ok: true, scopes: ['secrets', 'broker', 'tradeLedger', 'tradelocker'] })
      },
      secrets: {
        getStatus: () => ({ ok: true, openai: { hasKey: false } })
      },
      broker: {
        getActive: () => ({ ok: false, error: 'offline' })
      },
      tradeLedger: {
        stats: () => ({ ok: true })
      },
      tradelocker: {
        getSavedConfig: () => ({ ok: true, server: '', email: '', accountId: null })
      }
    },
    {
      source: 'unit_missing_state',
      readLocalOpenAiKey: () => null
    }
  );

  assert.equal(result.openaiReadinessState, 'missing');
  assert.equal(result.tradeLockerReadinessState, 'missing');
  assert.equal(result.openaiReady, false);
  assert.equal(result.tradeLockerReady, false);
});

test('startup bootstrap marks unknown state when probes fail without permission-denied', async () => {
  const { runStartupBootstrap } = await modPromise;
  const result = await runStartupBootstrap(
    {
      permissions: {
        set: () => ({ ok: true, scopes: ['secrets', 'broker', 'tradeLedger', 'tradelocker'] }),
        get: () => ({ ok: true, scopes: ['secrets', 'broker', 'tradeLedger', 'tradelocker'] })
      },
      secrets: {
        getStatus: () => ({ ok: false, error: 'timeout' })
      },
      broker: {
        getActive: () => ({ ok: false, error: 'timeout' })
      },
      tradeLedger: {
        stats: () => ({ ok: true })
      },
      tradelocker: {
        getSavedConfig: () => ({ ok: false, error: 'timeout' })
      }
    },
    {
      source: 'unit_unknown_state'
    }
  );

  assert.equal(result.openaiReadinessState, 'unknown');
  assert.equal(result.tradeLockerReadinessState, 'unknown');
  assert.equal(result.openaiReady, false);
  assert.equal(result.tradeLockerReady, false);
  assert.equal(result.openaiProbeSource, 'probe_failed');
  assert.equal(result.tradeLockerProbeSource, 'probe_failed');
});

test('startup bootstrap reports bridge_failed when renderer bridge is unavailable', async () => {
  const { runStartupBootstrap } = await modPromise;
  const result = await runStartupBootstrap(
    null,
    {
      source: 'unit_bridge_failed',
      lastKnownOpenAiReady: true,
      tradeLockerSavedConfig: {
        server: 'demo.tradelocker.com',
        email: 'u@example.com',
        accountId: 7
      }
    }
  );

  assert.equal(result.bridgeState, 'failed');
  assert.equal(result.probeSkippedDueToBridge, true);
  assert.equal(result.openaiReadinessState, 'assumed_ready');
  assert.equal(result.tradeLockerReadinessState, 'assumed_ready');
  assert.equal(result.openaiProbeSource, 'bridge_failed');
  assert.equal(result.tradeLockerProbeSource, 'bridge_failed');
  assert.equal(result.openaiBlocked, false);
  assert.equal(result.tradeLockerBlocked, false);
});
