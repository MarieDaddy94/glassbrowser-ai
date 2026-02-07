const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const LEDGER_FILE = 'trade-ledger.json';
const MAX_AGENT_MEMORIES = 5000;
const MAX_OPTIMIZER_CACHE = 20000;
const DEFAULT_STATE = Object.freeze({
  version: 1,
  entries: [],
  memories: [],
  agentMemories: [],
  optimizerEvalCache: {}
});

function nowMs() {
  return Date.now();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function redactErrorMessage(message) {
  if (typeof message !== 'string') return 'Unknown error';
  return message.replace(/Bearer\s+[A-Za-z0-9\-_.]+/g, 'Bearer [redacted]');
}

function getLedgerPath() {
  return path.join(app.getPath('userData'), LEDGER_FILE);
}

function normalizeEntry(input) {
  const e = input && typeof input === 'object' ? { ...input } : {};
  if (e.id != null) e.id = String(e.id);
  if (e.dedupeKey != null) e.dedupeKey = String(e.dedupeKey);
  if (e.status != null) e.status = String(e.status);
  if (e.broker != null) e.broker = String(e.broker);
  if (e.source != null) e.source = String(e.source);
  return e;
}

function normalizeTags(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const tags = [];
  for (const raw of input) {
    const tag = String(raw || '').trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

function normalizeScopeFilters(input) {
  if (input == null) return [];
  const list = Array.isArray(input) ? input : [input];
  const seen = new Set();
  const scopes = [];
  for (const raw of list) {
    const value = String(raw || '').trim().toLowerCase();
    if (!value || value === 'all' || value === 'any') continue;
    if (seen.has(value)) continue;
    seen.add(value);
    scopes.push(value);
  }
  return scopes;
}

function resolveEntryScope(entry) {
  const rawScope = entry && entry.scope != null ? String(entry.scope || '').trim() : '';
  if (rawScope) return rawScope.toLowerCase();
  const agentId = entry && entry.agentId != null ? String(entry.agentId || '').trim() : '';
  return agentId ? 'agent' : 'global';
}

class TradeLedger {
  constructor({ maxEntries = 2000 } = {}) {
    this.maxEntries = Number.isFinite(Number(maxEntries)) ? Math.max(100, Number(maxEntries)) : 2000;
    this.filePath = getLedgerPath();
    this.state = { ...DEFAULT_STATE, entries: [] };
    this._lock = Promise.resolve();
    this._persistTimer = null;
    this._persistInFlight = null;
    this._stateVersion = 0;
    this._persistedVersion = 0;
    this._persistToken = 0;
    this._lastDirtyAtMs = 0;
    this._lastPersistAtMs = 0;
    this._lastPersistError = null;
    this._persistDelayMs = 250;
    this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const text = fs.readFileSync(this.filePath, 'utf8');
      const parsed = safeJsonParse(text);
      if (!parsed || typeof parsed !== 'object') return;
      const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      const memories = Array.isArray(parsed.memories) ? parsed.memories : [];
      const agentMemories = Array.isArray(parsed.agentMemories) ? parsed.agentMemories : [];
      const optimizerEvalCache =
        parsed.optimizerEvalCache && typeof parsed.optimizerEvalCache === 'object'
          ? parsed.optimizerEvalCache
          : {};
      this.state = {
        version: typeof parsed.version === 'number' ? parsed.version : 1,
        entries,
        memories,
        agentMemories,
        optimizerEvalCache
      };
    } catch {
      // ignore
    }
  }

  _serializeState() {
    const pretty = app && app.isPackaged ? 0 : 2;
    return JSON.stringify(this.state, null, pretty);
  }

  async _persistNow(token = this._persistToken) {
    const version = this._stateVersion;
    const payload = this._serializeState();
    const tempPath = `${this.filePath}.tmp_${token}`;
    try {
      await fs.promises.writeFile(tempPath, payload, 'utf8');
      // If a newer persist request came in while writing, skip committing this older snapshot.
      if (token !== this._persistToken) {
        try { await fs.promises.rm(tempPath, { force: true }); } catch {}
        return { ok: true, skipped: true, path: this.filePath };
      }

      try {
        await fs.promises.rename(tempPath, this.filePath);
      } catch (e) {
        // Best-effort fallback if rename can't replace existing file on this platform.
        try { await fs.promises.rm(this.filePath, { force: true }); } catch {}
        await fs.promises.rename(tempPath, this.filePath);
      }

      this._persistedVersion = Math.max(this._persistedVersion || 0, version);
      this._lastPersistAtMs = nowMs();
      this._lastPersistError = null;
      return { ok: true, path: this.filePath };
    } catch (e) {
      const err = redactErrorMessage(e?.message || String(e));
      this._lastPersistError = err;
      return { ok: false, error: err, path: this.filePath };
    }
  }

  _schedulePersist() {
    if (this._persistTimer) return;
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      if (this._persistInFlight) return;
      const token = this._persistToken;
      this._persistInFlight = (async () => {
        try {
          await this._persistNow(token);
        } finally {
          this._persistInFlight = null;
          if (this._persistedVersion !== this._stateVersion) {
            this._schedulePersist();
          }
        }
      })();
    }, this._persistDelayMs);
  }

  _markDirty() {
    this._stateVersion += 1;
    this._persistToken += 1;
    this._lastDirtyAtMs = nowMs();
    this._schedulePersist();
  }

  _trimAgentMemories() {
    const list = Array.isArray(this.state.agentMemories) ? this.state.agentMemories : [];
    if (list.length <= MAX_AGENT_MEMORIES) return;
    list.sort((a, b) => (Number(a?.updatedAtMs) || 0) - (Number(b?.updatedAtMs) || 0));
    const trimmed = list.slice(list.length - MAX_AGENT_MEMORIES);
    this.state.agentMemories = trimmed;
  }

  _pruneOptimizerEvalCache(now = nowMs()) {
    const cache = this.state.optimizerEvalCache;
    if (!cache || typeof cache !== 'object') {
      this.state.optimizerEvalCache = {};
      return;
    }
    for (const key of Object.keys(cache)) {
      const entry = cache[key];
      if (entry && entry.expiresAtMs && Number(entry.expiresAtMs) <= now) {
        delete cache[key];
      }
    }
  }

  _trimOptimizerEvalCache() {
    const cache = this.state.optimizerEvalCache;
    if (!cache || typeof cache !== 'object') {
      this.state.optimizerEvalCache = {};
      return;
    }
    const keys = Object.keys(cache);
    if (keys.length <= MAX_OPTIMIZER_CACHE) return;
    keys.sort((a, b) => (Number(cache[a]?.updatedAtMs) || 0) - (Number(cache[b]?.updatedAtMs) || 0));
    const removeCount = keys.length - MAX_OPTIMIZER_CACHE;
    for (let i = 0; i < removeCount; i += 1) {
      delete cache[keys[i]];
    }
  }

  flushSync() {
    try {
      if (this._persistTimer) {
        clearTimeout(this._persistTimer);
        this._persistTimer = null;
      }
    } catch {
      // ignore
    }

    if (this._persistedVersion === this._stateVersion) return { ok: true, path: this.filePath, upToDate: true };

    // Ensure any in-flight older persist won't overwrite this flush.
    this._persistToken += 1;
    const token = this._persistToken;

    try {
      const payload = this._serializeState();
      const tempPath = `${this.filePath}.tmp_${token}`;
      fs.writeFileSync(tempPath, payload, 'utf8');
      try {
        fs.renameSync(tempPath, this.filePath);
      } catch {
        try { fs.rmSync(this.filePath, { force: true }); } catch {}
        fs.renameSync(tempPath, this.filePath);
      }

      this._persistedVersion = Math.max(this._persistedVersion || 0, this._stateVersion);
      this._lastPersistAtMs = nowMs();
      this._lastPersistError = null;
      return { ok: true, path: this.filePath, flushed: true };
    } catch (e) {
      const err = redactErrorMessage(e?.message || String(e));
      this._lastPersistError = err;
      return { ok: false, error: err, path: this.filePath };
    }
  }

  async flush() {
    try {
      if (this._persistTimer) {
        clearTimeout(this._persistTimer);
        this._persistTimer = null;
      }
    } catch {
      // ignore
    }

    try {
      if (this._persistInFlight) await this._persistInFlight;
    } catch {
      // ignore
    }

    if (this._persistedVersion === this._stateVersion) return { ok: true, path: this.filePath, upToDate: true };
    return this._persistNow();
  }

  stats() {
    const pendingWrites = Math.max(0, Number(this._stateVersion || 0) - Number(this._persistedVersion || 0));
    const entriesCount = Array.isArray(this.state.entries) ? this.state.entries.length : 0;
    const memoriesCount = Array.isArray(this.state.memories) ? this.state.memories.length : 0;
    const agentMemoryCount = Array.isArray(this.state.agentMemories) ? this.state.agentMemories.length : 0;
    const optimizerCacheCount =
      this.state.optimizerEvalCache && typeof this.state.optimizerEvalCache === 'object'
        ? Object.keys(this.state.optimizerEvalCache).length
        : 0;
    return {
      ok: true,
      path: this.filePath,
      stateVersion: this._stateVersion,
      persistedVersion: this._persistedVersion,
      pendingWrites,
      entriesCount,
      memoriesCount,
      agentMemoryCount,
      optimizerCacheCount,
      persistDelayMs: this._persistDelayMs,
      inFlight: !!this._persistInFlight,
      lastDirtyAtMs: this._lastDirtyAtMs || null,
      lastPersistAtMs: this._lastPersistAtMs || null,
      lastError: this._lastPersistError || null
    };
  }

  _withLock(fn) {
    const run = async () => fn();
    const next = this._lock.then(run, run);
    this._lock = next.then(
      () => {},
      () => {}
    );
    return next;
  }

  async append(entry) {
    return this._withLock(async () => {
      const normalized = normalizeEntry(entry);
      const id = normalized.id || `led_${nowMs()}_${Math.random().toString(16).slice(2)}`;
      const createdAtMs = Number.isFinite(Number(normalized.createdAtMs))
        ? Math.floor(Number(normalized.createdAtMs))
        : nowMs();
      const next = {
        ...normalized,
        id,
        createdAtMs,
        updatedAtMs: nowMs()
      };

      this.state.entries.push(next);
      if (this.state.entries.length > this.maxEntries) {
        this.state.entries = this.state.entries.slice(this.state.entries.length - this.maxEntries);
      }

      this._markDirty();
      return { ok: true, entry: next, path: this.filePath };
    });
  }

  async reserve({ dedupeKey, windowMs = 60_000, entry } = {}) {
    return this._withLock(async () => {
      const key = String(dedupeKey || '').trim();
      if (!key) return { ok: false, error: 'dedupeKey is required.' };

      const window = Number.isFinite(Number(windowMs)) ? Math.max(0, Math.floor(Number(windowMs))) : 60_000;
      const now = nowMs();
      const entries = this.state.entries || [];

      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (!e || String(e.dedupeKey || '') !== key) continue;
        const createdAt = Number(e.createdAtMs) || 0;
        if (window > 0 && createdAt > 0 && now - createdAt > window) continue;

        const status = String(e.status || '').toUpperCase();
        if (status === 'REJECTED' || status === 'CANCELLED' || status === 'CANCELED' || status === 'CLOSED') continue;
        return { ok: true, reserved: false, entry: e, path: this.filePath };
      }

      const normalized = normalizeEntry(entry);
      const id = normalized.id || `led_${nowMs()}_${Math.random().toString(16).slice(2)}`;
      const createdAtMs = Number.isFinite(Number(normalized.createdAtMs))
        ? Math.floor(Number(normalized.createdAtMs))
        : nowMs();
      const next = {
        ...normalized,
        id,
        dedupeKey: key,
        createdAtMs,
        updatedAtMs: nowMs()
      };

      this.state.entries.push(next);
      if (this.state.entries.length > this.maxEntries) {
        this.state.entries = this.state.entries.slice(this.state.entries.length - this.maxEntries);
      }

      this._markDirty();
      return { ok: true, reserved: true, entry: next, path: this.filePath };
    });
  }

  async update({ id, patch } = {}) {
    return this._withLock(async () => {
      const key = String(id || '').trim();
      if (!key) return { ok: false, error: 'id is required.' };

      const idx = this.state.entries.findIndex((e) => String(e?.id || '') === key);
      if (idx < 0) return { ok: false, error: 'Ledger entry not found.' };

      const safePatch = patch && typeof patch === 'object' ? { ...patch } : {};
      delete safePatch.id;
      delete safePatch.createdAtMs;

      const prev = this.state.entries[idx] || {};
      this.state.entries[idx] = {
        ...prev,
        ...normalizeEntry(safePatch),
        updatedAtMs: nowMs()
      };

      this._markDirty();
      return { ok: true, entry: this.state.entries[idx], path: this.filePath };
    });
  }

  async list({ limit = 200 } = {}) {
    const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(5000, Math.floor(Number(limit)))) : 200;
    const sorted = [...(this.state.entries || [])].sort((a, b) => (Number(b?.createdAtMs) || 0) - (Number(a?.createdAtMs) || 0));
    return { ok: true, entries: sorted.slice(0, lim), path: this.filePath };
  }

  async listEvents({
    limit = 200,
    kind = 'truth_event',
    eventType,
    symbol,
    runId,
    actionId,
    decisionId,
    executionId,
    brokerResponseId,
    status,
    source
  } = {}) {
    const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(5000, Math.floor(Number(limit)))) : 200;
    const fetchLimit = Math.min(5000, Math.max(lim, lim * 5));
    const kindKey = kind != null ? String(kind).trim().toLowerCase() : '';
    const eventTypeKey = eventType != null ? String(eventType).trim().toLowerCase() : '';
    const symbolKey = symbol != null ? String(symbol).trim().toLowerCase() : '';
    const runKey = runId != null ? String(runId).trim().toLowerCase() : '';
    const actionKey = actionId != null ? String(actionId).trim().toLowerCase() : '';
    const decisionKey = decisionId != null ? String(decisionId).trim().toLowerCase() : '';
    const executionKey = executionId != null ? String(executionId).trim().toLowerCase() : '';
    const responseKey = brokerResponseId != null ? String(brokerResponseId).trim().toLowerCase() : '';
    const statusKey = status != null ? String(status).trim().toLowerCase() : '';
    const sourceKey = source != null ? String(source).trim().toLowerCase() : '';

    const res = await this.list({ limit: fetchLimit });
    if (!res?.ok || !Array.isArray(res.entries)) return res;

    const filtered = res.entries.filter((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      if (kindKey && String(entry.kind || '').trim().toLowerCase() !== kindKey) return false;
      if (eventTypeKey && String(entry.eventType || '').trim().toLowerCase() !== eventTypeKey) return false;
      if (symbolKey) {
        const entrySymbol = String(entry.symbol || entry.payload?.symbol || '').trim().toLowerCase();
        if (entrySymbol !== symbolKey) return false;
      }
      if (runKey) {
        const entryRun = String(entry.runId || entry.payload?.runId || '').trim().toLowerCase();
        if (entryRun !== runKey) return false;
      }
      if (actionKey) {
        const entryAction = String(entry.actionId || entry.payload?.actionId || '').trim().toLowerCase();
        if (entryAction !== actionKey) return false;
      }
      if (decisionKey) {
        const entryDecision = String(entry.decisionId || entry.payload?.decisionId || '').trim().toLowerCase();
        if (entryDecision !== decisionKey) return false;
      }
      if (executionKey) {
        const entryExecution = String(entry.executionId || entry.payload?.executionId || '').trim().toLowerCase();
        if (entryExecution !== executionKey) return false;
      }
      if (responseKey) {
        const entryResponse = String(entry.brokerResponseId || entry.payload?.brokerResponseId || '').trim().toLowerCase();
        if (entryResponse !== responseKey) return false;
      }
      if (statusKey && String(entry.status || '').trim().toLowerCase() !== statusKey) return false;
      if (sourceKey && String(entry.source || '').trim().toLowerCase() !== sourceKey) return false;
      return true;
    });

    return { ok: true, entries: filtered.slice(0, lim), path: this.filePath };
  }

  async addMemory(memory) {
    return this._withLock(async () => {
      const m = memory && typeof memory === 'object' ? { ...memory } : {};
      const id = m.id || `mem_${nowMs()}_${Math.random().toString(16).slice(2)}`;
      const createdAtMs = Number.isFinite(Number(m.createdAtMs)) ? Math.floor(Number(m.createdAtMs)) : nowMs();
      const type = String(m.type || '').toUpperCase() === 'LOSS' ? 'LOSS' : 'WIN';
      const text = String(m.text || '').trim();
      if (!text) return { ok: false, error: 'Memory text is required.' };

      const next = {
        ...m,
        id: String(id),
        type,
        text,
        createdAtMs,
        updatedAtMs: nowMs()
      };

      const list = Array.isArray(this.state.memories) ? this.state.memories : [];
      list.push(next);
      // keep most recent 2000 memories
      if (list.length > this.maxEntries) {
        this.state.memories = list.slice(list.length - this.maxEntries);
      } else {
        this.state.memories = list;
      }

      this._markDirty();
      return { ok: true, memory: next, path: this.filePath };
    });
  }

  async updateMemory({ id, patch } = {}) {
    return this._withLock(async () => {
      const key = String(id || '').trim();
      if (!key) return { ok: false, error: 'id is required.' };

      const list = Array.isArray(this.state.memories) ? this.state.memories : [];
      const idx = list.findIndex((m) => String(m?.id || '') === key);
      if (idx < 0) return { ok: false, error: 'Memory not found.' };

      const safePatch = patch && typeof patch === 'object' ? { ...patch } : {};
      delete safePatch.id;
      delete safePatch.createdAtMs;

      const prev = list[idx] || {};
      const next = { ...prev, ...safePatch, id: String(prev.id || key), updatedAtMs: nowMs() };

      if (safePatch.text != null) next.text = String(safePatch.text || '').trim();
      if (safePatch.type != null) next.type = String(safePatch.type || '').toUpperCase() === 'LOSS' ? 'LOSS' : 'WIN';
      if (safePatch.meta != null) {
        next.meta = safePatch.meta && typeof safePatch.meta === 'object' ? safePatch.meta : null;
      }

      const text = String(next.text || '').trim();
      if (!text) return { ok: false, error: 'Memory text is required.' };
      next.text = text;

      list[idx] = next;
      this.state.memories = list;

      this._markDirty();
      return { ok: true, memory: next, path: this.filePath };
    });
  }

  async deleteMemory({ id } = {}) {
    return this._withLock(async () => {
      const key = String(id || '').trim();
      if (!key) return { ok: false, error: 'id is required.' };

      const list = Array.isArray(this.state.memories) ? this.state.memories : [];
      const idx = list.findIndex((m) => String(m?.id || '') === key);
      if (idx < 0) return { ok: false, error: 'Memory not found.' };

      const removed = list.splice(idx, 1)[0] || null;
      this.state.memories = list;

      this._markDirty();
      return { ok: true, memory: removed, path: this.filePath };
    });
  }

  async clearMemories() {
    return this._withLock(async () => {
      this.state.memories = [];
      this._markDirty();
      return { ok: true, path: this.filePath };
    });
  }

  async listMemories({ limit = 200 } = {}) {
    const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(5000, Math.floor(Number(limit)))) : 200;
    const sorted = [...(this.state.memories || [])].sort((a, b) => (Number(b?.createdAtMs) || 0) - (Number(a?.createdAtMs) || 0));
    return { ok: true, memories: sorted.slice(0, lim), path: this.filePath };
  }

  async upsertAgentMemory(memory) {
    return this._withLock(async () => {
      const input = memory && typeof memory === 'object' ? { ...memory } : {};
      const key = input.key != null ? String(input.key).trim() : '';
      const id = input.id != null ? String(input.id).trim() : '';
      if (!key && !id) return { ok: false, error: 'Agent memory key or id is required.' };

      const list = Array.isArray(this.state.agentMemories) ? this.state.agentMemories : [];
      let idx = -1;
      if (key) idx = list.findIndex((entry) => String(entry?.key || '') === key);
      if (idx < 0 && id) idx = list.findIndex((entry) => String(entry?.id || '') === id);

      const prev = idx >= 0 ? list[idx] || {} : {};
      const now = nowMs();
      const next = { ...prev };

      if (key) next.key = key;
      if (id) next.id = id;
      if (input.familyKey !== undefined) next.familyKey = input.familyKey ? String(input.familyKey).trim() : null;
      if (input.agentId !== undefined) next.agentId = input.agentId ? String(input.agentId).trim() : null;
      if (input.scope !== undefined) next.scope = input.scope ? String(input.scope).trim() : null;
      if (input.category !== undefined) next.category = input.category ? String(input.category).trim() : null;
      if (input.subcategory !== undefined) next.subcategory = input.subcategory ? String(input.subcategory).trim() : null;
      if (input.kind !== undefined) next.kind = input.kind ? String(input.kind).trim() : null;
      if (input.symbol !== undefined) next.symbol = input.symbol ? String(input.symbol).trim() : null;
      if (input.timeframe !== undefined) next.timeframe = input.timeframe ? String(input.timeframe).trim() : null;
      if (input.summary !== undefined) next.summary = input.summary != null ? String(input.summary).trim() : null;
      if (input.payload !== undefined) next.payload = input.payload != null ? input.payload : null;
      if (input.source !== undefined) next.source = input.source ? String(input.source).trim() : null;
      if (input.tags !== undefined) next.tags = normalizeTags(input.tags);

      next.id = String(next.id || prev.id || `agent_${now}_${Math.random().toString(16).slice(2)}`);
      next.key = String(next.key || next.id);
      next.createdAtMs = Number.isFinite(Number(prev.createdAtMs))
        ? Number(prev.createdAtMs)
        : (Number.isFinite(Number(input.createdAtMs)) ? Number(input.createdAtMs) : now);
      next.updatedAtMs = now;

      if (input.lastAccessedAtMs != null && Number.isFinite(Number(input.lastAccessedAtMs))) {
        next.lastAccessedAtMs = Number(input.lastAccessedAtMs);
      } else if (prev.lastAccessedAtMs != null) {
        next.lastAccessedAtMs = prev.lastAccessedAtMs;
      } else {
        next.lastAccessedAtMs = null;
      }

      if (!Array.isArray(next.tags)) next.tags = [];
      if (!next.scope) next.scope = resolveEntryScope(next);

      if (idx >= 0) {
        list[idx] = next;
      } else {
        list.push(next);
      }
      this.state.agentMemories = list;
      this._trimAgentMemories();
      this._markDirty();
      return { ok: true, memory: next, path: this.filePath };
    });
  }

  async getAgentMemory({ key, id, touch } = {}) {
    return this._withLock(async () => {
      const keyValue = String(key || '').trim();
      const idValue = String(id || '').trim();
      if (!keyValue && !idValue) return { ok: false, error: 'key or id is required.' };

      const list = Array.isArray(this.state.agentMemories) ? this.state.agentMemories : [];
      let entry = null;
      if (keyValue) entry = list.find((item) => String(item?.key || '') === keyValue) || null;
      if (!entry && idValue) entry = list.find((item) => String(item?.id || '') === idValue) || null;
      if (!entry) return { ok: false, error: 'Agent memory not found.' };

      if (touch) {
        const now = nowMs();
        entry.lastAccessedAtMs = now;
        entry.updatedAtMs = now;
        this._markDirty();
      }

      return { ok: true, memory: entry, path: this.filePath };
    });
  }

  async listAgentMemory({ limit = 50, symbol, timeframe, kind, tags, agentId, scope, category, subcategory } = {}) {
    const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(5000, Math.floor(Number(limit)))) : 50;
    const symbolKey = symbol != null ? String(symbol).trim().toLowerCase() : '';
    const timeframeKey = timeframe != null ? String(timeframe).trim().toLowerCase() : '';
    const kindKey = kind != null ? String(kind).trim().toLowerCase() : '';
    const categoryKey = category != null ? String(category).trim().toLowerCase() : '';
    const subcategoryKey = subcategory != null ? String(subcategory).trim().toLowerCase() : '';
    const tagFilters = normalizeTags(tags).map((tag) => tag.toLowerCase());
    const agentKey = agentId != null ? String(agentId).trim().toLowerCase() : '';
    const scopeFilters = normalizeScopeFilters(scope);
    const hasScopeFilter = scopeFilters.length > 0;

    const list = Array.isArray(this.state.agentMemories) ? this.state.agentMemories : [];
    const filtered = list.filter((entry) => {
      const entryScope = resolveEntryScope(entry);
      if (agentKey) {
        if (entryScope === 'agent') {
          const entryAgent = String(entry?.agentId || '').trim().toLowerCase();
          if (entryAgent !== agentKey) return false;
        } else if (hasScopeFilter && !scopeFilters.includes(entryScope)) {
          return false;
        }
      } else if (hasScopeFilter && !scopeFilters.includes(entryScope)) {
        return false;
      }
      if (symbolKey && String(entry?.symbol || '').trim().toLowerCase() !== symbolKey) return false;
      if (timeframeKey && String(entry?.timeframe || '').trim().toLowerCase() !== timeframeKey) return false;
      if (categoryKey && String(entry?.category || '').trim().toLowerCase() !== categoryKey) return false;
      if (subcategoryKey && String(entry?.subcategory || '').trim().toLowerCase() !== subcategoryKey) return false;
      if (kindKey && String(entry?.kind || '').trim().toLowerCase() !== kindKey) return false;
      if (tagFilters.length > 0) {
        const entryTags = Array.isArray(entry?.tags)
          ? entry.tags.map((tag) => String(tag || '').trim().toLowerCase())
          : [];
        for (const tag of tagFilters) {
          if (!entryTags.includes(tag)) return false;
        }
      }
      return true;
    });

    filtered.sort((a, b) => (Number(b?.updatedAtMs) || 0) - (Number(a?.updatedAtMs) || 0));
    return { ok: true, memories: filtered.slice(0, lim), path: this.filePath };
  }

  async deleteAgentMemory({ key, id } = {}) {
    return this._withLock(async () => {
      const keyValue = String(key || '').trim();
      const idValue = String(id || '').trim();
      if (!keyValue && !idValue) return { ok: false, error: 'key or id is required.' };

      const list = Array.isArray(this.state.agentMemories) ? this.state.agentMemories : [];
      let idx = -1;
      if (keyValue) idx = list.findIndex((entry) => String(entry?.key || '') === keyValue);
      if (idx < 0 && idValue) idx = list.findIndex((entry) => String(entry?.id || '') === idValue);
      if (idx < 0) return { ok: false, error: 'Agent memory not found.' };

      const removed = list.splice(idx, 1)[0] || null;
      this.state.agentMemories = list;
      this._markDirty();
      return { ok: true, memory: removed, path: this.filePath };
    });
  }

  async clearAgentMemory() {
    return this._withLock(async () => {
      this.state.agentMemories = [];
      this._markDirty();
      return { ok: true, path: this.filePath };
    });
  }

  async getOptimizerEvalCache({ key, touch } = {}) {
    return this._withLock(async () => {
      const keyValue = String(key || '').trim();
      if (!keyValue) return { ok: false, error: 'key is required.' };
      const cache = this.state.optimizerEvalCache || {};
      const entry = cache[keyValue] || null;
      if (!entry) return { ok: true, entry: null, path: this.filePath };
      const now = nowMs();
      if (entry.expiresAtMs && Number(entry.expiresAtMs) <= now) {
        delete cache[keyValue];
        this.state.optimizerEvalCache = cache;
        this._markDirty();
        return { ok: true, entry: null, expired: true, path: this.filePath };
      }
      if (touch) {
        entry.updatedAtMs = now;
        cache[keyValue] = entry;
        this.state.optimizerEvalCache = cache;
        this._markDirty();
      }
      return { ok: true, entry, path: this.filePath };
    });
  }

  async putOptimizerEvalCache({ key, payload, engineVersion, expiresAtMs } = {}) {
    return this._withLock(async () => {
      const keyValue = String(key || '').trim();
      if (!keyValue) return { ok: false, error: 'key is required.' };
      const cache = this.state.optimizerEvalCache && typeof this.state.optimizerEvalCache === 'object'
        ? this.state.optimizerEvalCache
        : {};
      const now = nowMs();
      const prev = cache[keyValue] || null;
      const expires = Number.isFinite(Number(expiresAtMs)) ? Math.floor(Number(expiresAtMs)) : null;
      const next = {
        key: keyValue,
        payload: payload ?? null,
        createdAtMs: prev?.createdAtMs || now,
        updatedAtMs: now,
        expiresAtMs: expires,
        engineVersion: engineVersion ? String(engineVersion) : null
      };
      cache[keyValue] = next;
      this.state.optimizerEvalCache = cache;
      this._pruneOptimizerEvalCache(now);
      this._trimOptimizerEvalCache();
      this._markDirty();
      return { ok: true, path: this.filePath };
    });
  }

  async pruneOptimizerEvalCache({ maxEntries } = {}) {
    return this._withLock(async () => {
      const now = nowMs();
      this._pruneOptimizerEvalCache(now);
      if (Number.isFinite(Number(maxEntries))) {
        const lim = Math.max(1, Math.floor(Number(maxEntries)));
        const cache = this.state.optimizerEvalCache && typeof this.state.optimizerEvalCache === 'object'
          ? this.state.optimizerEvalCache
          : {};
        const keys = Object.keys(cache);
        if (keys.length > lim) {
          keys.sort((a, b) => (Number(cache[a]?.updatedAtMs) || 0) - (Number(cache[b]?.updatedAtMs) || 0));
          const removeCount = keys.length - lim;
          for (let i = 0; i < removeCount; i += 1) {
            delete cache[keys[i]];
          }
          this.state.optimizerEvalCache = cache;
        }
      }
      this._markDirty();
      return { ok: true, path: this.filePath };
    });
  }

  async findRecent({ dedupeKey, windowMs = 60_000, brokers } = {}) {
    const key = String(dedupeKey || '').trim();
    if (!key) return { ok: false, error: 'dedupeKey is required.' };

    const window = Number.isFinite(Number(windowMs)) ? Math.max(0, Math.floor(Number(windowMs))) : 60_000;
    const brokerSet = Array.isArray(brokers) && brokers.length > 0 ? new Set(brokers.map((b) => String(b))) : null;
    const now = nowMs();

    const entries = this.state.entries || [];
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (!e || String(e.dedupeKey || '') !== key) continue;
      if (brokerSet && !brokerSet.has(String(e.broker || ''))) continue;

      const createdAt = Number(e.createdAtMs) || 0;
      if (window > 0 && createdAt > 0 && now - createdAt > window) continue;

      const status = String(e.status || '').toUpperCase();
      if (status === 'REJECTED' || status === 'CANCELLED' || status === 'CANCELED' || status === 'CLOSED') continue;
      return { ok: true, found: true, entry: e, path: this.filePath };
    }

    return { ok: true, found: false, entry: null, path: this.filePath };
  }
}

module.exports = { TradeLedger };
