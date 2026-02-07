const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const LEDGER_FILE = 'trade-ledger.json';
const MAX_AGENT_MEMORIES = 5000;
const MAX_EXPERIMENT_NOTES = 2000;
const MAX_OPTIMIZER_WINNERS = 2000;
const MAX_RESEARCH_STEPS = 20000;
const MAX_PLAYBOOK_RUNS = 2000;
const DEFAULT_STATE = Object.freeze({
  version: 1,
  entries: [],
  memories: [],
  agentMemories: [],
  experimentNotes: [],
  optimizerWinners: [],
  researchSessions: [],
  researchSteps: [],
  playbookRuns: []
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
      const experimentNotes = Array.isArray(parsed.experimentNotes) ? parsed.experimentNotes : [];
      const optimizerWinners = Array.isArray(parsed.optimizerWinners) ? parsed.optimizerWinners : [];
      const researchSessions = Array.isArray(parsed.researchSessions) ? parsed.researchSessions : [];
      const researchSteps = Array.isArray(parsed.researchSteps) ? parsed.researchSteps : [];
      const playbookRuns = Array.isArray(parsed.playbookRuns) ? parsed.playbookRuns : [];
      this.state = {
        version: typeof parsed.version === 'number' ? parsed.version : 1,
        entries,
        memories,
        agentMemories,
        experimentNotes,
        optimizerWinners,
        researchSessions,
        researchSteps,
        playbookRuns
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
    const experimentCount = Array.isArray(this.state.experimentNotes) ? this.state.experimentNotes.length : 0;
    const researchSessionCount = Array.isArray(this.state.researchSessions) ? this.state.researchSessions.length : 0;
    const researchStepCount = Array.isArray(this.state.researchSteps) ? this.state.researchSteps.length : 0;
    const playbookRunCount = Array.isArray(this.state.playbookRuns) ? this.state.playbookRuns.length : 0;
    return {
      ok: true,
      path: this.filePath,
      stateVersion: this._stateVersion,
      persistedVersion: this._persistedVersion,
      pendingWrites,
      entriesCount,
      memoriesCount,
      agentMemoryCount,
      experimentCount,
      researchSessionCount,
      researchStepCount,
      playbookRunCount,
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

    const sorted = [...(this.state.entries || [])].sort((a, b) => (Number(b?.createdAtMs) || 0) - (Number(a?.createdAtMs) || 0));
    const filtered = sorted.filter((entry) => {
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
      const idx = list.findIndex((m) => (key && String(m?.key || '') === key) || (id && String(m?.id || '') === id));
      const now = nowMs();
      const prev = idx >= 0 ? (list[idx] || {}) : {};

      const next = { ...prev };
      if (key) next.key = key;
      if (id) next.id = id;

      if (input.familyKey !== undefined) next.familyKey = input.familyKey ? String(input.familyKey).trim() : null;
      if (input.kind !== undefined) next.kind = input.kind ? String(input.kind).trim() : null;
      if (input.symbol !== undefined) next.symbol = input.symbol ? String(input.symbol).trim() : null;
      if (input.timeframe !== undefined) next.timeframe = input.timeframe ? String(input.timeframe).trim() : null;
      if (input.summary !== undefined) next.summary = input.summary != null ? String(input.summary).trim() : null;
      if (input.payload !== undefined) next.payload = input.payload != null ? input.payload : null;
      if (input.source !== undefined) next.source = input.source ? String(input.source).trim() : null;
      if (input.tags !== undefined) next.tags = normalizeTags(input.tags);

      next.id = String(next.id || `agent_${now}_${Math.random().toString(16).slice(2)}`);
      next.createdAtMs = Number.isFinite(Number(prev.createdAtMs))
        ? Number(prev.createdAtMs)
        : (Number.isFinite(Number(input.createdAtMs)) ? Number(input.createdAtMs) : now);
      next.updatedAtMs = now;
      if (input.lastAccessedAtMs != null && Number.isFinite(Number(input.lastAccessedAtMs))) {
        next.lastAccessedAtMs = Number(input.lastAccessedAtMs);
      } else if (prev.lastAccessedAtMs != null) {
        next.lastAccessedAtMs = prev.lastAccessedAtMs;
      }

      if (!next.key) next.key = next.id;

      if (idx >= 0) {
        list[idx] = next;
      } else {
        list.push(next);
      }

      if (list.length > MAX_AGENT_MEMORIES) {
        list.sort((a, b) => (Number(b?.updatedAtMs) || 0) - (Number(a?.updatedAtMs) || 0));
        this.state.agentMemories = list.slice(0, MAX_AGENT_MEMORIES);
      } else {
        this.state.agentMemories = list;
      }

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
      const idx = list.findIndex((m) => (keyValue && String(m?.key || '') === keyValue) || (idValue && String(m?.id || '') === idValue));
      if (idx < 0) return { ok: false, error: 'Agent memory not found.' };

      const entry = list[idx];
      if (touch) {
        const now = nowMs();
        list[idx] = { ...entry, lastAccessedAtMs: now };
        this.state.agentMemories = list;
        this._markDirty();
        return { ok: true, memory: list[idx], path: this.filePath };
      }

      return { ok: true, memory: entry, path: this.filePath };
    });
  }

  async listAgentMemory({ limit = 50, symbol, timeframe, kind, tags } = {}) {
    const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(5000, Math.floor(Number(limit)))) : 50;
    const symbolKey = symbol != null ? String(symbol).trim().toLowerCase() : '';
    const timeframeKey = timeframe != null ? String(timeframe).trim().toLowerCase() : '';
    const kindKey = kind != null ? String(kind).trim().toLowerCase() : '';
    const tagFilters = normalizeTags(tags).map((tag) => tag.toLowerCase());

    const list = Array.isArray(this.state.agentMemories) ? this.state.agentMemories : [];
    const filtered = list.filter((entry) => {
      if (!entry) return false;
      if (symbolKey && String(entry.symbol || '').trim().toLowerCase() !== symbolKey) return false;
      if (timeframeKey && String(entry.timeframe || '').trim().toLowerCase() !== timeframeKey) return false;
      if (kindKey && String(entry.kind || '').trim().toLowerCase() !== kindKey) return false;
      if (tagFilters.length > 0) {
        const entryTags = Array.isArray(entry.tags) ? entry.tags.map((t) => String(t || '').trim().toLowerCase()) : [];
        for (const tag of tagFilters) {
          if (!entryTags.includes(tag)) return false;
        }
      }
      return true;
    });

    filtered.sort((a, b) => {
      const aTime = Number(a?.updatedAtMs || a?.createdAtMs) || 0;
      const bTime = Number(b?.updatedAtMs || b?.createdAtMs) || 0;
      return bTime - aTime;
    });

    return { ok: true, memories: filtered.slice(0, lim), path: this.filePath };
  }

  async createExperimentNote(note) {
    return this._withLock(async () => {
      const input = note && typeof note === 'object' ? { ...note } : {};
      const now = nowMs();
      const id = input.id || `exp_${now}_${Math.random().toString(16).slice(2)}`;
      const createdAtMs = Number.isFinite(Number(input.createdAtMs)) ? Number(input.createdAtMs) : now;
      const updatedAtMs = now;
      const tags = normalizeTags(input.tags);

      const entry = {
        ...input,
        id: String(id),
        symbol: input.symbol ? String(input.symbol).trim() : null,
        timeframe: input.timeframe ? String(input.timeframe).trim() : null,
        strategy: input.strategy ? String(input.strategy).trim() : null,
        baselineRunId: input.baselineRunId ? String(input.baselineRunId).trim() : null,
        round1SessionId: input.round1SessionId ? String(input.round1SessionId).trim() : null,
        round2SessionId: input.round2SessionId ? String(input.round2SessionId).trim() : null,
        objectivePreset: input.objectivePreset ? String(input.objectivePreset).trim() : null,
        hypothesis: input.hypothesis != null ? String(input.hypothesis).trim() : null,
        decision: input.decision ? String(input.decision).trim() : null,
        tags,
        createdAtMs,
        updatedAtMs
      };

      const list = Array.isArray(this.state.experimentNotes) ? this.state.experimentNotes : [];
      const idx = list.findIndex((n) => String(n?.id || '') === entry.id);
      if (idx >= 0) {
        list[idx] = entry;
      } else {
        list.push(entry);
      }

      if (list.length > MAX_EXPERIMENT_NOTES) {
        list.sort((a, b) => (Number(b?.updatedAtMs) || 0) - (Number(a?.updatedAtMs) || 0));
        this.state.experimentNotes = list.slice(0, MAX_EXPERIMENT_NOTES);
      } else {
        this.state.experimentNotes = list;
      }

      this._markDirty();
      return { ok: true, note: entry, path: this.filePath };
    });
  }

  async getExperimentNote({ id } = {}) {
    return this._withLock(async () => {
      const idValue = String(id || '').trim();
      if (!idValue) return { ok: false, error: 'id is required.' };
      const list = Array.isArray(this.state.experimentNotes) ? this.state.experimentNotes : [];
      const entry = list.find((note) => String(note?.id || '') === idValue);
      if (!entry) return { ok: false, error: 'Experiment note not found.' };
      return { ok: true, note: entry, path: this.filePath };
    });
  }

  async listExperimentNotes({ limit = 10, symbol, timeframe, strategy, tags } = {}) {
    const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(500, Math.floor(Number(limit)))) : 10;
    const symbolKey = symbol != null ? String(symbol).trim().toLowerCase() : '';
    const timeframeKey = timeframe != null ? String(timeframe).trim().toLowerCase() : '';
    const strategyKey = strategy != null ? String(strategy).trim().toLowerCase() : '';
    const tagFilters = normalizeTags(tags).map((tag) => tag.toLowerCase());

    const list = Array.isArray(this.state.experimentNotes) ? this.state.experimentNotes : [];
    const filtered = list.filter((entry) => {
      if (!entry) return false;
      if (symbolKey && String(entry.symbol || '').trim().toLowerCase() !== symbolKey) return false;
      if (timeframeKey && String(entry.timeframe || '').trim().toLowerCase() !== timeframeKey) return false;
      if (strategyKey && String(entry.strategy || '').trim().toLowerCase() !== strategyKey) return false;
      if (tagFilters.length > 0) {
        const entryTags = Array.isArray(entry.tags) ? entry.tags.map((t) => String(t || '').trim().toLowerCase()) : [];
        for (const tag of tagFilters) {
          if (!entryTags.includes(tag)) return false;
        }
      }
      return true;
    });

    filtered.sort((a, b) => {
      const aTime = Number(a?.updatedAtMs || a?.createdAtMs) || 0;
      const bTime = Number(b?.updatedAtMs || b?.createdAtMs) || 0;
      return bTime - aTime;
    });

    return { ok: true, notes: filtered.slice(0, lim), path: this.filePath };
  }

  async createOptimizerWinner(winner) {
    return this._withLock(async () => {
      const input = winner && typeof winner === 'object' ? { ...winner } : {};
      const now = nowMs();
      const sessionId = input.sessionId ? String(input.sessionId).trim() : '';
      const round = Number.isFinite(Number(input.round)) ? Number(input.round) : null;
      if (!sessionId || round == null) return { ok: false, error: 'sessionId and round are required.', path: this.filePath };

      const paramsHash = input.paramsHash ? String(input.paramsHash) : null;
      const id = input.id || (paramsHash ? `winner_${sessionId}_${round}_${paramsHash}` : `winner_${now}_${Math.random().toString(16).slice(2)}`);
      const createdAtMs = Number.isFinite(Number(input.createdAtMs)) ? Number(input.createdAtMs) : now;
      const entry = {
        ...input,
        id: String(id),
        sessionId,
        round,
        symbol: input.symbol ? String(input.symbol).trim() : null,
        timeframe: input.timeframe ? String(input.timeframe).trim() : null,
        strategy: input.strategy ? String(input.strategy).trim() : null,
        paramsHash,
        params: input.params && typeof input.params === 'object' ? input.params : null,
        metrics: input.metrics && typeof input.metrics === 'object' ? input.metrics : null,
        createdAtMs
      };

      const list = Array.isArray(this.state.optimizerWinners) ? this.state.optimizerWinners : [];
      const idx = list.findIndex((item) => String(item?.id || '') === entry.id);
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);
      list.sort((a, b) => (Number(b?.createdAtMs) || 0) - (Number(a?.createdAtMs) || 0));
      this.state.optimizerWinners = list.slice(0, MAX_OPTIMIZER_WINNERS);
      this._markDirty();
      return { ok: true, winner: entry, path: this.filePath };
    });
  }

  async getOptimizerWinner({ id } = {}) {
    return this._withLock(async () => {
      const idValue = String(id || '').trim();
      if (!idValue) return { ok: false, error: 'id is required.', path: this.filePath };
      const list = Array.isArray(this.state.optimizerWinners) ? this.state.optimizerWinners : [];
      const entry = list.find((item) => String(item?.id || '') === idValue);
      if (!entry) return { ok: false, error: 'Optimizer winner not found.', path: this.filePath };
      return { ok: true, winner: entry, path: this.filePath };
    });
  }

  async getOptimizerWinnerBySessionRound({ sessionId, round } = {}) {
    return this._withLock(async () => {
      const sessionKey = String(sessionId || '').trim();
      const roundValue = Number.isFinite(Number(round)) ? Number(round) : null;
      if (!sessionKey || roundValue == null) {
        return { ok: false, error: 'sessionId and round are required.', path: this.filePath };
      }
      const list = Array.isArray(this.state.optimizerWinners) ? this.state.optimizerWinners : [];
      const matches = list.filter((entry) => String(entry?.sessionId || '') === sessionKey && Number(entry?.round) === roundValue);
      if (matches.length === 0) return { ok: false, error: 'Optimizer winner not found.', path: this.filePath };
      matches.sort((a, b) => (Number(b?.createdAtMs) || 0) - (Number(a?.createdAtMs) || 0));
      return { ok: true, winner: matches[0], path: this.filePath };
    });
  }

  async listOptimizerWinners({ limit = 20, sessionId, symbol, timeframe, strategy, round } = {}) {
    return this._withLock(async () => {
      const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(500, Math.floor(Number(limit)))) : 20;
      const sessionKey = sessionId != null ? String(sessionId).trim().toLowerCase() : '';
      const symbolKey = symbol != null ? String(symbol).trim().toLowerCase() : '';
      const timeframeKey = timeframe != null ? String(timeframe).trim().toLowerCase() : '';
      const strategyKey = strategy != null ? String(strategy).trim().toLowerCase() : '';
      const roundValue = Number.isFinite(Number(round)) ? Number(round) : null;

      const list = Array.isArray(this.state.optimizerWinners) ? this.state.optimizerWinners : [];
      const filtered = list.filter((entry) => {
        if (!entry) return false;
        if (sessionKey && String(entry.sessionId || '').trim().toLowerCase() !== sessionKey) return false;
        if (roundValue != null && Number(entry.round) !== roundValue) return false;
        if (symbolKey && String(entry.symbol || '').trim().toLowerCase() !== symbolKey) return false;
        if (timeframeKey && String(entry.timeframe || '').trim().toLowerCase() !== timeframeKey) return false;
        if (strategyKey && String(entry.strategy || '').trim().toLowerCase() !== strategyKey) return false;
        return true;
      });

      filtered.sort((a, b) => (Number(b?.createdAtMs) || 0) - (Number(a?.createdAtMs) || 0));
      return { ok: true, winners: filtered.slice(0, lim), path: this.filePath };
    });
  }

  async createResearchSession(session) {
    return this._withLock(async () => {
      const input = session && typeof session === 'object' ? { ...session } : {};
      const now = nowMs();
      const id = input.sessionId || input.id || `research_${now}_${Math.random().toString(16).slice(2)}`;
      const createdAtMs = Number.isFinite(Number(input.createdAtMs)) ? Number(input.createdAtMs) : now;
      const updatedAtMs = now;
      const entry = {
        ...input,
        sessionId: String(id),
        status: input.status ? String(input.status).trim() : null,
        symbol: input.symbol ? String(input.symbol).trim() : null,
        timeframe: input.timeframe ? String(input.timeframe).trim() : null,
        strategy: input.strategy ? String(input.strategy).trim() : null,
        objectivePreset: input.objectivePreset ? String(input.objectivePreset).trim() : null,
        createdAtMs,
        updatedAtMs
      };

      const list = Array.isArray(this.state.researchSessions) ? this.state.researchSessions : [];
      const idx = list.findIndex((s) => String(s?.sessionId || s?.id || '') === entry.sessionId);
      if (idx >= 0) {
        list[idx] = entry;
      } else {
        list.push(entry);
      }
      list.sort((a, b) => (Number(b?.updatedAtMs) || 0) - (Number(a?.updatedAtMs) || 0));
      this.state.researchSessions = list.slice(0, 2000);

      this._markDirty();
      return { ok: true, session: entry, path: this.filePath };
    });
  }

  async getResearchSession({ sessionId } = {}) {
    return this._withLock(async () => {
      const id = String(sessionId || '').trim();
      if (!id) return { ok: false, error: 'sessionId is required.' };
      const list = Array.isArray(this.state.researchSessions) ? this.state.researchSessions : [];
      const entry = list.find((s) => String(s?.sessionId || s?.id || '') === id);
      if (!entry) return { ok: false, error: 'Research session not found.' };
      return { ok: true, session: entry, path: this.filePath };
    });
  }

  async listResearchSessions({ limit = 20, symbol, timeframe, strategy, status } = {}) {
    const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(200, Math.floor(Number(limit)))) : 20;
    const symbolKey = symbol != null ? String(symbol).trim().toLowerCase() : '';
    const timeframeKey = timeframe != null ? String(timeframe).trim().toLowerCase() : '';
    const strategyKey = strategy != null ? String(strategy).trim().toLowerCase() : '';
    const statusKey = status != null ? String(status).trim().toLowerCase() : '';

    const list = Array.isArray(this.state.researchSessions) ? this.state.researchSessions : [];
    const filtered = list.filter((entry) => {
      if (!entry) return false;
      if (symbolKey && String(entry.symbol || '').trim().toLowerCase() !== symbolKey) return false;
      if (timeframeKey && String(entry.timeframe || '').trim().toLowerCase() !== timeframeKey) return false;
      if (strategyKey && String(entry.strategy || '').trim().toLowerCase() !== strategyKey) return false;
      if (statusKey && String(entry.status || '').trim().toLowerCase() !== statusKey) return false;
      return true;
    });

    filtered.sort((a, b) => {
      const aTime = Number(a?.updatedAtMs || a?.createdAtMs) || 0;
      const bTime = Number(b?.updatedAtMs || b?.createdAtMs) || 0;
      return bTime - aTime;
    });

    return { ok: true, sessions: filtered.slice(0, lim), path: this.filePath };
  }

  async appendResearchStep({ sessionId, stepIndex, kind, payload } = {}) {
    return this._withLock(async () => {
      const id = `rstep_${nowMs()}_${Math.random().toString(16).slice(2)}`;
      const createdAtMs = nowMs();
      const sessionKey = String(sessionId || '').trim();
      if (!sessionKey) return { ok: false, error: 'sessionId is required.' };

      const list = Array.isArray(this.state.researchSteps) ? this.state.researchSteps : [];
      list.push({
        id,
        sessionId: sessionKey,
        stepIndex: Number.isFinite(Number(stepIndex)) ? Math.floor(Number(stepIndex)) : null,
        kind: kind ? String(kind).trim() : null,
        payload: payload ?? null,
        createdAtMs
      });

      if (list.length > MAX_RESEARCH_STEPS) {
        list.sort((a, b) => (Number(a?.createdAtMs) || 0) - (Number(b?.createdAtMs) || 0));
        this.state.researchSteps = list.slice(list.length - MAX_RESEARCH_STEPS);
      } else {
        this.state.researchSteps = list;
      }

      this._markDirty();
      return { ok: true, step: { id, sessionId: sessionKey, stepIndex, kind, payload, createdAtMs }, path: this.filePath };
    });
  }

  async listResearchSteps({ sessionId, limit = 50 } = {}) {
    const sessionKey = String(sessionId || '').trim();
    if (!sessionKey) return { ok: false, error: 'sessionId is required.' };
    const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(500, Math.floor(Number(limit)))) : 50;
    const list = Array.isArray(this.state.researchSteps) ? this.state.researchSteps : [];
    const filtered = list.filter((entry) => String(entry?.sessionId || '') === sessionKey);
    filtered.sort((a, b) => (Number(b?.createdAtMs) || 0) - (Number(a?.createdAtMs) || 0));
    return { ok: true, steps: filtered.slice(0, lim), path: this.filePath };
  }

  async createPlaybookRun(run) {
    return this._withLock(async () => {
      const input = run && typeof run === 'object' ? { ...run } : {};
      const now = nowMs();
      const runId = String(input.runId || input.id || '').trim() || `prun_${now}_${Math.random().toString(16).slice(2)}`;
      const startedAtMs = Number.isFinite(Number(input.startedAtMs)) ? Number(input.startedAtMs) : now;
      const updatedAtMs = now;
      const entry = {
        ...input,
        runId,
        playbookId: input.playbookId ? String(input.playbookId).trim() : null,
        playbookName: input.playbookName ? String(input.playbookName).trim() : null,
        status: input.status ? String(input.status).trim() : null,
        mode: input.mode ? String(input.mode).trim() : null,
        symbol: input.symbol ? String(input.symbol).trim() : null,
        timeframe: input.timeframe ? String(input.timeframe).trim() : null,
        strategy: input.strategy ? String(input.strategy).trim() : null,
        error: input.error ? String(input.error) : null,
        startedAtMs,
        finishedAtMs: Number.isFinite(Number(input.finishedAtMs)) ? Number(input.finishedAtMs) : null,
        currentStepId: input.currentStepId ? String(input.currentStepId) : null,
        currentActionId: input.currentActionId ? String(input.currentActionId) : null,
        currentStepIndex: Number.isFinite(Number(input.currentStepIndex)) ? Number(input.currentStepIndex) : null,
        updatedAtMs
      };

      const list = Array.isArray(this.state.playbookRuns) ? this.state.playbookRuns : [];
      const idx = list.findIndex((item) => String(item?.runId || item?.id || '') === runId);
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);
      list.sort((a, b) => (Number(b?.updatedAtMs || b?.startedAtMs) || 0) - (Number(a?.updatedAtMs || a?.startedAtMs) || 0));
      this.state.playbookRuns = list.slice(0, MAX_PLAYBOOK_RUNS);
      this._markDirty();
      return { ok: true, run: entry, path: this.filePath };
    });
  }

  async getPlaybookRun({ runId } = {}) {
    return this._withLock(async () => {
      const id = String(runId || '').trim();
      if (!id) return { ok: false, error: 'runId is required.' };
      const list = Array.isArray(this.state.playbookRuns) ? this.state.playbookRuns : [];
      const entry = list.find((item) => String(item?.runId || item?.id || '') === id);
      if (!entry) return { ok: false, error: 'Playbook run not found.' };
      return { ok: true, run: entry, path: this.filePath };
    });
  }

  async listPlaybookRuns({ limit = 20, status, playbookId, symbol, timeframe, strategy } = {}) {
    const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(200, Math.floor(Number(limit)))) : 20;
    const statusKey = status != null ? String(status).trim().toLowerCase() : '';
    const playbookKey = playbookId != null ? String(playbookId).trim().toLowerCase() : '';
    const symbolKey = symbol != null ? String(symbol).trim().toLowerCase() : '';
    const timeframeKey = timeframe != null ? String(timeframe).trim().toLowerCase() : '';
    const strategyKey = strategy != null ? String(strategy).trim().toLowerCase() : '';

    const list = Array.isArray(this.state.playbookRuns) ? this.state.playbookRuns : [];
    const filtered = list.filter((entry) => {
      if (!entry) return false;
      if (statusKey && String(entry.status || '').trim().toLowerCase() !== statusKey) return false;
      if (playbookKey && String(entry.playbookId || '').trim().toLowerCase() !== playbookKey) return false;
      if (symbolKey && String(entry.symbol || '').trim().toLowerCase() !== symbolKey) return false;
      if (timeframeKey && String(entry.timeframe || '').trim().toLowerCase() !== timeframeKey) return false;
      if (strategyKey && String(entry.strategy || '').trim().toLowerCase() !== strategyKey) return false;
      return true;
    });

    filtered.sort((a, b) => {
      const aTime = Number(a?.updatedAtMs || a?.startedAtMs) || 0;
      const bTime = Number(b?.updatedAtMs || b?.startedAtMs) || 0;
      return bTime - aTime;
    });
    return { ok: true, runs: filtered.slice(0, lim), path: this.filePath };
  }

  async deleteAgentMemory({ key, id } = {}) {
    return this._withLock(async () => {
      const keyValue = String(key || '').trim();
      const idValue = String(id || '').trim();
      if (!keyValue && !idValue) return { ok: false, error: 'key or id is required.' };

      const list = Array.isArray(this.state.agentMemories) ? this.state.agentMemories : [];
      const idx = list.findIndex((m) => (keyValue && String(m?.key || '') === keyValue) || (idValue && String(m?.id || '') === idValue));
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
