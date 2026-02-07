const test = require('node:test');
const assert = require('node:assert/strict');

const { loadKeychainSecretsWithFallback } = require('../electron/keychainFallback.cjs');

function createFakeKeytar(seed = {}) {
  const store = new Map();
  for (const [service, accounts] of Object.entries(seed)) {
    for (const [account, value] of Object.entries(accounts || {})) {
      store.set(`${service}:${account}`, value);
    }
  }
  return {
    async getPassword(service, account) {
      return store.get(`${service}:${account}`) || null;
    },
    async setPassword(service, account, value) {
      store.set(`${service}:${account}`, value);
      return true;
    },
    async deletePassword(service, account) {
      store.delete(`${service}:${account}`);
      return true;
    }
  };
}

test('loads secrets from canonical keychain service when available', async () => {
  const keytar = createFakeKeytar({
    'GlassBrowser AI': {
      openai_api_key: 'sk-canonical',
      gemini_api_key: 'gm-canonical'
    }
  });
  const res = await loadKeychainSecretsWithFallback({
    keytar,
    primaryService: 'GlassBrowser AI',
    fallbackServices: ['glassbrowser-ai', 'GlassBrowser AI Beta'],
    accounts: { openai: 'openai_api_key', gemini: 'gemini_api_key' }
  });

  assert.equal(res.ok, true);
  assert.equal(res.values.openai, 'sk-canonical');
  assert.equal(res.values.gemini, 'gm-canonical');
  assert.equal(Array.isArray(res.promoted), true);
  assert.equal(res.promoted.length, 0);
});

test('loads from fallback service and promotes into canonical service', async () => {
  const keytar = createFakeKeytar({
    'GlassBrowser AI Beta': {
      openai_api_key: 'sk-fallback'
    }
  });
  const res = await loadKeychainSecretsWithFallback({
    keytar,
    primaryService: 'GlassBrowser AI',
    fallbackServices: ['GlassBrowser AI Beta'],
    accounts: { openai: 'openai_api_key', gemini: 'gemini_api_key' }
  });

  assert.equal(res.ok, true);
  assert.equal(res.values.openai, 'sk-fallback');
  assert.equal(res.sources.openai, 'GlassBrowser AI Beta');
  assert.equal(res.promoted.length, 1);
  assert.equal(res.promoted[0].to, 'GlassBrowser AI');
  const promotedValue = await keytar.getPassword('GlassBrowser AI', 'openai_api_key');
  assert.equal(promotedValue, 'sk-fallback');
});
