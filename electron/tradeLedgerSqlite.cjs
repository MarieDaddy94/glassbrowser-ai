
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const LEDGER_DB_FILE = 'trade-ledger.sqlite';
const LEDGER_JSON_FILE = 'trade-ledger.json';
const LEDGER_SCHEMA_VERSION_KEY = 'schema_version';
const LEDGER_SCHEMA_VERSION_LATEST = 2;
const MAX_AGENT_MEMORIES = 5000;
const MAX_OPTIMIZER_CACHE = 20000;
const MAX_EXPERIMENT_NOTES = 2000;
const MAX_RESEARCH_STEPS = 20000;
const MAX_OPTIMIZER_WINNERS = 2000;
const MAX_PLAYBOOK_RUNS = 2000;
const MAX_RESEARCH_SESSIONS = 2000;

let Database = null;
try {
  Database = require('better-sqlite3');
} catch (err) {
  Database = null;
}

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

function toJson(value) {
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function parseTagsJson(raw) {
  if (!raw) return [];
  const parsed = safeJsonParse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function parseEntryRow(row) {
  if (!row) return null;
  const payload = safeJsonParse(row.payload || '');
  if (payload && typeof payload === 'object') return payload;
  return {
    id: row.id,
    dedupeKey: row.dedupe_key || null,
    status: row.status || null,
    broker: row.broker || null,
    source: row.source || null,
    createdAtMs: row.created_at_ms || null,
    updatedAtMs: row.updated_at_ms || null
  };
}

function parseMemoryRow(row) {
  if (!row) return null;
  const payload = safeJsonParse(row.payload || '');
  if (payload && typeof payload === 'object') return payload;
  return {
    id: row.id,
    type: row.type || null,
    text: row.text || null,
    createdAtMs: row.created_at_ms || null,
    updatedAtMs: row.updated_at_ms || null
  };
}

function parseAgentRow(row) {
  if (!row) return null;
  const payload = safeJsonParse(row.payload_json || '');
  const entry = payload && typeof payload === 'object' ? { ...payload } : {};
  if (entry.id == null) entry.id = row.id || null;
  if (entry.key == null) entry.key = row.key || null;
  if (entry.familyKey == null) entry.familyKey = row.family_key || null;
  if (entry.kind == null) entry.kind = row.kind || null;
  if (entry.symbol == null) entry.symbol = row.symbol || null;
  if (entry.timeframe == null) entry.timeframe = row.timeframe || null;
  if (entry.summary == null) entry.summary = row.summary || null;
  if (entry.source == null) entry.source = row.source || null;
  if (entry.payload == null) entry.payload = null;
  if (entry.tags == null) entry.tags = parseTagsJson(row.tags_json);
  if (entry.createdAtMs == null) entry.createdAtMs = row.created_at_ms || null;
  if (entry.updatedAtMs == null) entry.updatedAtMs = row.updated_at_ms || null;
  if (entry.lastAccessedAtMs == null) entry.lastAccessedAtMs = row.last_accessed_at_ms || null;
  return entry;
}

function parseOptimizerCacheRow(row) {
  if (!row) return null;
  return {
    key: row.cache_key || null,
    payload: safeJsonParse(row.payload_json || '') || null,
    createdAtMs: row.created_at_ms || null,
    updatedAtMs: row.updated_at_ms || null,
    expiresAtMs: row.expires_at_ms || null,
    engineVersion: row.engine_version || null
  };
}

function parseExperimentRow(row) {
  if (!row) return null;
  const payload = safeJsonParse(row.payload_json || '');
  const entry = payload && typeof payload === 'object' ? { ...payload } : {};
  if (entry.id == null) entry.id = row.id || null;
  if (entry.symbol == null) entry.symbol = row.symbol || null;
  if (entry.timeframe == null) entry.timeframe = row.timeframe || null;
  if (entry.strategy == null) entry.strategy = row.strategy || null;
  if (entry.baselineRunId == null) entry.baselineRunId = row.baseline_run_id || null;
  if (entry.round1SessionId == null) entry.round1SessionId = row.round1_session_id || null;
  if (entry.round2SessionId == null) entry.round2SessionId = row.round2_session_id || null;
  if (entry.objectivePreset == null) entry.objectivePreset = row.objective_preset || null;
  if (entry.hypothesis == null) entry.hypothesis = row.hypothesis || null;
  if (entry.decision == null) entry.decision = row.decision || null;
  if (entry.tags == null) entry.tags = parseTagsJson(row.tags_json);
  if (entry.createdAtMs == null) entry.createdAtMs = row.created_at_ms || null;
  if (entry.updatedAtMs == null) entry.updatedAtMs = row.updated_at_ms || null;
  return entry;
}

function parseOptimizerWinnerRow(row) {
  if (!row) return null;
  const params = safeJsonParse(row.params_json || '');
  const metrics = safeJsonParse(row.metrics_json || '');
  return {
    id: row.id || null,
    sessionId: row.session_id || null,
    round: row.round != null ? Number(row.round) : null,
    symbol: row.symbol || null,
    timeframe: row.timeframe || null,
    strategy: row.strategy || null,
    paramsHash: row.params_hash || null,
    params: params && typeof params === 'object' ? params : null,
    metrics: metrics && typeof metrics === 'object' ? metrics : null,
    createdAtMs: row.created_at_ms || null
  };
}

function parseResearchSessionRow(row) {
  if (!row) return null;
  const payload = safeJsonParse(row.config_json || '');
  const stats = safeJsonParse(row.stats_json || '');
  const entry = payload && typeof payload === 'object' ? { ...payload } : {};
  if (entry.sessionId == null) entry.sessionId = row.session_id || null;
  if (entry.status == null) entry.status = row.status || null;
  if (entry.symbol == null) entry.symbol = row.symbol || null;
  if (entry.timeframe == null) entry.timeframe = row.timeframe || null;
  if (entry.strategy == null) entry.strategy = row.strategy || null;
  if (entry.objectivePreset == null) entry.objectivePreset = row.objective_preset || null;
  if (entry.stats == null) entry.stats = stats && typeof stats === 'object' ? stats : null;
  if (entry.createdAtMs == null) entry.createdAtMs = row.created_at_ms || null;
  if (entry.updatedAtMs == null) entry.updatedAtMs = row.updated_at_ms || null;
  return entry;
}

function parseResearchStepRow(row) {
  if (!row) return null;
  const payload = safeJsonParse(row.payload_json || '');
  return {
    id: row.id || null,
    sessionId: row.session_id || null,
    stepIndex: row.step_index != null ? Number(row.step_index) : null,
    kind: row.kind || null,
    payload: payload && typeof payload === 'object' ? payload : null,
    createdAtMs: row.created_at_ms || null
  };
}

function parsePlaybookRunRow(row) {
  if (!row) return null;
  const payload = safeJsonParse(row.payload_json || '');
  const entry = payload && typeof payload === 'object' ? { ...payload } : {};
  if (entry.runId == null) entry.runId = row.run_id || null;
  if (entry.playbookId == null) entry.playbookId = row.playbook_id || null;
  if (entry.playbookName == null) entry.playbookName = row.playbook_name || null;
  if (entry.status == null) entry.status = row.status || null;
  if (entry.mode == null) entry.mode = row.mode || null;
  if (entry.symbol == null) entry.symbol = row.symbol || null;
  if (entry.timeframe == null) entry.timeframe = row.timeframe || null;
  if (entry.strategy == null) entry.strategy = row.strategy || null;
  if (entry.startedAtMs == null) entry.startedAtMs = row.started_at_ms || null;
  if (entry.finishedAtMs == null) entry.finishedAtMs = row.finished_at_ms || null;
  if (entry.currentStepId == null) entry.currentStepId = row.current_step_id || null;
  if (entry.currentActionId == null) entry.currentActionId = row.current_action_id || null;
  if (entry.currentStepIndex == null) entry.currentStepIndex = row.current_step_index != null ? Number(row.current_step_index) : null;
  if (entry.error == null) entry.error = row.error || null;
  if (entry.updatedAtMs == null) entry.updatedAtMs = row.updated_at_ms || null;
  return entry;
}

class TradeLedgerSqlite {
  constructor({ maxEntries = 2000 } = {}) {
    if (!Database) {
      throw new Error('better-sqlite3 is not available.');
    }

    this.maxEntries = Number.isFinite(Number(maxEntries)) ? Math.max(100, Number(maxEntries)) : 2000;
    this.dbPath = path.join(app.getPath('userData'), LEDGER_DB_FILE);
    this.jsonPath = path.join(app.getPath('userData'), LEDGER_JSON_FILE);
    this._lock = Promise.resolve();
    this._lastError = null;
    this._jsonMirrorTimer = null;
    this._jsonMirrorInFlight = null;
    this._jsonMirrorDirty = false;
    this._jsonMirrorDelayMs = 1500;
    this._jsonMirrorToken = 0;
    this._lastJsonMirrorAtMs = 0;
    this._lastJsonMirrorError = null;
    this._legacyAdoptedFrom = null;
    this._initDb();
  }

  _initDb() {
    this._adoptLegacyLedgerIfMissing();
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('temp_store = MEMORY');
    this._createSchema();
    this._runSchemaMigrations();
    this._migrateFromJsonIfNeeded();
    this._ensureJsonMirror();
  }

  _adoptLegacyLedgerIfMissing() {
    try {
      if (fs.existsSync(this.dbPath)) return false;
      const candidates = this._resolveLegacyLedgerCandidates();
      for (const candidate of candidates) {
        if (!candidate) continue;
        if (path.resolve(candidate) === path.resolve(this.dbPath)) continue;
        if (!fs.existsSync(candidate)) continue;
        try {
          fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
        } catch {
          // ignore mkdir failures
        }
        try {
          fs.copyFileSync(candidate, this.dbPath);
          const legacyJson = path.join(path.dirname(candidate), LEDGER_JSON_FILE);
          if (!fs.existsSync(this.jsonPath) && fs.existsSync(legacyJson)) {
            fs.copyFileSync(legacyJson, this.jsonPath);
          }
          this._legacyAdoptedFrom = candidate;
          return true;
        } catch {
          // ignore copy failures
        }
      }

      if (!fs.existsSync(this.jsonPath)) {
        for (const candidate of candidates) {
          if (!candidate) continue;
          const legacyJson = path.join(path.dirname(candidate), LEDGER_JSON_FILE);
          if (!fs.existsSync(legacyJson)) continue;
          try {
            fs.mkdirSync(path.dirname(this.jsonPath), { recursive: true });
          } catch {
            // ignore mkdir failures
          }
          try {
            fs.copyFileSync(legacyJson, this.jsonPath);
            this._legacyAdoptedFrom = legacyJson;
            return true;
          } catch {
            // ignore copy failures
          }
        }
      }
    } catch {
      // ignore migration failures
    }
    return false;
  }

  _resolveLegacyLedgerCandidates() {
    const roots = new Set();
    if (process.env.APPDATA) roots.add(process.env.APPDATA);
    if (process.env.LOCALAPPDATA) roots.add(process.env.LOCALAPPDATA);
    try {
      const appData = app.getPath('appData');
      if (appData) roots.add(appData);
    } catch {
      // ignore
    }

    const appName = (() => {
      try {
        return String(app.getName() || '').trim();
      } catch {
        return '';
      }
    })();
    const baseName = appName.replace(/\s+beta$/i, '').trim();
    const names = new Set([
      appName,
      baseName,
      'GlassBrowser AI',
      'GlassBrowser AI Beta',
      'GlassBrowserAI',
      'GlassBrowser',
      'glassbrowser-ai',
      'glassbrowser'
    ].filter(Boolean));

    const pathsOut = new Set();
    for (const root of roots) {
      for (const name of names) {
        const candidate = path.join(String(root), String(name), LEDGER_DB_FILE);
        pathsOut.add(candidate);
      }
    }
    return Array.from(pathsOut);
  }

  _createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ledger_entries (
        id TEXT PRIMARY KEY,
        dedupe_key TEXT,
        status TEXT,
        broker TEXT,
        source TEXT,
        created_at_ms INTEGER,
        updated_at_ms INTEGER,
        payload TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_ledger_entries_created_at ON ledger_entries(created_at_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_ledger_entries_dedupe ON ledger_entries(dedupe_key);
      CREATE INDEX IF NOT EXISTS idx_ledger_entries_broker ON ledger_entries(broker);

      CREATE TABLE IF NOT EXISTS ledger_memories (
        id TEXT PRIMARY KEY,
        type TEXT,
        text TEXT,
        created_at_ms INTEGER,
        updated_at_ms INTEGER,
        payload TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_ledger_memories_created_at ON ledger_memories(created_at_ms DESC);

      CREATE TABLE IF NOT EXISTS agent_memories (
        id TEXT PRIMARY KEY,
        key TEXT,
        family_key TEXT,
        kind TEXT,
        symbol TEXT,
        timeframe TEXT,
        summary TEXT,
        tags_json TEXT,
        payload_json TEXT,
        source TEXT,
        created_at_ms INTEGER,
        updated_at_ms INTEGER,
        last_accessed_at_ms INTEGER
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memories_key ON agent_memories(key);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_symbol ON agent_memories(symbol);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_kind_symbol_timeframe ON agent_memories(kind, symbol, timeframe);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_kind ON agent_memories(kind);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_timeframe ON agent_memories(timeframe);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_updated ON agent_memories(updated_at_ms DESC);

      CREATE TABLE IF NOT EXISTS optimizer_eval_cache (
        cache_key TEXT PRIMARY KEY,
        payload_json TEXT,
        created_at_ms INTEGER,
        updated_at_ms INTEGER,
        expires_at_ms INTEGER,
        engine_version TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_optimizer_cache_updated ON optimizer_eval_cache(updated_at_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_optimizer_cache_expires ON optimizer_eval_cache(expires_at_ms);

      CREATE TABLE IF NOT EXISTS optimizer_winners (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        round INTEGER,
        symbol TEXT,
        timeframe TEXT,
        strategy TEXT,
        params_hash TEXT,
        params_json TEXT,
        metrics_json TEXT,
        created_at_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_optimizer_winners_session_round ON optimizer_winners(session_id, round);
      CREATE INDEX IF NOT EXISTS idx_optimizer_winners_symbol_tf_strategy ON optimizer_winners(symbol, timeframe, strategy, created_at_ms DESC);

      CREATE TABLE IF NOT EXISTS experiment_notes (
        id TEXT PRIMARY KEY,
        symbol TEXT,
        timeframe TEXT,
        strategy TEXT,
        baseline_run_id TEXT,
        round1_session_id TEXT,
        round2_session_id TEXT,
        objective_preset TEXT,
        hypothesis TEXT,
        decision TEXT,
        tags_json TEXT,
        payload_json TEXT,
        created_at_ms INTEGER,
        updated_at_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_experiment_notes_updated ON experiment_notes(updated_at_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_experiment_notes_symbol_tf_strategy ON experiment_notes(symbol, timeframe, strategy);

      CREATE TABLE IF NOT EXISTS research_sessions (
        session_id TEXT PRIMARY KEY,
        status TEXT,
        symbol TEXT,
        timeframe TEXT,
        strategy TEXT,
        objective_preset TEXT,
        config_json TEXT,
        stats_json TEXT,
        created_at_ms INTEGER,
        updated_at_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_research_sessions_updated ON research_sessions(updated_at_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_research_sessions_symbol_tf_strategy ON research_sessions(symbol, timeframe, strategy);

      CREATE TABLE IF NOT EXISTS research_steps (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        step_index INTEGER,
        kind TEXT,
        payload_json TEXT,
        created_at_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_research_steps_session ON research_steps(session_id, step_index);
      CREATE INDEX IF NOT EXISTS idx_research_steps_created ON research_steps(created_at_ms DESC);

      CREATE TABLE IF NOT EXISTS playbook_runs (
        run_id TEXT PRIMARY KEY,
        playbook_id TEXT,
        playbook_name TEXT,
        status TEXT,
        mode TEXT,
        symbol TEXT,
        timeframe TEXT,
        strategy TEXT,
        started_at_ms INTEGER,
        finished_at_ms INTEGER,
        current_step_id TEXT,
        current_action_id TEXT,
        current_step_index INTEGER,
        error TEXT,
        payload_json TEXT,
        updated_at_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_playbook_runs_updated ON playbook_runs(updated_at_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_playbook_runs_symbol_tf_strategy ON playbook_runs(symbol, timeframe, strategy);

      CREATE TABLE IF NOT EXISTS ledger_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    try {
      this.db.prepare('INSERT OR IGNORE INTO ledger_meta(key, value) VALUES (?, ?)').run(LEDGER_SCHEMA_VERSION_KEY, '1');
    } catch {
      // ignore
    }
  }

  _getSchemaVersion() {
    try {
      const row = this.db.prepare('SELECT value FROM ledger_meta WHERE key = ? LIMIT 1').get(LEDGER_SCHEMA_VERSION_KEY);
      const version = Number(row?.value || 1);
      if (!Number.isFinite(version) || version < 1) return 1;
      return Math.floor(version);
    } catch {
      return 1;
    }
  }

  _setSchemaVersion(version) {
    const safe = Number.isFinite(Number(version)) ? Math.max(1, Math.floor(Number(version))) : 1;
    this.db.prepare('INSERT OR REPLACE INTO ledger_meta(key, value) VALUES (?, ?)').run(LEDGER_SCHEMA_VERSION_KEY, String(safe));
  }

  _schemaMigrationHandlers() {
    return {
      2: () => {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS ledger_migrations (
            id TEXT PRIMARY KEY,
            applied_at_ms INTEGER NOT NULL,
            note TEXT
          );
        `);
        this.db.prepare(`
          INSERT OR REPLACE INTO ledger_migrations(id, applied_at_ms, note)
          VALUES (?, ?, ?)
        `).run('v2_scaffold', nowMs(), 'Schema v2 migration scaffold applied');
      }
    };
  }

  _runSchemaMigrations() {
    const handlers = this._schemaMigrationHandlers();
    let current = this._getSchemaVersion();
    if (current >= LEDGER_SCHEMA_VERSION_LATEST) return;

    for (let next = current + 1; next <= LEDGER_SCHEMA_VERSION_LATEST; next += 1) {
      const migrate = handlers[next];
      if (typeof migrate !== 'function') {
        throw new Error(`Missing ledger schema migration handler for v${next}`);
      }
      const tx = this.db.transaction(() => {
        migrate();
        this._setSchemaVersion(next);
      });
      tx();
      current = next;
    }
  }

  _migrateFromJsonIfNeeded() {
    try {
      const entriesCount = this.db.prepare('SELECT COUNT(*) AS count FROM ledger_entries').get().count;
      const memoriesCount = this.db.prepare('SELECT COUNT(*) AS count FROM ledger_memories').get().count;
      const agentCount = this.db.prepare('SELECT COUNT(*) AS count FROM agent_memories').get().count;
      const total = Number(entriesCount || 0) + Number(memoriesCount || 0) + Number(agentCount || 0);
      if (total > 0) return;

      if (!fs.existsSync(this.jsonPath)) return;

      const text = fs.readFileSync(this.jsonPath, 'utf8');
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

      const insertEntry = this.db.prepare(`
        INSERT OR REPLACE INTO ledger_entries
        (id, dedupe_key, status, broker, source, created_at_ms, updated_at_ms, payload)
        VALUES (@id, @dedupe_key, @status, @broker, @source, @created_at_ms, @updated_at_ms, @payload)
      `);

      const insertMemory = this.db.prepare(`
        INSERT OR REPLACE INTO ledger_memories
        (id, type, text, created_at_ms, updated_at_ms, payload)
        VALUES (@id, @type, @text, @created_at_ms, @updated_at_ms, @payload)
      `);

      const insertAgent = this.db.prepare(`
        INSERT OR REPLACE INTO agent_memories
        (id, key, family_key, kind, symbol, timeframe, summary, tags_json, payload_json, source, created_at_ms, updated_at_ms, last_accessed_at_ms)
        VALUES (@id, @key, @family_key, @kind, @symbol, @timeframe, @summary, @tags_json, @payload_json, @source, @created_at_ms, @updated_at_ms, @last_accessed_at_ms)
      `);

      const insertExperiment = this.db.prepare(`
        INSERT OR REPLACE INTO experiment_notes
        (id, symbol, timeframe, strategy, baseline_run_id, round1_session_id, round2_session_id, objective_preset, hypothesis, decision, tags_json, payload_json, created_at_ms, updated_at_ms)
        VALUES (@id, @symbol, @timeframe, @strategy, @baseline_run_id, @round1_session_id, @round2_session_id, @objective_preset, @hypothesis, @decision, @tags_json, @payload_json, @created_at_ms, @updated_at_ms)
      `);

      const insertWinner = this.db.prepare(`
        INSERT OR REPLACE INTO optimizer_winners
        (id, session_id, round, symbol, timeframe, strategy, params_hash, params_json, metrics_json, created_at_ms)
        VALUES (@id, @session_id, @round, @symbol, @timeframe, @strategy, @params_hash, @params_json, @metrics_json, @created_at_ms)
      `);

      const insertResearchSession = this.db.prepare(`
        INSERT OR REPLACE INTO research_sessions
        (session_id, status, symbol, timeframe, strategy, objective_preset, config_json, stats_json, created_at_ms, updated_at_ms)
        VALUES (@session_id, @status, @symbol, @timeframe, @strategy, @objective_preset, @config_json, @stats_json, @created_at_ms, @updated_at_ms)
      `);

      const insertResearchStep = this.db.prepare(`
        INSERT OR REPLACE INTO research_steps
        (id, session_id, step_index, kind, payload_json, created_at_ms)
        VALUES (@id, @session_id, @step_index, @kind, @payload_json, @created_at_ms)
      `);

      const insertPlaybookRun = this.db.prepare(`
        INSERT OR REPLACE INTO playbook_runs
        (run_id, playbook_id, playbook_name, status, mode, symbol, timeframe, strategy, started_at_ms, finished_at_ms, current_step_id, current_action_id, current_step_index, error, payload_json, updated_at_ms)
        VALUES (@run_id, @playbook_id, @playbook_name, @status, @mode, @symbol, @timeframe, @strategy, @started_at_ms, @finished_at_ms, @current_step_id, @current_action_id, @current_step_index, @error, @payload_json, @updated_at_ms)
      `);

      const insertAll = this.db.transaction(() => {
        for (const entry of entries) {
          const e = normalizeEntry(entry);
          const id = e.id || `led_${nowMs()}_${Math.random().toString(16).slice(2)}`;
          const createdAtMs = Number.isFinite(Number(e.createdAtMs)) ? Number(e.createdAtMs) : nowMs();
          const updatedAtMs = Number.isFinite(Number(e.updatedAtMs)) ? Number(e.updatedAtMs) : createdAtMs;
          const payload = { ...e, id, createdAtMs, updatedAtMs };
          insertEntry.run({
            id,
            dedupe_key: payload.dedupeKey || null,
            status: payload.status || null,
            broker: payload.broker || null,
            source: payload.source || null,
            created_at_ms: createdAtMs,
            updated_at_ms: updatedAtMs,
            payload: toJson(payload)
          });
        }

        for (const memory of memories) {
          const m = memory && typeof memory === 'object' ? { ...memory } : {};
          const id = m.id || `mem_${nowMs()}_${Math.random().toString(16).slice(2)}`;
          const createdAtMs = Number.isFinite(Number(m.createdAtMs)) ? Number(m.createdAtMs) : nowMs();
          const updatedAtMs = Number.isFinite(Number(m.updatedAtMs)) ? Number(m.updatedAtMs) : createdAtMs;
          const type = String(m.type || '').toUpperCase() === 'LOSS' ? 'LOSS' : 'WIN';
          const textValue = String(m.text || '').trim();
          const payload = {
            ...m,
            id: String(id),
            type,
            text: textValue,
            createdAtMs,
            updatedAtMs
          };
          if (!payload.text) continue;
          insertMemory.run({
            id: payload.id,
            type: payload.type,
            text: payload.text,
            created_at_ms: payload.createdAtMs,
            updated_at_ms: payload.updatedAtMs,
            payload: toJson(payload)
          });
        }

        for (const memory of agentMemories) {
          const input = memory && typeof memory === 'object' ? { ...memory } : {};
          const id = input.id || `agent_${nowMs()}_${Math.random().toString(16).slice(2)}`;
          const createdAtMs = Number.isFinite(Number(input.createdAtMs)) ? Number(input.createdAtMs) : nowMs();
          const updatedAtMs = Number.isFinite(Number(input.updatedAtMs)) ? Number(input.updatedAtMs) : createdAtMs;
          const tags = normalizeTags(input.tags);
          const payload = {
            ...input,
            id: String(id),
            key: input.key ? String(input.key).trim() : String(id),
            familyKey: input.familyKey ? String(input.familyKey).trim() : null,
            kind: input.kind ? String(input.kind).trim() : null,
            symbol: input.symbol ? String(input.symbol).trim() : null,
            timeframe: input.timeframe ? String(input.timeframe).trim() : null,
            summary: input.summary != null ? String(input.summary).trim() : null,
            source: input.source ? String(input.source).trim() : null,
            tags,
            createdAtMs,
            updatedAtMs,
            lastAccessedAtMs: Number.isFinite(Number(input.lastAccessedAtMs)) ? Number(input.lastAccessedAtMs) : null
          };

          insertAgent.run({
            id: payload.id,
            key: payload.key,
            family_key: payload.familyKey,
            kind: payload.kind,
            symbol: payload.symbol,
            timeframe: payload.timeframe,
            summary: payload.summary,
            tags_json: toJson(tags) || '[]',
            payload_json: toJson(payload),
            source: payload.source,
            created_at_ms: payload.createdAtMs,
            updated_at_ms: payload.updatedAtMs,
            last_accessed_at_ms: payload.lastAccessedAtMs
          });
        }

        for (const note of experimentNotes) {
          const input = note && typeof note === 'object' ? { ...note } : {};
          const id = input.id || `exp_${nowMs()}_${Math.random().toString(16).slice(2)}`;
          const createdAtMs = Number.isFinite(Number(input.createdAtMs)) ? Number(input.createdAtMs) : nowMs();
          const updatedAtMs = Number.isFinite(Number(input.updatedAtMs)) ? Number(input.updatedAtMs) : createdAtMs;
          const tags = normalizeTags(input.tags);
          const payload = {
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
          insertExperiment.run({
            id: payload.id,
            symbol: payload.symbol,
            timeframe: payload.timeframe,
            strategy: payload.strategy,
            baseline_run_id: payload.baselineRunId,
            round1_session_id: payload.round1SessionId,
            round2_session_id: payload.round2SessionId,
            objective_preset: payload.objectivePreset,
            hypothesis: payload.hypothesis,
            decision: payload.decision,
            tags_json: toJson(tags) || '[]',
            payload_json: toJson(payload) || null,
            created_at_ms: payload.createdAtMs,
            updated_at_ms: payload.updatedAtMs
          });
        }

        for (const entry of optimizerWinners) {
          const input = entry && typeof entry === 'object' ? { ...entry } : {};
          const id = input.id || `winner_${nowMs()}_${Math.random().toString(16).slice(2)}`;
          insertWinner.run({
            id: String(id),
            session_id: input.sessionId ? String(input.sessionId) : null,
            round: Number.isFinite(Number(input.round)) ? Number(input.round) : null,
            symbol: input.symbol ? String(input.symbol) : null,
            timeframe: input.timeframe ? String(input.timeframe) : null,
            strategy: input.strategy ? String(input.strategy) : null,
            params_hash: input.paramsHash ? String(input.paramsHash) : null,
            params_json: toJson(input.params || null),
            metrics_json: toJson(input.metrics || null),
            created_at_ms: Number.isFinite(Number(input.createdAtMs)) ? Number(input.createdAtMs) : nowMs()
          });
        }

        for (const session of researchSessions) {
          const input = session && typeof session === 'object' ? { ...session } : {};
          const id = input.sessionId || input.id || `research_${nowMs()}_${Math.random().toString(16).slice(2)}`;
          const createdAtMs = Number.isFinite(Number(input.createdAtMs)) ? Number(input.createdAtMs) : nowMs();
          const updatedAtMs = Number.isFinite(Number(input.updatedAtMs)) ? Number(input.updatedAtMs) : createdAtMs;
          const payload = {
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

          insertResearchSession.run({
            session_id: payload.sessionId,
            status: payload.status,
            symbol: payload.symbol,
            timeframe: payload.timeframe,
            strategy: payload.strategy,
            objective_preset: payload.objectivePreset,
            config_json: toJson(payload) || null,
            stats_json: toJson(payload.stats || null),
            created_at_ms: payload.createdAtMs,
            updated_at_ms: payload.updatedAtMs
          });
        }

        for (const step of researchSteps) {
          const input = step && typeof step === 'object' ? { ...step } : {};
          const id = input.id || `rstep_${nowMs()}_${Math.random().toString(16).slice(2)}`;
          const createdAtMs = Number.isFinite(Number(input.createdAtMs)) ? Number(input.createdAtMs) : nowMs();
          insertResearchStep.run({
            id,
            session_id: input.sessionId ? String(input.sessionId).trim() : null,
            step_index: Number.isFinite(Number(input.stepIndex)) ? Math.floor(Number(input.stepIndex)) : null,
            kind: input.kind ? String(input.kind).trim() : null,
            payload_json: toJson(input.payload || null),
            created_at_ms: createdAtMs
          });
        }

        for (const run of playbookRuns) {
          const input = run && typeof run === 'object' ? { ...run } : {};
          const now = nowMs();
          const runId = String(input.runId || input.id || `prun_${now}_${Math.random().toString(16).slice(2)}`);
          const startedAtMs = Number.isFinite(Number(input.startedAtMs)) ? Number(input.startedAtMs) : now;
          const updatedAtMs = Number.isFinite(Number(input.updatedAtMs)) ? Number(input.updatedAtMs) : startedAtMs;
          insertPlaybookRun.run({
            run_id: runId,
            playbook_id: input.playbookId ? String(input.playbookId) : null,
            playbook_name: input.playbookName ? String(input.playbookName) : null,
            status: input.status ? String(input.status) : null,
            mode: input.mode ? String(input.mode) : null,
            symbol: input.symbol ? String(input.symbol) : null,
            timeframe: input.timeframe ? String(input.timeframe) : null,
            strategy: input.strategy ? String(input.strategy) : null,
            started_at_ms: startedAtMs,
            finished_at_ms: Number.isFinite(Number(input.finishedAtMs)) ? Number(input.finishedAtMs) : null,
            current_step_id: input.currentStepId ? String(input.currentStepId) : null,
            current_action_id: input.currentActionId ? String(input.currentActionId) : null,
            current_step_index: Number.isFinite(Number(input.currentStepIndex)) ? Number(input.currentStepIndex) : null,
            error: input.error ? String(input.error) : null,
            payload_json: toJson(input),
            updated_at_ms: updatedAtMs
          });
        }
      });

      insertAll();

      this.db.prepare('INSERT OR REPLACE INTO ledger_meta(key, value) VALUES (?, ?)').run(
        'migrated_from_json',
        String(nowMs())
      );
    } catch (err) {
      this._lastError = redactErrorMessage(err?.message || String(err));
    }
  }

  _ensureJsonMirror() {
    try {
      if (!fs.existsSync(this.jsonPath)) {
        this._jsonMirrorDirty = true;
        this._scheduleJsonMirror();
      }
    } catch {
      // ignore mirror bootstrap failures
    }
  }

  _markDirty() {
    this._jsonMirrorDirty = true;
    this._scheduleJsonMirror();
  }

  _scheduleJsonMirror() {
    if (this._jsonMirrorTimer || this._jsonMirrorInFlight) return;
    this._jsonMirrorTimer = setTimeout(() => {
      this._jsonMirrorTimer = null;
      if (!this._jsonMirrorDirty) return;
      this._jsonMirrorDirty = false;
      const token = ++this._jsonMirrorToken;
      this._jsonMirrorInFlight = (async () => {
        try {
          await this._writeJsonMirror(token);
        } finally {
          this._jsonMirrorInFlight = null;
          if (this._jsonMirrorDirty) {
            this._scheduleJsonMirror();
          }
        }
      })();
    }, this._jsonMirrorDelayMs);
  }

  _buildJsonSnapshot() {
    const entries = this.db.prepare(`
      SELECT * FROM ledger_entries
      ORDER BY created_at_ms DESC
      LIMIT ?
    `).all(this.maxEntries);

    const memories = this.db.prepare(`
      SELECT * FROM ledger_memories
      ORDER BY created_at_ms DESC
      LIMIT ?
    `).all(this.maxEntries);

    const agentMemories = this.db.prepare(`
      SELECT * FROM agent_memories
      ORDER BY updated_at_ms DESC
      LIMIT ?
    `).all(MAX_AGENT_MEMORIES);

    const experimentNotes = this.db.prepare(`
      SELECT * FROM experiment_notes
      ORDER BY updated_at_ms DESC
      LIMIT ?
    `).all(MAX_EXPERIMENT_NOTES);

    const optimizerWinners = this.db.prepare(`
      SELECT * FROM optimizer_winners
      ORDER BY created_at_ms DESC
      LIMIT ?
    `).all(MAX_OPTIMIZER_WINNERS);

    const researchSessions = this.db.prepare(`
      SELECT * FROM research_sessions
      ORDER BY updated_at_ms DESC
      LIMIT ?
    `).all(MAX_RESEARCH_SESSIONS);

    const researchSteps = this.db.prepare(`
      SELECT * FROM research_steps
      ORDER BY created_at_ms DESC
      LIMIT ?
    `).all(MAX_RESEARCH_STEPS);

    const playbookRuns = this.db.prepare(`
      SELECT * FROM playbook_runs
      ORDER BY updated_at_ms DESC
      LIMIT ?
    `).all(MAX_PLAYBOOK_RUNS);

    return {
      version: 1,
      entries: entries.map(parseEntryRow).filter(Boolean),
      memories: memories.map(parseMemoryRow).filter(Boolean),
      agentMemories: agentMemories.map(parseAgentRow).filter(Boolean),
      experimentNotes: experimentNotes.map(parseExperimentRow).filter(Boolean),
      optimizerWinners: optimizerWinners.map(parseOptimizerWinnerRow).filter(Boolean),
      researchSessions: researchSessions.map(parseResearchSessionRow).filter(Boolean),
      researchSteps: researchSteps.map(parseResearchStepRow).filter(Boolean),
      playbookRuns: playbookRuns.map(parsePlaybookRunRow).filter(Boolean)
    };
  }

  _serializeJsonSnapshot(state) {
    const pretty = app && app.isPackaged ? 0 : 2;
    return JSON.stringify(state, null, pretty);
  }

  async _writeJsonMirror(token = this._jsonMirrorToken) {
    try {
      const payload = this._serializeJsonSnapshot(this._buildJsonSnapshot());
      const tempPath = `${this.jsonPath}.tmp_${token}`;
      await fs.promises.writeFile(tempPath, payload, 'utf8');
      try {
        await fs.promises.rename(tempPath, this.jsonPath);
      } catch (err) {
        try { await fs.promises.rm(this.jsonPath, { force: true }); } catch {}
        await fs.promises.rename(tempPath, this.jsonPath);
      }
      this._lastJsonMirrorAtMs = nowMs();
      this._lastJsonMirrorError = null;
      return { ok: true, path: this.jsonPath };
    } catch (err) {
      const msg = redactErrorMessage(err?.message || String(err));
      this._lastJsonMirrorError = msg;
      return { ok: false, error: msg, path: this.jsonPath };
    }
  }

  _writeJsonMirrorSync() {
    try {
      const payload = this._serializeJsonSnapshot(this._buildJsonSnapshot());
      const tempPath = `${this.jsonPath}.tmp_sync`;
      fs.writeFileSync(tempPath, payload, 'utf8');
      try {
        fs.renameSync(tempPath, this.jsonPath);
      } catch {
        try { fs.rmSync(this.jsonPath, { force: true }); } catch {}
        fs.renameSync(tempPath, this.jsonPath);
      }
      this._lastJsonMirrorAtMs = nowMs();
      this._lastJsonMirrorError = null;
      return { ok: true, path: this.jsonPath };
    } catch (err) {
      const msg = redactErrorMessage(err?.message || String(err));
      this._lastJsonMirrorError = msg;
      return { ok: false, error: msg, path: this.jsonPath };
    }
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

  _trimEntries() {
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM ledger_entries').get().count;
    const overBy = Number(count || 0) - this.maxEntries;
    if (overBy <= 0) return;
    this.db.prepare(`
      DELETE FROM ledger_entries
      WHERE id IN (
        SELECT id FROM ledger_entries
        ORDER BY created_at_ms ASC
        LIMIT ?
      )
    `).run(overBy);
  }

  _trimMemories() {
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM ledger_memories').get().count;
    const overBy = Number(count || 0) - this.maxEntries;
    if (overBy <= 0) return;
    this.db.prepare(`
      DELETE FROM ledger_memories
      WHERE id IN (
        SELECT id FROM ledger_memories
        ORDER BY created_at_ms ASC
        LIMIT ?
      )
    `).run(overBy);
  }

  _trimAgentMemories() {
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM agent_memories').get().count;
    const overBy = Number(count || 0) - MAX_AGENT_MEMORIES;
    if (overBy <= 0) return;
    this.db.prepare(`
      DELETE FROM agent_memories
      WHERE id IN (
        SELECT id FROM agent_memories
        ORDER BY updated_at_ms ASC
        LIMIT ?
      )
    `).run(overBy);
  }

  _trimExperimentNotes() {
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM experiment_notes').get().count;
    const overBy = Number(count || 0) - MAX_EXPERIMENT_NOTES;
    if (overBy <= 0) return;
    this.db.prepare(`
      DELETE FROM experiment_notes
      WHERE id IN (
        SELECT id FROM experiment_notes
        ORDER BY updated_at_ms ASC
        LIMIT ?
      )
    `).run(overBy);
  }

  _trimOptimizerCache() {
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM optimizer_eval_cache').get().count;
    const overBy = Number(count || 0) - MAX_OPTIMIZER_CACHE;
    if (overBy <= 0) return;
    this.db.prepare(`
      DELETE FROM optimizer_eval_cache
      WHERE cache_key IN (
        SELECT cache_key FROM optimizer_eval_cache
        ORDER BY updated_at_ms ASC
        LIMIT ?
      )
    `).run(overBy);
  }

  _trimResearchSteps() {
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM research_steps').get().count;
    const overBy = Number(count || 0) - MAX_RESEARCH_STEPS;
    if (overBy <= 0) return;
    this.db.prepare(`
      DELETE FROM research_steps
      WHERE id IN (
        SELECT id FROM research_steps
        ORDER BY created_at_ms ASC
        LIMIT ?
      )
    `).run(overBy);
  }

  _pruneOptimizerCache(now = nowMs()) {
    try {
      this.db.prepare('DELETE FROM optimizer_eval_cache WHERE expires_at_ms IS NOT NULL AND expires_at_ms <= ?').run(now);
    } catch {
      // ignore
    }
  }

  async append(entry) {
    return this._withLock(async () => {
      try {
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

        this.db.prepare(`
          INSERT OR REPLACE INTO ledger_entries
          (id, dedupe_key, status, broker, source, created_at_ms, updated_at_ms, payload)
          VALUES (@id, @dedupe_key, @status, @broker, @source, @created_at_ms, @updated_at_ms, @payload)
        `).run({
          id: next.id,
          dedupe_key: next.dedupeKey || null,
          status: next.status || null,
          broker: next.broker || null,
          source: next.source || null,
          created_at_ms: next.createdAtMs,
          updated_at_ms: next.updatedAtMs,
          payload: toJson(next)
        });

        this._trimEntries();
        this._markDirty();
        return { ok: true, entry: next, path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async reserve({ dedupeKey, windowMs = 60000, entry } = {}) {
    return this._withLock(async () => {
      try {
        const key = String(dedupeKey || '').trim();
        if (!key) return { ok: false, error: 'dedupeKey is required.' };

        const window = Number.isFinite(Number(windowMs)) ? Math.max(0, Math.floor(Number(windowMs))) : 60000;
        const now = nowMs();

        const rows = this.db.prepare(`
          SELECT id, dedupe_key, status, broker, source, created_at_ms, updated_at_ms, payload
          FROM ledger_entries
          WHERE dedupe_key = ?
          ORDER BY created_at_ms DESC
          LIMIT 25
        `).all(key);

        for (const row of rows) {
          const e = parseEntryRow(row);
          if (!e) continue;
          const createdAt = Number(e.createdAtMs) || 0;
          if (window > 0 && createdAt > 0 && now - createdAt > window) continue;

          const status = String(e.status || '').toUpperCase();
          if (status === 'REJECTED' || status === 'CANCELLED' || status === 'CANCELED' || status === 'CLOSED') continue;
          return { ok: true, reserved: false, entry: e, path: this.dbPath };
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

        this.db.prepare(`
          INSERT OR REPLACE INTO ledger_entries
          (id, dedupe_key, status, broker, source, created_at_ms, updated_at_ms, payload)
          VALUES (@id, @dedupe_key, @status, @broker, @source, @created_at_ms, @updated_at_ms, @payload)
        `).run({
          id: next.id,
          dedupe_key: next.dedupeKey || null,
          status: next.status || null,
          broker: next.broker || null,
          source: next.source || null,
          created_at_ms: next.createdAtMs,
          updated_at_ms: next.updatedAtMs,
          payload: toJson(next)
        });

        this._trimEntries();
        this._markDirty();
        return { ok: true, reserved: true, entry: next, path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async update({ id, patch } = {}) {
    return this._withLock(async () => {
      try {
        const key = String(id || '').trim();
        if (!key) return { ok: false, error: 'id is required.' };

        const row = this.db.prepare(`
          SELECT id, dedupe_key, status, broker, source, created_at_ms, updated_at_ms, payload
          FROM ledger_entries
          WHERE id = ?
          LIMIT 1
        `).get(key);

        if (!row) return { ok: false, error: 'Ledger entry not found.' };

        const prev = parseEntryRow(row) || {};
        const safePatch = patch && typeof patch === 'object' ? { ...patch } : {};
        delete safePatch.id;
        delete safePatch.createdAtMs;

        const next = {
          ...prev,
          ...normalizeEntry(safePatch),
          updatedAtMs: nowMs()
        };

        this.db.prepare(`
          UPDATE ledger_entries
          SET dedupe_key = @dedupe_key,
              status = @status,
              broker = @broker,
              source = @source,
              updated_at_ms = @updated_at_ms,
              payload = @payload
          WHERE id = @id
        `).run({
          id: key,
          dedupe_key: next.dedupeKey || null,
          status: next.status || null,
          broker: next.broker || null,
          source: next.source || null,
          updated_at_ms: next.updatedAtMs,
          payload: toJson(next)
        });

        this._markDirty();
        return { ok: true, entry: next, path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async list({ limit = 200 } = {}) {
    const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(5000, Math.floor(Number(limit)))) : 200;
    try {
      const rows = this.db.prepare(`
        SELECT id, dedupe_key, status, broker, source, created_at_ms, updated_at_ms, payload
        FROM ledger_entries
        ORDER BY created_at_ms DESC
        LIMIT ?
      `).all(lim);

      const entries = rows.map(parseEntryRow).filter(Boolean);
      return { ok: true, entries, path: this.dbPath };
    } catch (err) {
      const msg = redactErrorMessage(err?.message || String(err));
      this._lastError = msg;
      return { ok: false, error: msg, path: this.dbPath };
    }
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

    return { ok: true, entries: filtered.slice(0, lim), path: this.dbPath };
  }

  async addMemory(memory) {
    return this._withLock(async () => {
      try {
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

        this.db.prepare(`
          INSERT OR REPLACE INTO ledger_memories
          (id, type, text, created_at_ms, updated_at_ms, payload)
          VALUES (@id, @type, @text, @created_at_ms, @updated_at_ms, @payload)
        `).run({
          id: next.id,
          type: next.type,
          text: next.text,
          created_at_ms: next.createdAtMs,
          updated_at_ms: next.updatedAtMs,
          payload: toJson(next)
        });

        this._trimMemories();
        this._markDirty();
        return { ok: true, memory: next, path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async updateMemory({ id, patch } = {}) {
    return this._withLock(async () => {
      try {
        const key = String(id || '').trim();
        if (!key) return { ok: false, error: 'id is required.' };

        const row = this.db.prepare(`
          SELECT id, type, text, created_at_ms, updated_at_ms, payload
          FROM ledger_memories
          WHERE id = ?
          LIMIT 1
        `).get(key);

        if (!row) return { ok: false, error: 'Memory not found.' };

        const prev = parseMemoryRow(row) || {};
        const safePatch = patch && typeof patch === 'object' ? { ...patch } : {};
        delete safePatch.id;
        delete safePatch.createdAtMs;

        const next = { ...prev, ...safePatch, id: String(prev.id || key), updatedAtMs: nowMs() };
        if (safePatch.text != null) next.text = String(safePatch.text || '').trim();
        if (safePatch.type != null) next.type = String(safePatch.type || '').toUpperCase() === 'LOSS' ? 'LOSS' : 'WIN';
        if (safePatch.meta != null) {
          next.meta = safePatch.meta && typeof safePatch.meta === 'object' ? safePatch.meta : null;
        }

        const text = String(next.text || '').trim();
        if (!text) return { ok: false, error: 'Memory text is required.' };
        next.text = text;

        this.db.prepare(`
          UPDATE ledger_memories
          SET type = @type,
              text = @text,
              updated_at_ms = @updated_at_ms,
              payload = @payload
          WHERE id = @id
        `).run({
          id: next.id,
          type: next.type,
          text: next.text,
          updated_at_ms: next.updatedAtMs,
          payload: toJson(next)
        });

        this._markDirty();
        return { ok: true, memory: next, path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async deleteMemory({ id } = {}) {
    return this._withLock(async () => {
      try {
        const key = String(id || '').trim();
        if (!key) return { ok: false, error: 'id is required.' };

        const row = this.db.prepare(`
          SELECT id, type, text, created_at_ms, updated_at_ms, payload
          FROM ledger_memories
          WHERE id = ?
          LIMIT 1
        `).get(key);

        if (!row) return { ok: false, error: 'Memory not found.' };
        const removed = parseMemoryRow(row);

        this.db.prepare('DELETE FROM ledger_memories WHERE id = ?').run(key);
        this._markDirty();
        return { ok: true, memory: removed, path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async clearMemories() {
    return this._withLock(async () => {
      try {
        this.db.prepare('DELETE FROM ledger_memories').run();
        this._markDirty();
        return { ok: true, path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async listMemories({ limit = 200 } = {}) {
    const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(5000, Math.floor(Number(limit)))) : 200;
    try {
      const rows = this.db.prepare(`
        SELECT id, type, text, created_at_ms, updated_at_ms, payload
        FROM ledger_memories
        ORDER BY created_at_ms DESC
        LIMIT ?
      `).all(lim);

      const memories = rows.map(parseMemoryRow).filter(Boolean);
      return { ok: true, memories, path: this.dbPath };
    } catch (err) {
      const msg = redactErrorMessage(err?.message || String(err));
      this._lastError = msg;
      return { ok: false, error: msg, path: this.dbPath };
    }
  }

  async upsertAgentMemory(memory) {
    return this._withLock(async () => {
      try {
        const input = memory && typeof memory === 'object' ? { ...memory } : {};
        const key = input.key != null ? String(input.key).trim() : '';
        const id = input.id != null ? String(input.id).trim() : '';
        if (!key && !id) return { ok: false, error: 'Agent memory key or id is required.' };

        let row = null;
        if (key && id) {
          row = this.db.prepare('SELECT * FROM agent_memories WHERE key = ? OR id = ? LIMIT 1').get(key, id);
        } else if (key) {
          row = this.db.prepare('SELECT * FROM agent_memories WHERE key = ? LIMIT 1').get(key);
        } else {
          row = this.db.prepare('SELECT * FROM agent_memories WHERE id = ? LIMIT 1').get(id);
        }

        const prev = row ? parseAgentRow(row) : {};
        const now = nowMs();

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

        next.id = String(next.id || prev.id || `agent_${now}_${Math.random().toString(16).slice(2)}`);
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

        if (!next.key) next.key = next.id;
        if (!Array.isArray(next.tags)) next.tags = [];

        this.db.prepare(`
          INSERT OR REPLACE INTO agent_memories
          (id, key, family_key, kind, symbol, timeframe, summary, tags_json, payload_json, source, created_at_ms, updated_at_ms, last_accessed_at_ms)
          VALUES (@id, @key, @family_key, @kind, @symbol, @timeframe, @summary, @tags_json, @payload_json, @source, @created_at_ms, @updated_at_ms, @last_accessed_at_ms)
        `).run({
          id: next.id,
          key: next.key,
          family_key: next.familyKey,
          kind: next.kind,
          symbol: next.symbol,
          timeframe: next.timeframe,
          summary: next.summary,
          tags_json: toJson(next.tags) || '[]',
          payload_json: toJson(next),
          source: next.source,
          created_at_ms: next.createdAtMs,
          updated_at_ms: next.updatedAtMs,
          last_accessed_at_ms: next.lastAccessedAtMs
        });

        this._trimAgentMemories();
        this._markDirty();
        return { ok: true, memory: next, path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async getAgentMemory({ key, id, touch } = {}) {
    return this._withLock(async () => {
      try {
        const keyValue = String(key || '').trim();
        const idValue = String(id || '').trim();
        if (!keyValue && !idValue) return { ok: false, error: 'key or id is required.' };

        let row = null;
        if (keyValue) {
          row = this.db.prepare('SELECT * FROM agent_memories WHERE key = ? LIMIT 1').get(keyValue);
        }
        if (!row && idValue) {
          row = this.db.prepare('SELECT * FROM agent_memories WHERE id = ? LIMIT 1').get(idValue);
        }

        if (!row) return { ok: false, error: 'Agent memory not found.' };

        const entry = parseAgentRow(row);
        if (touch) {
          const now = nowMs();
          this.db.prepare('UPDATE agent_memories SET last_accessed_at_ms = ?, updated_at_ms = ? WHERE id = ?').run(
            now,
            now,
            entry.id
          );
          entry.lastAccessedAtMs = now;
          entry.updatedAtMs = now;
        }

        return { ok: true, memory: entry, path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async listAgentMemory({ limit = 50, symbol, timeframe, kind, tags } = {}) {
    try {
      const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(5000, Math.floor(Number(limit)))) : 50;
      const symbolKey = symbol != null ? String(symbol).trim().toLowerCase() : '';
      const timeframeKey = timeframe != null ? String(timeframe).trim().toLowerCase() : '';
      const kindKey = kind != null ? String(kind).trim().toLowerCase() : '';
      const tagFilters = normalizeTags(tags).map((tag) => tag.toLowerCase());

      const clauses = [];
      const params = [];

      if (symbolKey) {
        clauses.push('LOWER(symbol) = ?');
        params.push(symbolKey);
      }
      if (timeframeKey) {
        clauses.push('LOWER(timeframe) = ?');
        params.push(timeframeKey);
      }
      if (kindKey) {
        clauses.push('LOWER(kind) = ?');
        params.push(kindKey);
      }

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = this.db.prepare(`
        SELECT * FROM agent_memories
        ${where}
        ORDER BY updated_at_ms DESC
        LIMIT ?
      `).all(...params, lim * 5);

      const filtered = rows.map(parseAgentRow).filter(Boolean).filter((entry) => {
        if (tagFilters.length === 0) return true;
        const entryTags = Array.isArray(entry.tags)
          ? entry.tags.map((t) => String(t || '').trim().toLowerCase())
          : [];
        for (const tag of tagFilters) {
          if (!entryTags.includes(tag)) return false;
        }
        return true;
      });

      return { ok: true, memories: filtered.slice(0, lim), path: this.dbPath };
    } catch (err) {
      const msg = redactErrorMessage(err?.message || String(err));
      this._lastError = msg;
      return { ok: false, error: msg, path: this.dbPath };
    }
  }

  async createExperimentNote(note) {
    return this._withLock(async () => {
      try {
        const input = note && typeof note === 'object' ? { ...note } : {};
        const now = nowMs();
        const id = input.id || `exp_${now}_${Math.random().toString(16).slice(2)}`;
        const createdAtMs = Number.isFinite(Number(input.createdAtMs)) ? Number(input.createdAtMs) : now;
        const updatedAtMs = now;
        const tags = normalizeTags(input.tags);

        const payload = {
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

        this.db.prepare(`
          INSERT OR REPLACE INTO experiment_notes
          (id, symbol, timeframe, strategy, baseline_run_id, round1_session_id, round2_session_id, objective_preset, hypothesis, decision, tags_json, payload_json, created_at_ms, updated_at_ms)
          VALUES (@id, @symbol, @timeframe, @strategy, @baseline_run_id, @round1_session_id, @round2_session_id, @objective_preset, @hypothesis, @decision, @tags_json, @payload_json, @created_at_ms, @updated_at_ms)
        `).run({
          id: payload.id,
          symbol: payload.symbol,
          timeframe: payload.timeframe,
          strategy: payload.strategy,
          baseline_run_id: payload.baselineRunId,
          round1_session_id: payload.round1SessionId,
          round2_session_id: payload.round2SessionId,
          objective_preset: payload.objectivePreset,
          hypothesis: payload.hypothesis,
          decision: payload.decision,
          tags_json: toJson(tags) || '[]',
          payload_json: toJson(payload) || null,
          created_at_ms: payload.createdAtMs,
          updated_at_ms: payload.updatedAtMs
        });

        this._trimExperimentNotes();
        this._markDirty();
        return { ok: true, note: payload, path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async getExperimentNote({ id } = {}) {
    return this._withLock(async () => {
      try {
        const idValue = String(id || '').trim();
        if (!idValue) return { ok: false, error: 'id is required.' };
        const row = this.db.prepare('SELECT * FROM experiment_notes WHERE id = ? LIMIT 1').get(idValue);
        if (!row) return { ok: false, error: 'Experiment note not found.' };
        const entry = parseExperimentRow(row);
        return { ok: true, note: entry, path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async listExperimentNotes({ limit = 10, symbol, timeframe, strategy, tags } = {}) {
    try {
      const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(500, Math.floor(Number(limit)))) : 10;
      const symbolKey = symbol != null ? String(symbol).trim().toLowerCase() : '';
      const timeframeKey = timeframe != null ? String(timeframe).trim().toLowerCase() : '';
      const strategyKey = strategy != null ? String(strategy).trim().toLowerCase() : '';
      const tagFilters = normalizeTags(tags).map((tag) => tag.toLowerCase());

      const clauses = [];
      const params = [];

      if (symbolKey) {
        clauses.push('LOWER(symbol) = ?');
        params.push(symbolKey);
      }
      if (timeframeKey) {
        clauses.push('LOWER(timeframe) = ?');
        params.push(timeframeKey);
      }
      if (strategyKey) {
        clauses.push('LOWER(strategy) = ?');
        params.push(strategyKey);
      }

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = this.db.prepare(`
        SELECT * FROM experiment_notes
        ${where}
        ORDER BY updated_at_ms DESC
        LIMIT ?
      `).all(...params, lim * 5);

      const filtered = rows.map(parseExperimentRow).filter(Boolean).filter((entry) => {
        if (tagFilters.length === 0) return true;
        const entryTags = Array.isArray(entry.tags)
          ? entry.tags.map((t) => String(t || '').trim().toLowerCase())
          : [];
        for (const tag of tagFilters) {
          if (!entryTags.includes(tag)) return false;
        }
        return true;
      });

      return { ok: true, notes: filtered.slice(0, lim), path: this.dbPath };
    } catch (err) {
      const msg = redactErrorMessage(err?.message || String(err));
      this._lastError = msg;
      return { ok: false, error: msg, path: this.dbPath };
    }
  }

  async createOptimizerWinner(winner) {
    return this._withLock(async () => {
      try {
        const input = winner && typeof winner === 'object' ? { ...winner } : {};
        const now = nowMs();
        const sessionId = input.sessionId ? String(input.sessionId).trim() : '';
        const round = Number.isFinite(Number(input.round)) ? Number(input.round) : null;
        if (!sessionId || round == null) return { ok: false, error: 'sessionId and round are required.', path: this.dbPath };

        const params = input.params && typeof input.params === 'object' ? input.params : null;
        const metrics = input.metrics && typeof input.metrics === 'object' ? input.metrics : null;
        const paramsHash = input.paramsHash ? String(input.paramsHash) : null;
        const id = input.id || (paramsHash ? `winner_${sessionId}_${round}_${paramsHash}` : `winner_${now}_${Math.random().toString(16).slice(2)}`);
        const createdAtMs = Number.isFinite(Number(input.createdAtMs)) ? Number(input.createdAtMs) : now;

        const payload = {
          ...input,
          id: String(id),
          sessionId,
          round,
          symbol: input.symbol ? String(input.symbol).trim() : null,
          timeframe: input.timeframe ? String(input.timeframe).trim() : null,
          strategy: input.strategy ? String(input.strategy).trim() : null,
          paramsHash,
          params,
          metrics,
          createdAtMs
        };

        this.db.prepare(`
          INSERT OR REPLACE INTO optimizer_winners
          (id, session_id, round, symbol, timeframe, strategy, params_hash, params_json, metrics_json, created_at_ms)
          VALUES (@id, @session_id, @round, @symbol, @timeframe, @strategy, @params_hash, @params_json, @metrics_json, @created_at_ms)
        `).run({
          id: payload.id,
          session_id: payload.sessionId,
          round: payload.round,
          symbol: payload.symbol,
          timeframe: payload.timeframe,
          strategy: payload.strategy,
          params_hash: payload.paramsHash,
          params_json: toJson(payload.params) || null,
          metrics_json: toJson(payload.metrics) || null,
          created_at_ms: payload.createdAtMs
        });

        this._markDirty();
        return { ok: true, winner: payload, path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async getOptimizerWinner({ id } = {}) {
    return this._withLock(async () => {
      try {
        const idValue = String(id || '').trim();
        if (!idValue) return { ok: false, error: 'id is required.', path: this.dbPath };
        const row = this.db.prepare('SELECT * FROM optimizer_winners WHERE id = ? LIMIT 1').get(idValue);
        if (!row) return { ok: false, error: 'Optimizer winner not found.', path: this.dbPath };
        return { ok: true, winner: parseOptimizerWinnerRow(row), path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async getOptimizerWinnerBySessionRound({ sessionId, round } = {}) {
    return this._withLock(async () => {
      try {
        const sessionKey = String(sessionId || '').trim();
        const roundValue = Number.isFinite(Number(round)) ? Number(round) : null;
        if (!sessionKey || roundValue == null) {
          return { ok: false, error: 'sessionId and round are required.', path: this.dbPath };
        }
        const row = this.db.prepare('SELECT * FROM optimizer_winners WHERE session_id = ? AND round = ? ORDER BY created_at_ms DESC LIMIT 1')
          .get(sessionKey, roundValue);
        if (!row) return { ok: false, error: 'Optimizer winner not found.', path: this.dbPath };
        return { ok: true, winner: parseOptimizerWinnerRow(row), path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async listOptimizerWinners({ limit = 20, sessionId, symbol, timeframe, strategy, round } = {}) {
    try {
      const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(500, Math.floor(Number(limit)))) : 20;
      const sessionKey = sessionId != null ? String(sessionId).trim() : '';
      const symbolKey = symbol != null ? String(symbol).trim().toLowerCase() : '';
      const timeframeKey = timeframe != null ? String(timeframe).trim().toLowerCase() : '';
      const strategyKey = strategy != null ? String(strategy).trim().toLowerCase() : '';
      const roundValue = Number.isFinite(Number(round)) ? Number(round) : null;

      const clauses = [];
      const params = [];

      if (sessionKey) {
        clauses.push('session_id = ?');
        params.push(sessionKey);
      }
      if (roundValue != null) {
        clauses.push('round = ?');
        params.push(roundValue);
      }
      if (symbolKey) {
        clauses.push('LOWER(symbol) = ?');
        params.push(symbolKey);
      }
      if (timeframeKey) {
        clauses.push('LOWER(timeframe) = ?');
        params.push(timeframeKey);
      }
      if (strategyKey) {
        clauses.push('LOWER(strategy) = ?');
        params.push(strategyKey);
      }

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = this.db.prepare(`
        SELECT * FROM optimizer_winners
        ${where}
        ORDER BY created_at_ms DESC
        LIMIT ?
      `).all(...params, lim);
      const winners = rows.map(parseOptimizerWinnerRow).filter(Boolean);
      return { ok: true, winners, path: this.dbPath };
    } catch (err) {
      const msg = redactErrorMessage(err?.message || String(err));
      this._lastError = msg;
      return { ok: false, error: msg, path: this.dbPath };
    }
  }

  async createResearchSession(session) {
    return this._withLock(async () => {
      try {
        const input = session && typeof session === 'object' ? { ...session } : {};
        const now = nowMs();
        const id = input.sessionId || input.id || `research_${now}_${Math.random().toString(16).slice(2)}`;
        const createdAtMs = Number.isFinite(Number(input.createdAtMs)) ? Number(input.createdAtMs) : now;
        const updatedAtMs = now;
        const payload = {
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

        this.db.prepare(`
          INSERT OR REPLACE INTO research_sessions
          (session_id, status, symbol, timeframe, strategy, objective_preset, config_json, stats_json, created_at_ms, updated_at_ms)
          VALUES (@session_id, @status, @symbol, @timeframe, @strategy, @objective_preset, @config_json, @stats_json, @created_at_ms, @updated_at_ms)
        `).run({
          session_id: payload.sessionId,
          status: payload.status,
          symbol: payload.symbol,
          timeframe: payload.timeframe,
          strategy: payload.strategy,
          objective_preset: payload.objectivePreset,
          config_json: toJson(payload) || null,
          stats_json: toJson(payload.stats || null),
          created_at_ms: payload.createdAtMs,
          updated_at_ms: payload.updatedAtMs
        });

        this._markDirty();
        return { ok: true, session: payload, path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async getResearchSession({ sessionId } = {}) {
    return this._withLock(async () => {
      try {
        const id = String(sessionId || '').trim();
        if (!id) return { ok: false, error: 'sessionId is required.' };
        const row = this.db.prepare('SELECT * FROM research_sessions WHERE session_id = ? LIMIT 1').get(id);
        if (!row) return { ok: false, error: 'Research session not found.' };
        return { ok: true, session: parseResearchSessionRow(row), path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async listResearchSessions({ limit = 20, symbol, timeframe, strategy, status } = {}) {
    try {
      const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(200, Math.floor(Number(limit)))) : 20;
      const symbolKey = symbol != null ? String(symbol).trim().toLowerCase() : '';
      const timeframeKey = timeframe != null ? String(timeframe).trim().toLowerCase() : '';
      const strategyKey = strategy != null ? String(strategy).trim().toLowerCase() : '';
      const statusKey = status != null ? String(status).trim().toLowerCase() : '';

      const clauses = [];
      const params = [];
      if (symbolKey) {
        clauses.push('LOWER(symbol) = ?');
        params.push(symbolKey);
      }
      if (timeframeKey) {
        clauses.push('LOWER(timeframe) = ?');
        params.push(timeframeKey);
      }
      if (strategyKey) {
        clauses.push('LOWER(strategy) = ?');
        params.push(strategyKey);
      }
      if (statusKey) {
        clauses.push('LOWER(status) = ?');
        params.push(statusKey);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = this.db.prepare(`
        SELECT * FROM research_sessions
        ${where}
        ORDER BY updated_at_ms DESC
        LIMIT ?
      `).all(...params, lim);

      return { ok: true, sessions: rows.map(parseResearchSessionRow).filter(Boolean), path: this.dbPath };
    } catch (err) {
      const msg = redactErrorMessage(err?.message || String(err));
      this._lastError = msg;
      return { ok: false, error: msg, path: this.dbPath };
    }
  }

  async appendResearchStep({ sessionId, stepIndex, kind, payload } = {}) {
    return this._withLock(async () => {
      try {
        const id = `rstep_${nowMs()}_${Math.random().toString(16).slice(2)}`;
        const createdAtMs = nowMs();
        const sessionKey = String(sessionId || '').trim();
        if (!sessionKey) return { ok: false, error: 'sessionId is required.' };

        this.db.prepare(`
          INSERT OR REPLACE INTO research_steps
          (id, session_id, step_index, kind, payload_json, created_at_ms)
          VALUES (@id, @session_id, @step_index, @kind, @payload_json, @created_at_ms)
        `).run({
          id,
          session_id: sessionKey,
          step_index: Number.isFinite(Number(stepIndex)) ? Math.floor(Number(stepIndex)) : null,
          kind: kind ? String(kind).trim() : null,
          payload_json: toJson(payload || null),
          created_at_ms: createdAtMs
        });

        this._trimResearchSteps();
        this._markDirty();
        return { ok: true, step: { id, sessionId: sessionKey, stepIndex, kind, payload, createdAtMs }, path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async listResearchSteps({ sessionId, limit = 50 } = {}) {
    try {
      const sessionKey = String(sessionId || '').trim();
      if (!sessionKey) return { ok: false, error: 'sessionId is required.' };
      const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(500, Math.floor(Number(limit)))) : 50;
      const rows = this.db.prepare(`
        SELECT * FROM research_steps
        WHERE session_id = ?
        ORDER BY created_at_ms DESC
        LIMIT ?
      `).all(sessionKey, lim);
      return { ok: true, steps: rows.map(parseResearchStepRow).filter(Boolean), path: this.dbPath };
    } catch (err) {
      const msg = redactErrorMessage(err?.message || String(err));
      this._lastError = msg;
      return { ok: false, error: msg, path: this.dbPath };
    }
  }

  async createPlaybookRun(run) {
    return this._withLock(async () => {
      try {
        const input = run && typeof run === 'object' ? { ...run } : {};
        const now = nowMs();
        const runId = String(input.runId || input.id || `prun_${now}_${Math.random().toString(16).slice(2)}`);
        const startedAtMs = Number.isFinite(Number(input.startedAtMs)) ? Number(input.startedAtMs) : now;
        const updatedAtMs = now;
        const payload = {
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

        this.db.prepare(`
          INSERT OR REPLACE INTO playbook_runs
          (run_id, playbook_id, playbook_name, status, mode, symbol, timeframe, strategy, started_at_ms, finished_at_ms, current_step_id, current_action_id, current_step_index, error, payload_json, updated_at_ms)
          VALUES (@run_id, @playbook_id, @playbook_name, @status, @mode, @symbol, @timeframe, @strategy, @started_at_ms, @finished_at_ms, @current_step_id, @current_action_id, @current_step_index, @error, @payload_json, @updated_at_ms)
        `).run({
          run_id: payload.runId,
          playbook_id: payload.playbookId,
          playbook_name: payload.playbookName,
          status: payload.status,
          mode: payload.mode,
          symbol: payload.symbol,
          timeframe: payload.timeframe,
          strategy: payload.strategy,
          started_at_ms: payload.startedAtMs,
          finished_at_ms: payload.finishedAtMs,
          current_step_id: payload.currentStepId,
          current_action_id: payload.currentActionId,
          current_step_index: payload.currentStepIndex,
          error: payload.error,
          payload_json: toJson(payload) || null,
          updated_at_ms: payload.updatedAtMs
        });

        this._markDirty();
        return { ok: true, run: payload, path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async getPlaybookRun({ runId } = {}) {
    return this._withLock(async () => {
      try {
        const id = String(runId || '').trim();
        if (!id) return { ok: false, error: 'runId is required.' };
        const row = this.db.prepare('SELECT * FROM playbook_runs WHERE run_id = ? LIMIT 1').get(id);
        if (!row) return { ok: false, error: 'Playbook run not found.' };
        return { ok: true, run: parsePlaybookRunRow(row), path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async listPlaybookRuns({ limit = 20, status, playbookId, symbol, timeframe, strategy } = {}) {
    try {
      const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(200, Math.floor(Number(limit)))) : 20;
      const statusKey = status != null ? String(status).trim().toLowerCase() : '';
      const playbookKey = playbookId != null ? String(playbookId).trim().toLowerCase() : '';
      const symbolKey = symbol != null ? String(symbol).trim().toLowerCase() : '';
      const timeframeKey = timeframe != null ? String(timeframe).trim().toLowerCase() : '';
      const strategyKey = strategy != null ? String(strategy).trim().toLowerCase() : '';

      const clauses = [];
      const params = [];
      if (statusKey) {
        clauses.push('LOWER(status) = ?');
        params.push(statusKey);
      }
      if (playbookKey) {
        clauses.push('LOWER(playbook_id) = ?');
        params.push(playbookKey);
      }
      if (symbolKey) {
        clauses.push('LOWER(symbol) = ?');
        params.push(symbolKey);
      }
      if (timeframeKey) {
        clauses.push('LOWER(timeframe) = ?');
        params.push(timeframeKey);
      }
      if (strategyKey) {
        clauses.push('LOWER(strategy) = ?');
        params.push(strategyKey);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = this.db.prepare(`
        SELECT * FROM playbook_runs
        ${where}
        ORDER BY updated_at_ms DESC
        LIMIT ?
      `).all(...params, lim);

      return { ok: true, runs: rows.map(parsePlaybookRunRow).filter(Boolean), path: this.dbPath };
    } catch (err) {
      const msg = redactErrorMessage(err?.message || String(err));
      this._lastError = msg;
      return { ok: false, error: msg, path: this.dbPath };
    }
  }

  async getOptimizerEvalCache({ key, touch } = {}) {
    return this._withLock(async () => {
      try {
        const keyValue = String(key || '').trim();
        if (!keyValue) return { ok: false, error: 'key is required.' };
        const row = this.db.prepare('SELECT * FROM optimizer_eval_cache WHERE cache_key = ? LIMIT 1').get(keyValue);
        if (!row) return { ok: true, entry: null, path: this.dbPath };

        const now = nowMs();
        if (row.expires_at_ms && Number(row.expires_at_ms) <= now) {
          this.db.prepare('DELETE FROM optimizer_eval_cache WHERE cache_key = ?').run(keyValue);
          return { ok: true, entry: null, expired: true, path: this.dbPath };
        }

        if (touch) {
          this.db.prepare('UPDATE optimizer_eval_cache SET updated_at_ms = ? WHERE cache_key = ?').run(now, keyValue);
        }

        return { ok: true, entry: parseOptimizerCacheRow(row), path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async putOptimizerEvalCache({ key, payload, engineVersion, expiresAtMs } = {}) {
    return this._withLock(async () => {
      try {
        const keyValue = String(key || '').trim();
        if (!keyValue) return { ok: false, error: 'key is required.' };
        const now = nowMs();
        const expires = Number.isFinite(Number(expiresAtMs)) ? Math.floor(Number(expiresAtMs)) : null;
        this.db.prepare(`
          INSERT OR REPLACE INTO optimizer_eval_cache
          (cache_key, payload_json, created_at_ms, updated_at_ms, expires_at_ms, engine_version)
          VALUES (@cache_key, @payload_json, @created_at_ms, @updated_at_ms, @expires_at_ms, @engine_version)
        `).run({
          cache_key: keyValue,
          payload_json: toJson(payload) || null,
          created_at_ms: now,
          updated_at_ms: now,
          expires_at_ms: expires,
          engine_version: engineVersion ? String(engineVersion) : null
        });

        this._pruneOptimizerCache(now);
        this._trimOptimizerCache();
        return { ok: true, path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async pruneOptimizerEvalCache({ maxEntries } = {}) {
    return this._withLock(async () => {
      try {
        this._pruneOptimizerCache();
        if (Number.isFinite(Number(maxEntries))) {
          const lim = Math.max(1, Math.floor(Number(maxEntries)));
          const count = this.db.prepare('SELECT COUNT(*) AS count FROM optimizer_eval_cache').get().count;
          const overBy = Number(count || 0) - lim;
          if (overBy > 0) {
            this.db.prepare(`
              DELETE FROM optimizer_eval_cache
              WHERE cache_key IN (
                SELECT cache_key FROM optimizer_eval_cache
                ORDER BY updated_at_ms ASC
                LIMIT ?
              )
            `).run(overBy);
          }
        }
        return { ok: true, path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async deleteAgentMemory({ key, id } = {}) {
    return this._withLock(async () => {
      try {
        const keyValue = String(key || '').trim();
        const idValue = String(id || '').trim();
        if (!keyValue && !idValue) return { ok: false, error: 'key or id is required.' };

        let row = null;
        if (keyValue) {
          row = this.db.prepare('SELECT * FROM agent_memories WHERE key = ? LIMIT 1').get(keyValue);
        }
        if (!row && idValue) {
          row = this.db.prepare('SELECT * FROM agent_memories WHERE id = ? LIMIT 1').get(idValue);
        }

        if (!row) return { ok: false, error: 'Agent memory not found.' };

        const removed = parseAgentRow(row);
        this.db.prepare('DELETE FROM agent_memories WHERE id = ?').run(removed.id);
        this._markDirty();
        return { ok: true, memory: removed, path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async clearAgentMemory() {
    return this._withLock(async () => {
      try {
        this.db.prepare('DELETE FROM agent_memories').run();
        this._markDirty();
        return { ok: true, path: this.dbPath };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
  }

  async findRecent({ dedupeKey, windowMs = 60000, brokers } = {}) {
    try {
      const key = String(dedupeKey || '').trim();
      if (!key) return { ok: false, error: 'dedupeKey is required.' };

      const window = Number.isFinite(Number(windowMs)) ? Math.max(0, Math.floor(Number(windowMs))) : 60000;
      const brokerSet = Array.isArray(brokers) && brokers.length > 0 ? new Set(brokers.map((b) => String(b))) : null;
      const now = nowMs();

      const rows = this.db.prepare(`
        SELECT id, dedupe_key, status, broker, source, created_at_ms, updated_at_ms, payload
        FROM ledger_entries
        WHERE dedupe_key = ?
        ORDER BY created_at_ms DESC
        LIMIT 50
      `).all(key);

      for (const row of rows) {
        const e = parseEntryRow(row);
        if (!e) continue;
        if (brokerSet && !brokerSet.has(String(e.broker || ''))) continue;

        const createdAt = Number(e.createdAtMs) || 0;
        if (window > 0 && createdAt > 0 && now - createdAt > window) continue;

        const status = String(e.status || '').toUpperCase();
        if (status === 'REJECTED' || status === 'CANCELLED' || status === 'CANCELED' || status === 'CLOSED') continue;
        return { ok: true, found: true, entry: e, path: this.dbPath };
      }

      return { ok: true, found: false, entry: null, path: this.dbPath };
    } catch (err) {
      const msg = redactErrorMessage(err?.message || String(err));
      this._lastError = msg;
      return { ok: false, error: msg, path: this.dbPath };
    }
  }

  stats() {
    try {
      const entriesCount = this.db.prepare('SELECT COUNT(*) AS count FROM ledger_entries').get().count;
      const memoriesCount = this.db.prepare('SELECT COUNT(*) AS count FROM ledger_memories').get().count;
      const agentMemoryCount = this.db.prepare('SELECT COUNT(*) AS count FROM agent_memories').get().count;
      const experimentCount = this.db.prepare('SELECT COUNT(*) AS count FROM experiment_notes').get().count;
      const researchSessionCount = this.db.prepare('SELECT COUNT(*) AS count FROM research_sessions').get().count;
      const researchStepCount = this.db.prepare('SELECT COUNT(*) AS count FROM research_steps').get().count;
      const playbookRunCount = this.db.prepare('SELECT COUNT(*) AS count FROM playbook_runs').get().count;

      return {
        ok: true,
        path: this.dbPath,
        entriesCount: Number(entriesCount || 0),
        memoriesCount: Number(memoriesCount || 0),
        agentMemoryCount: Number(agentMemoryCount || 0),
        experimentCount: Number(experimentCount || 0),
        researchSessionCount: Number(researchSessionCount || 0),
        researchStepCount: Number(researchStepCount || 0),
        playbookRunCount: Number(playbookRunCount || 0),
        lastError: this._lastError || null,
        jsonPath: this.jsonPath,
        jsonMirrorAtMs: this._lastJsonMirrorAtMs || null,
        jsonMirrorError: this._lastJsonMirrorError || null,
        jsonMirrorDirty: !!this._jsonMirrorDirty,
        jsonMirrorInFlight: !!this._jsonMirrorInFlight,
        legacyAdoptedFrom: this._legacyAdoptedFrom || null
      };
    } catch (err) {
      const msg = redactErrorMessage(err?.message || String(err));
      this._lastError = msg;
      return { ok: false, error: msg, path: this.dbPath };
    }
  }

  flushSync() {
    try {
      this.db.pragma('wal_checkpoint(PASSIVE)');
      const mirror = this._writeJsonMirrorSync();
      return { ok: true, path: this.dbPath, flushed: true, mirror };
    } catch (err) {
      const msg = redactErrorMessage(err?.message || String(err));
      this._lastError = msg;
      return { ok: false, error: msg, path: this.dbPath };
    }
  }

  async flush() {
    return this.flushSync();
  }
}

module.exports = { TradeLedgerSqlite };
