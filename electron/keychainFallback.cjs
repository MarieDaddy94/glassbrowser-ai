function dedupeServices(primaryService, fallbackServices) {
  const out = [];
  const seen = new Set();
  const all = [primaryService, ...(Array.isArray(fallbackServices) ? fallbackServices : [])];
  for (const entry of all) {
    const service = String(entry || '').trim();
    if (!service || seen.has(service)) continue;
    seen.add(service);
    out.push(service);
  }
  return out;
}

async function readPasswordFromServices({ keytar, account, primaryService, fallbackServices }) {
  const services = dedupeServices(primaryService, fallbackServices);
  for (const service of services) {
    try {
      const value = await keytar.getPassword(service, account);
      if (!value) continue;
      return { value, service };
    } catch {
      // keep trying fallback services
    }
  }
  return { value: null, service: null };
}

async function promoteToPrimaryService({ keytar, account, value, sourceService, primaryService }) {
  if (!value || !sourceService || sourceService === primaryService) {
    return { promoted: false };
  }
  try {
    await keytar.setPassword(primaryService, account, value);
  } catch {
    return { promoted: false };
  }
  try {
    await keytar.deletePassword(sourceService, account);
  } catch {
    // best-effort cleanup only
  }
  return { promoted: true };
}

async function loadKeychainSecretsWithFallback(options = {}) {
  const keytar = options.keytar;
  if (!keytar || typeof keytar.getPassword !== 'function') {
    return { ok: false, error: 'Keychain unavailable.', values: {}, sources: {}, promoted: [] };
  }
  const primaryService = String(options.primaryService || '').trim();
  const fallbackServices = Array.isArray(options.fallbackServices) ? options.fallbackServices : [];
  const accounts = options.accounts && typeof options.accounts === 'object' ? options.accounts : {};
  const values = {};
  const sources = {};
  const promoted = [];
  const errors = [];

  const accountEntries = Object.entries(accounts);
  for (const [kind, account] of accountEntries) {
    const accountName = String(account || '').trim();
    if (!accountName) {
      values[kind] = null;
      sources[kind] = null;
      continue;
    }
    try {
      const read = await readPasswordFromServices({
        keytar,
        account: accountName,
        primaryService,
        fallbackServices
      });
      values[kind] = read.value || null;
      sources[kind] = read.service || null;
      if (read.value && read.service && read.service !== primaryService) {
        const promotion = await promoteToPrimaryService({
          keytar,
          account: accountName,
          value: read.value,
          sourceService: read.service,
          primaryService
        });
        if (promotion.promoted) promoted.push({ kind, from: read.service, to: primaryService });
      }
    } catch (err) {
      values[kind] = null;
      sources[kind] = null;
      errors.push({
        kind,
        error: err?.message || String(err)
      });
    }
  }

  return {
    ok: true,
    values,
    sources,
    promoted,
    errors
  };
}

module.exports = {
  loadKeychainSecretsWithFallback
};
