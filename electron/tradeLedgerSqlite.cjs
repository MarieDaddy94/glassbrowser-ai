
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const LEDGER_DB_FILE = 'trade-ledger.sqlite';
const LEDGER_JSON_FILE = 'trade-ledger.json';
const LEDGER_SCHEMA_VERSION_KEY = 'schema_version';
const LEDGER_SCHEMA_VERSION_LATEST = 3;
const LEGACY_SIGNAL_HISTORY_BACKFILL_KEY = 'legacy_signal_history_materialized_v1';
const LEGACY_SIGNAL_CASE_REPAIR_KEY = 'legacy_signal_case_repair_v1';
const MAX_AGENT_MEMORIES = 5000;
const MAX_OPTIMIZER_CACHE = 20000;
const MAX_EXPERIMENT_NOTES = 2000;
const MAX_RESEARCH_STEPS = 20000;
const MAX_OPTIMIZER_WINNERS = 2000;
const MAX_PLAYBOOK_RUNS = 2000;
const MAX_RESEARCH_SESSIONS = 2000;
const AGENT_MEMORY_KIND_FLOORS = Object.freeze({
  academy_case: 2000,
  signal_history: 2000
});
const AGENT_MEMORY_KIND_CEILINGS = Object.freeze({
  chart_event: 500,
  action_trace: 250,
  unknown: 500
});
const NON_PRUNABLE_AGENT_MEMORY_KINDS = Object.freeze([
  'signal_entry',
  'signal_history',
  'academy_case',
  'academy_case_lock',
  'academy_lesson',
  'academy_symbol_learning'
]);

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

function normalizeKindValue(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw || null;
}

function normalizeOutcomeValue(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'WIN' || raw === 'LOSS' || raw === 'EXPIRED' || raw === 'REJECTED' || raw === 'FAILED') {
    return raw;
  }
  return null;
}

function normalizeAgentMemoryKindForRetention(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw || 'unknown';
}

function isResolvedOutcomeStatus(value) {
  return !!normalizeOutcomeValue(value);
}

function isLegacySignalKey(rawKey) {
  return /^signal_[a-z0-9]+$/i.test(String(rawKey || '').trim());
}

function extractSignalIdFromRawKey(rawKey) {
  const key = String(rawKey || '').trim();
  if (!key) return '';
  if (isLegacySignalKey(key)) return key;
  const prefixes = ['signal_entry:', 'academy_case:', 'signal_history:', 'signal_review:'];
  for (const prefix of prefixes) {
    if (key.startsWith(prefix)) {
      const signalId = key.slice(prefix.length).trim();
      if (signalId) return signalId;
    }
  }
  return '';
}

function resolveSignalIdentity(input) {
  const entry = input && typeof input === 'object' ? input : {};
  const payload = entry.payload && typeof entry.payload === 'object' ? entry.payload : null;
  const payloadSignalId = String(
    payload?.signalId ||
    payload?.id ||
    payload?.caseId ||
    entry.signalId ||
    entry.caseId ||
    ''
  ).trim();
  if (payloadSignalId) return payloadSignalId;
  const idSignal = extractSignalIdFromRawKey(entry.id || '');
  if (idSignal) return idSignal;
  return extractSignalIdFromRawKey(entry.key || '');
}

function canonicalAgentMemoryKey(kind, signalId, rawKey) {
  const kindKey = normalizeKindValue(kind);
  const key = String(rawKey || '').trim();
  const id = String(signalId || '').trim();
  if (!id) return key;
  if (kindKey === 'signal_entry') return `signal_entry:${id}`;
  if (kindKey === 'academy_case') return `academy_case:${id}`;
  if (kindKey === 'signal_history') return `signal_history:${id}`;
  return key;
}

function ensureSignalCasePayload(entry, signalId) {
  const kindKey = normalizeKindValue(entry?.kind);
  if (kindKey !== 'signal_entry' && kindKey !== 'academy_case') {
    return entry?.payload && typeof entry.payload === 'object' ? entry.payload : entry?.payload ?? null;
  }
  const payload =
    entry?.payload && typeof entry.payload === 'object'
      ? { ...entry.payload }
      : {};
  const sid = String(signalId || resolveSignalIdentity(entry) || '').trim();
  if (!payload.id && sid) payload.id = sid;
  if (!payload.signalId && sid) payload.signalId = sid;
  if (!payload.caseId && sid && kindKey === 'academy_case') payload.caseId = sid;
  if (payload.symbol == null && entry?.symbol != null) payload.symbol = entry.symbol;
  if (payload.timeframe == null && entry?.timeframe != null) payload.timeframe = entry.timeframe;
  if (payload.status == null && entry?.status != null) payload.status = entry.status;
  if (payload.outcome == null && entry?.outcome != null) payload.outcome = entry.outcome;
  if (payload.action == null && entry?.action != null) payload.action = entry.action;
  if (payload.entryPrice == null && entry?.entryPrice != null) payload.entryPrice = entry.entryPrice;
  if (payload.stopLoss == null && entry?.stopLoss != null) payload.stopLoss = entry.stopLoss;
  if (payload.takeProfit == null && entry?.takeProfit != null) payload.takeProfit = entry.takeProfit;
  if (payload.createdAtMs == null && Number.isFinite(Number(entry?.createdAtMs))) payload.createdAtMs = Number(entry.createdAtMs);
  if (payload.updatedAtMs == null && Number.isFinite(Number(entry?.updatedAtMs))) payload.updatedAtMs = Number(entry.updatedAtMs);
  if (payload.executedAtMs == null && Number.isFinite(Number(entry?.executedAtMs))) payload.executedAtMs = Number(entry.executedAtMs);
  if (payload.resolvedAtMs == null && Number.isFinite(Number(entry?.resolvedAtMs))) payload.resolvedAtMs = Number(entry.resolvedAtMs);
  if (payload.source == null && entry?.source != null) payload.source = entry.source;
  return payload;
}

function looksLikeAcademyCasePayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const actionKey = normalizeKindValue(payload.action || payload.side || payload.bias);
  const hasAction = actionKey === 'buy' || actionKey === 'sell';
  const hasResolvedStatus = !!normalizeOutcomeValue(payload.status || payload.outcome);
  const hasIdentityHint = !!normalizeKindValue(payload.caseId || payload.signalId || payload.id);
  const hasPriceHints =
    Number.isFinite(Number(payload.entryPrice ?? payload.entry ?? payload.openPrice)) ||
    Number.isFinite(Number(payload.stopLoss ?? payload.sl ?? payload.stop)) ||
    Number.isFinite(Number(payload.takeProfit ?? payload.tp ?? payload.target));
  const hasEnvelope = payload.resolvedOutcomeEnvelope && typeof payload.resolvedOutcomeEnvelope === 'object';
  const hasAttribution = payload.attribution && typeof payload.attribution === 'object';
  if (hasEnvelope || hasAttribution) return true;
  if (hasIdentityHint && (hasAction || hasResolvedStatus || hasPriceHints)) return true;
  if ((hasAction || hasResolvedStatus) && hasPriceHints) return true;
  return false;
}

function looksLikeAcademyLessonPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const title = String(payload.title || payload.lessonTitle || '').trim();
  const recommendedAction = String(payload.recommendedAction || '').trim();
  const appliesTo = payload.appliesTo && typeof payload.appliesTo === 'object' ? payload.appliesTo : null;
  const hasAppliesTo =
    !!String(appliesTo?.symbol || '').trim() ||
    !!String(appliesTo?.timeframe || '').trim() ||
    !!String(appliesTo?.strategyMode || '').trim() ||
    !!String(appliesTo?.executionMode || '').trim() ||
    !!String(appliesTo?.broker || '').trim();
  return !!title || !!recommendedAction || hasAppliesTo;
}

function inferAgentMemoryKind(input) {
  const entry = input && typeof input === 'object' ? input : {};
  const directKind = normalizeKindValue(entry.kind);
  if (directKind) return directKind;

  const payload = entry.payload && typeof entry.payload === 'object' ? entry.payload : null;
  const payloadKind = normalizeKindValue(payload?.kind);
  if (payloadKind) return payloadKind;

  const sourceKey = normalizeKindValue(entry.source || payload?.source);
  const keyRaw = String(entry.key || entry.id || '').trim();
  const key = keyRaw.toLowerCase();
  if (!key) return null;

  const prefixKinds = [
    'signal_entry',
    'signal_history',
    'signal_review',
    'academy_case',
    'academy_lesson',
    'academy_symbol_learning',
    'calendar_event',
    'calendar_rule',
    'agent_scorecard',
    'symbol_scope',
    'chart_event',
    'chart_watch',
    'chart_snapshot',
    'chart_context_pack',
    'context_pack',
    'setup_signal_transition',
    'setup_signal',
    'setup_library',
    'backtest_preset',
    'backtest_optimization',
    'backtest_optimization_run',
    'watch_profile',
    'action_flow',
    'action_trace',
    'task_playbook',
    'agent_test_scenario',
    'agent_test_run',
    'experiment_promotion'
  ];
  for (const prefix of prefixKinds) {
    if (key.startsWith(`${prefix}:`) || key.startsWith(`${prefix}_`)) {
      if (prefix === 'academy_lesson') {
        return looksLikeAcademyLessonPayload(payload) ? 'academy_lesson' : 'calendar_event';
      }
      return prefix;
    }
  }

  if (
    key.startsWith('signal_outcome_resolved:') ||
    key.startsWith('lesson_created:') ||
    key.startsWith('lesson_candidate:') ||
    key.startsWith('lesson_auto_accept:') ||
    key.startsWith('symbol_learning_updated:')
  ) {
    return 'calendar_event';
  }
  if (key.startsWith('academy_symbol_')) return 'academy_symbol_learning';
  if (key.startsWith('lesson_')) {
    return looksLikeAcademyLessonPayload(payload) ? 'academy_lesson' : 'calendar_event';
  }

  if (/^signal_[a-z0-9]+$/i.test(keyRaw)) {
    const statusKey = normalizeKindValue(entry.status || payload?.status || entry.outcome || payload?.outcome);
    if (statusKey === 'win' || statusKey === 'loss' || statusKey === 'expired' || statusKey === 'rejected' || statusKey === 'failed') {
      return 'signal_history';
    }
    if ((sourceKey === 'academy' || sourceKey === 'academy_analyst') && looksLikeAcademyCasePayload(payload)) {
      return 'academy_case';
    }
    const actionKey = normalizeKindValue(payload?.action || payload?.side || entry.action || entry.side);
    const hasPriceHints =
      Number.isFinite(Number(payload?.entryPrice ?? payload?.entry ?? payload?.openPrice)) ||
      Number.isFinite(Number(payload?.stopLoss ?? payload?.sl ?? payload?.stop)) ||
      Number.isFinite(Number(payload?.takeProfit ?? payload?.tp ?? payload?.target));
    const hasSignalHints = !!actionKey || hasPriceHints || !!normalizeKindValue(payload?.symbol || entry.symbol);
    if (hasSignalHints) return 'signal_entry';
    return null;
  }

  return null;
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
  if (entry.kind == null || String(entry.kind || '').trim() === '') {
    entry.kind = inferAgentMemoryKind(entry);
  }
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
    this._repairAgentMemoryKinds();
    this._materializeLegacySignalHistories();
    this._repairLegacySignalCaseRows();
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

      CREATE TABLE IF NOT EXISTS agent_memories_archive (
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
        last_accessed_at_ms INTEGER,
        archived_at_ms INTEGER
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memories_archive_key ON agent_memories_archive(key);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_archive_kind ON agent_memories_archive(kind);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_archive_updated ON agent_memories_archive(updated_at_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_archive_symbol_tf ON agent_memories_archive(symbol, timeframe);

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
      },
      3: () => {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS agent_memories_archive (
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
            last_accessed_at_ms INTEGER,
            archived_at_ms INTEGER
          );
          CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memories_archive_key ON agent_memories_archive(key);
          CREATE INDEX IF NOT EXISTS idx_agent_memories_archive_kind ON agent_memories_archive(kind);
          CREATE INDEX IF NOT EXISTS idx_agent_memories_archive_updated ON agent_memories_archive(updated_at_ms DESC);
          CREATE INDEX IF NOT EXISTS idx_agent_memories_archive_symbol_tf ON agent_memories_archive(symbol, timeframe);
        `);
        this.db.prepare(`
          INSERT OR REPLACE INTO ledger_migrations(id, applied_at_ms, note)
          VALUES (?, ?, ?)
        `).run('v3_archive_tier', nowMs(), 'Schema v3 archive table scaffold applied');
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
          const inferredKind = inferAgentMemoryKind(input);
          const payload = {
            ...input,
            id: String(id),
            key: input.key ? String(input.key).trim() : String(id),
            familyKey: input.familyKey ? String(input.familyKey).trim() : null,
            kind: input.kind ? String(input.kind).trim() : inferredKind,
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

  _repairAgentMemoryKinds() {
    try {
      const rows = this.db.prepare(`
        SELECT id, key, kind, source, payload_json
        FROM agent_memories
        WHERE kind IS NULL OR TRIM(kind) = ''
      `).all();
      if (!Array.isArray(rows) || rows.length === 0) return;

      const updates = [];
      for (const row of rows) {
        const payload = safeJsonParse(row.payload_json || '');
        const payloadObj = payload && typeof payload === 'object' ? { ...payload } : {};
        const inferred = inferAgentMemoryKind({
          ...payloadObj,
          id: payloadObj.id || row.id || null,
          key: payloadObj.key || row.key || null,
          source: payloadObj.source || row.source || null,
          payload: payloadObj.payload && typeof payloadObj.payload === 'object' ? payloadObj.payload : payloadObj.payload
        });
        if (!inferred) continue;

        if (payloadObj.kind == null || String(payloadObj.kind || '').trim() === '') {
          payloadObj.kind = inferred;
        }
        const payloadJson = toJson(payloadObj) || row.payload_json || null;
        updates.push({ id: row.id, kind: inferred, payloadJson });
      }

      if (updates.length === 0) return;

      const stmt = this.db.prepare(`
        UPDATE agent_memories
        SET kind = ?, payload_json = ?
        WHERE id = ?
      `);
      const tx = this.db.transaction((items) => {
        for (const item of items) {
          stmt.run(item.kind, item.payloadJson, item.id);
        }
      });
      tx(updates);
      this._markDirty();
    } catch {
      // best effort repair only
    }
  }

  _materializeLegacySignalHistories() {
    try {
      const marker = this.db.prepare('SELECT value FROM ledger_meta WHERE key = ? LIMIT 1').get(LEGACY_SIGNAL_HISTORY_BACKFILL_KEY);
      if (marker?.value) return;

      const legacyRows = this.db.prepare(`
        SELECT *
        FROM agent_memories
        WHERE key LIKE 'signal_outcome_resolved:%'
        ORDER BY updated_at_ms DESC
      `).all();

      const getSignalRow = this.db.prepare('SELECT * FROM agent_memories WHERE key = ? LIMIT 1');
      const hasCanonical = this.db.prepare('SELECT 1 FROM agent_memories WHERE key = ? LIMIT 1');
      const getLedgerRows = this.db.prepare(`
        SELECT payload, created_at_ms, updated_at_ms
        FROM ledger_entries
        WHERE payload LIKE ?
        ORDER BY updated_at_ms DESC
        LIMIT 50
      `);
      const insertAgent = this.db.prepare(`
        INSERT OR REPLACE INTO agent_memories
        (id, key, family_key, kind, symbol, timeframe, summary, tags_json, payload_json, source, created_at_ms, updated_at_ms, last_accessed_at_ms)
        VALUES (@id, @key, @family_key, @kind, @symbol, @timeframe, @summary, @tags_json, @payload_json, @source, @created_at_ms, @updated_at_ms, @last_accessed_at_ms)
      `);

      const inserts = [];
      for (const row of legacyRows) {
        const rawKey = String(row?.key || '').trim();
        if (!rawKey.startsWith('signal_outcome_resolved:')) continue;
        const signalId = String(rawKey.slice('signal_outcome_resolved:'.length) || '').trim();
        if (!signalId) continue;

        const canonicalKey = `signal_history:${signalId}`;
        if (hasCanonical.get(canonicalKey)) continue;

        const signalRow = getSignalRow.get(signalId);
        const signalMemory = signalRow ? parseAgentRow(signalRow) : null;
        const signalPayload = signalMemory?.payload && typeof signalMemory.payload === 'object' ? signalMemory.payload : {};

        const legacyPayloadRaw = safeJsonParse(row.payload_json || '');
        const legacyPayload = legacyPayloadRaw && typeof legacyPayloadRaw === 'object' ? legacyPayloadRaw : {};
        const legacySignal = legacyPayload.payload && typeof legacyPayload.payload === 'object' ? legacyPayload.payload : {};

        const ledgerRows = getLedgerRows.all(`%${signalId}%`);
        let ledgerMatch = null;
        for (const led of ledgerRows) {
          const parsed = safeJsonParse(led.payload || '');
          if (!parsed || typeof parsed !== 'object') continue;
          const ledPayload = parsed.payload && typeof parsed.payload === 'object' ? parsed.payload : null;
          const ledSignalId = String(parsed.signalId || ledPayload?.signalId || '').trim();
          if (ledSignalId !== signalId) continue;
          ledgerMatch = { parsed, ledPayload, createdAtMs: led.created_at_ms, updatedAtMs: led.updated_at_ms };
          break;
        }

        const outcome =
          normalizeOutcomeValue(legacySignal.outcome || legacySignal.status) ||
          normalizeOutcomeValue(legacyPayload.outcome || legacyPayload.status) ||
          normalizeOutcomeValue(ledgerMatch?.parsed?.outcome || ledgerMatch?.parsed?.status) ||
          normalizeOutcomeValue(ledgerMatch?.ledPayload?.outcome || ledgerMatch?.ledPayload?.status);

        const symbol = String(
          signalPayload.symbol ||
          signalMemory?.symbol ||
          legacySignal.symbol ||
          legacyPayload.symbol ||
          ledgerMatch?.parsed?.symbol ||
          ledgerMatch?.ledPayload?.symbol ||
          ''
        ).trim() || null;
        const timeframe = String(
          signalPayload.timeframe ||
          signalMemory?.timeframe ||
          legacySignal.timeframe ||
          legacyPayload.timeframe ||
          ledgerMatch?.parsed?.timeframe ||
          ledgerMatch?.ledPayload?.timeframe ||
          ''
        ).trim() || null;

        const actionRaw = String(
          signalPayload.action ||
          legacySignal.action ||
          legacyPayload.action ||
          ledgerMatch?.parsed?.action ||
          ledgerMatch?.ledPayload?.action ||
          ''
        ).trim().toUpperCase();
        const action = actionRaw === 'SELL' ? 'SELL' : 'BUY';

        const createdAtMs =
          Number.isFinite(Number(signalPayload.createdAtMs)) ? Number(signalPayload.createdAtMs) :
          Number.isFinite(Number(signalMemory?.createdAtMs)) ? Number(signalMemory.createdAtMs) :
          Number.isFinite(Number(legacySignal.createdAtMs)) ? Number(legacySignal.createdAtMs) :
          Number.isFinite(Number(legacyPayload.createdAtMs)) ? Number(legacyPayload.createdAtMs) :
          Number.isFinite(Number(ledgerMatch?.parsed?.createdAtMs)) ? Number(ledgerMatch.parsed.createdAtMs) :
          Number.isFinite(Number(ledgerMatch?.createdAtMs)) ? Number(ledgerMatch.createdAtMs) :
          Number.isFinite(Number(row.created_at_ms)) ? Number(row.created_at_ms) :
          nowMs();
        const resolvedAtMs =
          Number.isFinite(Number(legacySignal.resolvedAtMs)) ? Number(legacySignal.resolvedAtMs) :
          Number.isFinite(Number(legacyPayload.resolvedAtMs)) ? Number(legacyPayload.resolvedAtMs) :
          Number.isFinite(Number(ledgerMatch?.parsed?.resolvedAtMs)) ? Number(ledgerMatch.parsed.resolvedAtMs) :
          Number.isFinite(Number(ledgerMatch?.ledPayload?.resolvedAtMs)) ? Number(ledgerMatch.ledPayload.resolvedAtMs) :
          Number.isFinite(Number(row.updated_at_ms)) ? Number(row.updated_at_ms) :
          Number.isFinite(Number(ledgerMatch?.updatedAtMs)) ? Number(ledgerMatch.updatedAtMs) :
          createdAtMs;
        const executedAtMs =
          Number.isFinite(Number(signalPayload.executedAtMs)) ? Number(signalPayload.executedAtMs) :
          Number.isFinite(Number(legacySignal.executedAtMs)) ? Number(legacySignal.executedAtMs) :
          Number.isFinite(Number(legacyPayload.executedAtMs)) ? Number(legacyPayload.executedAtMs) :
          Number.isFinite(Number(ledgerMatch?.parsed?.executedAtMs)) ? Number(ledgerMatch.parsed.executedAtMs) :
          Number.isFinite(Number(ledgerMatch?.ledPayload?.executedAtMs)) ? Number(ledgerMatch.ledPayload.executedAtMs) :
          null;

        const entryPrice = Number(
          signalPayload.entryPrice ??
          legacySignal.entryPrice ??
          legacyPayload.entryPrice ??
          ledgerMatch?.parsed?.entryPrice ??
          ledgerMatch?.ledPayload?.entryPrice
        );
        const stopLoss = Number(
          signalPayload.stopLoss ??
          legacySignal.stopLoss ??
          legacyPayload.stopLoss ??
          ledgerMatch?.parsed?.stopLoss ??
          ledgerMatch?.ledPayload?.stopLoss
        );
        const takeProfit = Number(
          signalPayload.takeProfit ??
          legacySignal.takeProfit ??
          legacyPayload.takeProfit ??
          ledgerMatch?.parsed?.takeProfit ??
          ledgerMatch?.ledPayload?.takeProfit
        );
        const score = Number(
          signalPayload.score ??
          legacySignal.score ??
          legacyPayload.score ??
          ledgerMatch?.parsed?.score ??
          ledgerMatch?.ledPayload?.score
        );
        const exitPrice = Number(
          legacySignal.exitPrice ??
          legacyPayload.exitPrice ??
          ledgerMatch?.parsed?.exitPrice ??
          ledgerMatch?.ledPayload?.exitPrice
        );
        const durationMs = Number(
          legacySignal.durationMs ??
          legacyPayload.durationMs ??
          ledgerMatch?.parsed?.durationMs ??
          ledgerMatch?.ledPayload?.durationMs
        );
        const barsToOutcome = Number(
          legacySignal.barsToOutcome ??
          legacyPayload.barsToOutcome ??
          ledgerMatch?.parsed?.barsToOutcome ??
          ledgerMatch?.ledPayload?.barsToOutcome
        );

        const id = `agent_${resolvedAtMs}_${Math.random().toString(16).slice(2)}`;
        const payload = {
          id,
          key: canonicalKey,
          familyKey: null,
          kind: 'signal_history',
          symbol,
          timeframe,
          summary: outcome ? `${outcome} ${symbol || ''}`.trim() : null,
          source: 'legacy_backfill',
          tags: ['legacy_backfill', 'signal_history'],
          createdAtMs,
          updatedAtMs: resolvedAtMs,
          lastAccessedAtMs: null,
          payload: {
            signalId,
            symbol,
            timeframe,
            action,
            entryPrice: Number.isFinite(entryPrice) ? entryPrice : null,
            stopLoss: Number.isFinite(stopLoss) ? stopLoss : null,
            takeProfit: Number.isFinite(takeProfit) ? takeProfit : null,
            score: Number.isFinite(score) ? score : null,
            status: outcome,
            outcome,
            createdAtMs,
            executedAtMs: Number.isFinite(Number(executedAtMs)) ? Number(executedAtMs) : null,
            resolvedAtMs,
            durationMs: Number.isFinite(durationMs) ? durationMs : null,
            barsToOutcome: Number.isFinite(barsToOutcome) ? barsToOutcome : null,
            exitPrice: Number.isFinite(exitPrice) ? exitPrice : null,
            outcomeSource: 'legacy_signal_outcome_resolved'
          }
        };

        inserts.push(payload);
      }

      const tx = this.db.transaction((items) => {
        for (const item of items) {
          insertAgent.run({
            id: item.id,
            key: item.key,
            family_key: item.familyKey,
            kind: item.kind,
            symbol: item.symbol,
            timeframe: item.timeframe,
            summary: item.summary,
            tags_json: toJson(item.tags) || '[]',
            payload_json: toJson(item),
            source: item.source,
            created_at_ms: item.createdAtMs,
            updated_at_ms: item.updatedAtMs,
            last_accessed_at_ms: item.lastAccessedAtMs
          });
        }
        this.db.prepare('INSERT OR REPLACE INTO ledger_meta(key, value) VALUES (?, ?)').run(
          LEGACY_SIGNAL_HISTORY_BACKFILL_KEY,
          toJson({ appliedAtMs: nowMs(), inserted: items.length }) || String(nowMs())
        );
      });
      tx(inserts);

      if (inserts.length > 0) {
        this._markDirty();
      }
    } catch {
      // best effort backfill only
    }
  }

  _repairLegacySignalCaseRows() {
    try {
      const marker = this.db
        .prepare('SELECT value FROM ledger_meta WHERE key = ? LIMIT 1')
        .get(LEGACY_SIGNAL_CASE_REPAIR_KEY);
      if (marker?.value) return;

      const rows = this.db.prepare(`
        SELECT *
        FROM agent_memories
        WHERE kind IN ('signal_entry', 'academy_case')
          AND key LIKE 'signal_%'
        ORDER BY updated_at_ms DESC
      `).all();

      const getCanonical = this.db.prepare('SELECT * FROM agent_memories WHERE key = ? LIMIT 1');
      const getSignalHistory = this.db.prepare(`
        SELECT *
        FROM agent_memories
        WHERE kind = 'signal_history'
        ORDER BY updated_at_ms DESC
      `);
      const insertAgent = this.db.prepare(`
        INSERT OR REPLACE INTO agent_memories
        (id, key, family_key, kind, symbol, timeframe, summary, tags_json, payload_json, source, created_at_ms, updated_at_ms, last_accessed_at_ms)
        VALUES (@id, @key, @family_key, @kind, @symbol, @timeframe, @summary, @tags_json, @payload_json, @source, @created_at_ms, @updated_at_ms, @last_accessed_at_ms)
      `);

      const historyBySignalId = new Map();
      for (const row of getSignalHistory.all()) {
        const parsed = parseAgentRow(row);
        if (!parsed) continue;
        const signalId = resolveSignalIdentity(parsed);
        if (!signalId || historyBySignalId.has(signalId)) continue;
        const outcome = normalizeOutcomeValue(parsed?.payload?.outcome || parsed?.payload?.status || parsed?.outcome || parsed?.status);
        if (!outcome) continue;
        historyBySignalId.set(signalId, parsed);
      }

      const normalizeAction = (value, fallbackEntryPrice, fallbackStopLoss) => {
        const raw = String(value || '').trim().toUpperCase();
        if (raw === 'BUY' || raw === 'SELL') return raw;
        const entry = Number(fallbackEntryPrice);
        const stop = Number(fallbackStopLoss);
        if (Number.isFinite(entry) && Number.isFinite(stop)) {
          return stop < entry ? 'BUY' : 'SELL';
        }
        return 'BUY';
      };
      const firstFinite = (...values) => {
        for (const value of values) {
          const num = Number(value);
          if (Number.isFinite(num)) return num;
        }
        return null;
      };
      const preferString = (...values) => {
        for (const value of values) {
          const text = String(value || '').trim();
          if (text) return text;
        }
        return null;
      };

      const updates = [];
      for (const row of rows) {
        const legacy = parseAgentRow(row);
        if (!legacy) continue;
        const kind = normalizeKindValue(legacy.kind || inferAgentMemoryKind(legacy));
        if (kind !== 'signal_entry' && kind !== 'academy_case') continue;

        const signalId = resolveSignalIdentity(legacy);
        if (!signalId) continue;

        const canonicalKey = canonicalAgentMemoryKey(kind, signalId, legacy.key);
        if (!canonicalKey) continue;

        const history = historyBySignalId.get(signalId) || null;
        const historyPayload = history?.payload && typeof history.payload === 'object' ? history.payload : {};
        const legacyPayload =
          legacy.payload && typeof legacy.payload === 'object'
            ? { ...legacy.payload }
            : {};

        if (kind === 'academy_case') {
          const resolvedStatus = normalizeOutcomeValue(
            historyPayload?.outcome ||
            historyPayload?.status ||
            legacyPayload?.outcome ||
            legacyPayload?.status ||
            legacy?.outcome ||
            legacy?.status
          );
          if (!resolvedStatus) continue;
        }

        const entryPrice = firstFinite(
          legacyPayload.entryPrice, legacyPayload.entry, legacyPayload.openPrice,
          historyPayload.entryPrice, historyPayload.entry, historyPayload.openPrice
        );
        const stopLoss = firstFinite(
          legacyPayload.stopLoss, legacyPayload.sl, legacyPayload.stop,
          historyPayload.stopLoss, historyPayload.sl, historyPayload.stop
        );
        const takeProfit = firstFinite(
          legacyPayload.takeProfit, legacyPayload.tp, legacyPayload.target,
          historyPayload.takeProfit, historyPayload.tp, historyPayload.target
        );

        const action = normalizeAction(
          legacyPayload.action || legacyPayload.side || historyPayload.action || historyPayload.side,
          entryPrice,
          stopLoss
        );
        const outcome = normalizeOutcomeValue(
          historyPayload?.outcome ||
          historyPayload?.status ||
          legacyPayload?.outcome ||
          legacyPayload?.status ||
          legacy?.outcome ||
          legacy?.status
        );
        const createdAtMs = firstFinite(
          legacyPayload.createdAtMs, historyPayload.createdAtMs, legacy.createdAtMs, row.created_at_ms
        );
        const executedAtMs = firstFinite(
          legacyPayload.executedAtMs, historyPayload.executedAtMs, legacy.executedAtMs
        );
        const resolvedAtMs = firstFinite(
          legacyPayload.resolvedAtMs, historyPayload.resolvedAtMs, legacy.resolvedAtMs, legacy.updatedAtMs, row.updated_at_ms
        );

        const payload = {
          ...legacyPayload,
          ...historyPayload,
          id: signalId,
          signalId,
          caseId: kind === 'academy_case' ? signalId : (legacyPayload.caseId || historyPayload.caseId || null),
          action,
          status: outcome || (legacyPayload.status ?? historyPayload.status ?? legacy.status ?? null),
          outcome: outcome || (legacyPayload.outcome ?? historyPayload.outcome ?? legacy.outcome ?? null),
          symbol: preferString(legacyPayload.symbol, historyPayload.symbol, legacy.symbol, row.symbol),
          timeframe: preferString(legacyPayload.timeframe, historyPayload.timeframe, legacy.timeframe, row.timeframe),
          entryPrice,
          stopLoss,
          takeProfit,
          createdAtMs,
          executedAtMs,
          resolvedAtMs,
          source: preferString(legacyPayload.source, historyPayload.source, legacy.source, row.source) || 'legacy_repair'
        };

        const normalizedNext = {
          ...legacy,
          id: String(legacy.id || row.id || `agent_${nowMs()}_${Math.random().toString(16).slice(2)}`),
          key: canonicalKey,
          kind,
          symbol: payload.symbol || legacy.symbol || null,
          timeframe: payload.timeframe || legacy.timeframe || null,
          summary: String(
            legacy.summary ||
            `${String(payload.outcome || payload.status || kind).toUpperCase()} ${payload.symbol || ''}`.trim()
          ).trim() || null,
          source: payload.source || legacy.source || null,
          payload,
          tags: normalizeTags([
            ...(Array.isArray(legacy.tags) ? legacy.tags : []),
            kind,
            'legacy_repair'
          ]),
          createdAtMs: Number.isFinite(Number(createdAtMs)) ? Number(createdAtMs) : Number(legacy.createdAtMs || row.created_at_ms || nowMs()),
          updatedAtMs: Number.isFinite(Number(resolvedAtMs)) ? Number(resolvedAtMs) : Number(legacy.updatedAtMs || row.updated_at_ms || nowMs()),
          lastAccessedAtMs: Number.isFinite(Number(legacy.lastAccessedAtMs)) ? Number(legacy.lastAccessedAtMs) : null
        };

        const existingRow = getCanonical.get(canonicalKey);
        if (existingRow) {
          const existing = parseAgentRow(existingRow) || {};
          const existingPayload = existing.payload && typeof existing.payload === 'object' ? existing.payload : {};
          const merged = {
            ...existing,
            ...normalizedNext,
            id: String(existing.id || normalizedNext.id),
            key: canonicalKey,
            kind,
            payload: {
              ...existingPayload,
              ...normalizedNext.payload
            },
            tags: normalizeTags([
              ...(Array.isArray(existing.tags) ? existing.tags : []),
              ...(Array.isArray(normalizedNext.tags) ? normalizedNext.tags : [])
            ]),
            createdAtMs: Math.min(
              Number.isFinite(Number(existing.createdAtMs)) ? Number(existing.createdAtMs) : Number.MAX_SAFE_INTEGER,
              Number.isFinite(Number(normalizedNext.createdAtMs)) ? Number(normalizedNext.createdAtMs) : Number.MAX_SAFE_INTEGER
            )
          };
          if (!Number.isFinite(Number(merged.createdAtMs)) || merged.createdAtMs >= Number.MAX_SAFE_INTEGER) {
            merged.createdAtMs = normalizedNext.createdAtMs;
          }
          merged.updatedAtMs = Math.max(
            Number.isFinite(Number(existing.updatedAtMs)) ? Number(existing.updatedAtMs) : 0,
            Number.isFinite(Number(normalizedNext.updatedAtMs)) ? Number(normalizedNext.updatedAtMs) : 0
          ) || normalizedNext.updatedAtMs;
          updates.push(merged);
        } else {
          updates.push(normalizedNext);
        }
      }

      const tx = this.db.transaction((items) => {
        for (const item of items) {
          insertAgent.run({
            id: item.id,
            key: item.key,
            family_key: item.familyKey || null,
            kind: item.kind,
            symbol: item.symbol || null,
            timeframe: item.timeframe || null,
            summary: item.summary || null,
            tags_json: toJson(Array.isArray(item.tags) ? item.tags : []) || '[]',
            payload_json: toJson(item),
            source: item.source || null,
            created_at_ms: Number.isFinite(Number(item.createdAtMs)) ? Number(item.createdAtMs) : nowMs(),
            updated_at_ms: Number.isFinite(Number(item.updatedAtMs)) ? Number(item.updatedAtMs) : nowMs(),
            last_accessed_at_ms: Number.isFinite(Number(item.lastAccessedAtMs)) ? Number(item.lastAccessedAtMs) : null
          });
        }
        this.db.prepare('INSERT OR REPLACE INTO ledger_meta(key, value) VALUES (?, ?)').run(
          LEGACY_SIGNAL_CASE_REPAIR_KEY,
          toJson({
            appliedAtMs: nowMs(),
            scanned: rows.length,
            repaired: items.length
          }) || String(nowMs())
        );
      });
      tx(updates);

      if (updates.length > 0) {
        this._markDirty();
      }
    } catch {
      // best effort repair only
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
    const kindExpr = "LOWER(TRIM(COALESCE(kind, '')))";
    const countRows = () => {
      const row = this.db.prepare('SELECT COUNT(*) AS count FROM agent_memories').get();
      return Number(row?.count || 0);
    };
    const deleteOldestByFilter = (whereClause, params, limit) => {
      const boundedLimit = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : 0;
      if (boundedLimit <= 0) return 0;
      const sql = `
        DELETE FROM agent_memories
        WHERE id IN (
          SELECT id FROM agent_memories
          ${whereClause ? `WHERE ${whereClause}` : ''}
          ORDER BY updated_at_ms ASC, created_at_ms ASC, id ASC
          LIMIT ?
        )
      `;
      const runArgs = [...params, boundedLimit];
      const res = this.db.prepare(sql).run(...runArgs);
      return Number(res?.changes || 0);
    };

    let overBy = countRows() - MAX_AGENT_MEMORIES;
    if (overBy <= 0) return;

    // Step A: enforce noisy-kind ceilings first.
    for (const [kindKey, ceilingRaw] of Object.entries(AGENT_MEMORY_KIND_CEILINGS)) {
      const ceiling = Number.isFinite(Number(ceilingRaw)) ? Math.max(0, Math.floor(Number(ceilingRaw))) : 0;
      if (ceiling < 0) continue;
      let whereClause = `${kindExpr} = ?`;
      let params = [kindKey];
      if (kindKey === 'unknown') {
        whereClause = `${kindExpr} = ''`;
        params = [];
      }
      const countRow = this.db.prepare(`SELECT COUNT(*) AS count FROM agent_memories WHERE ${whereClause}`).get(...params);
      const countForKind = Number(countRow?.count || 0);
      const excess = countForKind - ceiling;
      if (excess > 0) {
        deleteOldestByFilter(whereClause, params, excess);
      }
    }

    overBy = countRows() - MAX_AGENT_MEMORIES;
    if (overBy <= 0) return;

    // Step B: if still over cap, trim oldest rows from kinds outside protected/no-prune sets.
    const protectedKinds = Object.keys(AGENT_MEMORY_KIND_FLOORS).map((kind) => String(kind).trim().toLowerCase()).filter(Boolean);
    const nonPrunableKinds = NON_PRUNABLE_AGENT_MEMORY_KINDS.map((kind) => String(kind).trim().toLowerCase()).filter(Boolean);
    const excludedKinds = Array.from(new Set([...protectedKinds, ...nonPrunableKinds]));
    if (excludedKinds.length > 0) {
      const placeholders = excludedKinds.map(() => '?').join(', ');
      deleteOldestByFilter(`${kindExpr} NOT IN (${placeholders})`, excludedKinds, overBy);
    } else {
      deleteOldestByFilter('', [], overBy);
    }

    overBy = countRows() - MAX_AGENT_MEMORIES;
    if (overBy <= 0) return;

    // Step C: if still over, trim protected kinds above floor budgets, excluding no-prune kinds.
    const floorEligibleKinds = protectedKinds.filter((kind) => !nonPrunableKinds.includes(kind));
    if (floorEligibleKinds.length > 0) {
      const placeholders = floorEligibleKinds.map(() => '?').join(', ');
      const protectedRows = this.db.prepare(`
        SELECT id, kind, updated_at_ms, created_at_ms
        FROM agent_memories
        WHERE ${kindExpr} IN (${placeholders})
        ORDER BY updated_at_ms DESC, created_at_ms DESC, id DESC
      `).all(...floorEligibleKinds);
      const keptByKind = new Map();
      const floorCandidates = [];
      for (const row of protectedRows) {
        const kindKey = normalizeAgentMemoryKindForRetention(row?.kind);
        const floor = Number.isFinite(Number(AGENT_MEMORY_KIND_FLOORS[kindKey]))
          ? Math.max(0, Math.floor(Number(AGENT_MEMORY_KIND_FLOORS[kindKey])))
          : 0;
        const seen = Number(keptByKind.get(kindKey) || 0) + 1;
        keptByKind.set(kindKey, seen);
        if (seen > floor) {
          floorCandidates.push(row);
        }
      }
      floorCandidates.sort((a, b) => {
        const aTime = Number(a?.updated_at_ms || a?.created_at_ms || 0) || 0;
        const bTime = Number(b?.updated_at_ms || b?.created_at_ms || 0) || 0;
        if (aTime !== bTime) return aTime - bTime;
        return String(a?.id || '').localeCompare(String(b?.id || ''));
      });
      const deleteIds = floorCandidates
        .slice(0, overBy)
        .map((row) => String(row?.id || '').trim())
        .filter(Boolean);
      if (deleteIds.length > 0) {
        const deletePlaceholders = deleteIds.map(() => '?').join(', ');
        this.db.prepare(`DELETE FROM agent_memories WHERE id IN (${deletePlaceholders})`).run(...deleteIds);
      }
    }

    overBy = countRows() - MAX_AGENT_MEMORIES;
    if (overBy <= 0) return;

    // Step D: emergency fallback trim only from non-no-prune kinds.
    if (nonPrunableKinds.length > 0) {
      const placeholders = nonPrunableKinds.map(() => '?').join(', ');
      deleteOldestByFilter(`${kindExpr} NOT IN (${placeholders})`, nonPrunableKinds, overBy);
    } else {
      deleteOldestByFilter('', [], overBy);
    }

    overBy = countRows() - MAX_AGENT_MEMORIES;
    if (overBy > 0) {
      console.warn('[agent_memory_trim_skipped_non_prunable]', {
        overBy,
        maxRows: MAX_AGENT_MEMORIES
      });
    }
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

        let next = { ...prev };
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
        if (next.kind == null || String(next.kind || '').trim() === '') {
          const inferredKind = inferAgentMemoryKind({
            ...next,
            key: next.key,
            id: next.id,
            source: next.source,
            payload: next.payload
          });
          if (inferredKind) next.kind = inferredKind;
        }
        const signalId = resolveSignalIdentity(next);
        const canonicalKey = canonicalAgentMemoryKey(next.kind, signalId, next.key);
        if (canonicalKey) {
          next.key = canonicalKey;
        }
        if (
          next.payload == null &&
          (normalizeKindValue(next.kind) === 'signal_entry' || normalizeKindValue(next.kind) === 'academy_case')
        ) {
          next.payload = ensureSignalCasePayload(next, signalId);
        } else if (
          next.payload &&
          typeof next.payload === 'object' &&
          (normalizeKindValue(next.kind) === 'signal_entry' || normalizeKindValue(next.kind) === 'academy_case')
        ) {
          next.payload = ensureSignalCasePayload(next, signalId);
        }

        if (!row || String(row?.key || '').trim() !== String(next.key || '').trim()) {
          const canonicalRow = this.db.prepare('SELECT * FROM agent_memories WHERE key = ? LIMIT 1').get(next.key);
          if (canonicalRow) {
            const canonicalPrev = parseAgentRow(canonicalRow) || {};
            next = {
              ...canonicalPrev,
              ...next,
              key: next.key,
              kind: next.kind || canonicalPrev.kind,
              payload: next.payload ?? canonicalPrev.payload ?? null,
              tags: normalizeTags([...(Array.isArray(canonicalPrev.tags) ? canonicalPrev.tags : []), ...(Array.isArray(next.tags) ? next.tags : [])]),
              createdAtMs: Math.min(
                Number.isFinite(Number(canonicalPrev.createdAtMs)) ? Number(canonicalPrev.createdAtMs) : Number.MAX_SAFE_INTEGER,
                Number.isFinite(Number(next.createdAtMs)) ? Number(next.createdAtMs) : Number.MAX_SAFE_INTEGER
              )
            };
            if (!Number.isFinite(Number(next.createdAtMs)) || Number(next.createdAtMs) >= Number.MAX_SAFE_INTEGER) {
              next.createdAtMs = now;
            }
            next.updatedAtMs = now;
          }
        }

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
        this.db.prepare(`
          DELETE FROM agent_memories_archive
          WHERE id = ? OR key = ?
        `).run(next.id, next.key);

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

  async listAgentMemory({ limit = 50, symbol, timeframe, kind, tags, updatedAfterMs, includeArchived } = {}) {
    try {
      const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(50000, Math.floor(Number(limit)))) : 50;
      const symbolKey = symbol != null ? String(symbol).trim().toLowerCase() : '';
      const timeframeKey = timeframe != null ? String(timeframe).trim().toLowerCase() : '';
      const kindKey = kind != null ? String(kind).trim().toLowerCase() : '';
      const tagFilters = normalizeTags(tags).map((tag) => tag.toLowerCase());
      const updatedAfter = Number.isFinite(Number(updatedAfterMs))
        ? Math.max(0, Math.floor(Number(updatedAfterMs)))
        : 0;
      const includeArchiveRows = includeArchived === true;

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

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const fetchLimit = Math.min(50000, Math.max(lim, lim * (kindKey ? 25 : 5)));
      const activeRows = this.db.prepare(`
        SELECT * FROM agent_memories
        ${where}
        ORDER BY updated_at_ms DESC
        LIMIT ?
      `).all(...params, fetchLimit);
      const archiveRows = includeArchiveRows
        ? this.db.prepare(`
            SELECT * FROM agent_memories_archive
            ${where}
            ORDER BY updated_at_ms DESC
            LIMIT ?
          `).all(...params, fetchLimit)
        : [];
      const rows = [...activeRows, ...archiveRows];

      const filtered = rows.map(parseAgentRow).filter(Boolean).filter((entry) => {
        if (kindKey) {
          const entryKind = normalizeKindValue(entry.kind || inferAgentMemoryKind(entry));
          if (entryKind !== kindKey) return false;
        }
        if (updatedAfter > 0) {
          const updatedAt = Number(entry.updatedAtMs || entry.createdAtMs || 0) || 0;
          if (!updatedAt || updatedAt <= updatedAfter) return false;
        }
        if (tagFilters.length === 0) return true;
        const entryTags = Array.isArray(entry.tags)
          ? entry.tags.map((t) => String(t || '').trim().toLowerCase())
          : [];
        for (const tag of tagFilters) {
          if (!entryTags.includes(tag)) return false;
        }
        return true;
      });

      const deduped = new Map();
      for (const entry of filtered) {
        const identityKey = String(entry?.key || entry?.id || '').trim();
        if (!identityKey) continue;
        const existing = deduped.get(identityKey);
        if (!existing) {
          deduped.set(identityKey, entry);
          continue;
        }
        const existingTime = Number(existing?.updatedAtMs || existing?.createdAtMs || 0) || 0;
        const nextTime = Number(entry?.updatedAtMs || entry?.createdAtMs || 0) || 0;
        if (nextTime >= existingTime) {
          deduped.set(identityKey, entry);
        }
      }
      const dedupedList = Array.from(deduped.values());
      dedupedList.sort((a, b) => (Number(b?.updatedAtMs || b?.createdAtMs || 0) - Number(a?.updatedAtMs || a?.createdAtMs || 0)));
      return { ok: true, memories: dedupedList.slice(0, lim), path: this.dbPath };
    } catch (err) {
      const msg = redactErrorMessage(err?.message || String(err));
      this._lastError = msg;
      return { ok: false, error: msg, path: this.dbPath };
    }
  }

  async archiveAgentMemories({ cutoffMs, kinds, keepRecentPerKind = 0, keepLocked = true } = {}) {
    return this._withLock(async () => {
      try {
        const threshold = Number.isFinite(Number(cutoffMs))
          ? Math.max(0, Math.floor(Number(cutoffMs)))
          : 0;
        const keepRecent = Number.isFinite(Number(keepRecentPerKind))
          ? Math.max(0, Math.floor(Number(keepRecentPerKind)))
          : 0;
        const kindSet = Array.isArray(kinds) && kinds.length > 0
          ? new Set(kinds.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))
          : null;

        const rows = this.db.prepare(`
          SELECT * FROM agent_memories
          ORDER BY updated_at_ms DESC, created_at_ms DESC, id DESC
        `).all();
        const entries = rows.map(parseAgentRow).filter(Boolean);
        if (entries.length === 0) {
          const archiveCount = Number(this.db.prepare('SELECT COUNT(*) AS count FROM agent_memories_archive').get()?.count || 0);
          return { ok: true, moved: 0, rows: archiveCount, activeRows: 0, path: this.dbPath };
        }

        const byKind = new Map();
        for (const entry of entries) {
          const kindKey = String(entry?.kind || '').trim().toLowerCase() || 'unknown';
          if (!byKind.has(kindKey)) byKind.set(kindKey, []);
          byKind.get(kindKey).push(entry);
        }
        const keepIds = new Set();
        if (keepRecent > 0) {
          for (const list of byKind.values()) {
            list.slice(0, keepRecent).forEach((entry) => {
              const id = String(entry?.id || '').trim();
              if (id) keepIds.add(id);
            });
          }
        }

        const shouldKeepLocked = keepLocked !== false;
        const moveIds = [];
        const moveEntries = [];
        for (const entry of entries) {
          const id = String(entry?.id || '').trim();
          const kindKey = String(entry?.kind || '').trim().toLowerCase() || 'unknown';
          const updatedAt = Number(entry?.updatedAtMs || entry?.createdAtMs || 0) || 0;
          const payload = entry?.payload && typeof entry.payload === 'object' ? entry.payload : null;
          const isLocked = entry?.locked === true || payload?.locked === true;
          const kindAllowed = !kindSet || kindSet.has(kindKey);
          const keepByRecency = !!(id && keepIds.has(id));
          const oldEnough = threshold <= 0 ? true : (updatedAt > 0 && updatedAt < threshold);
          if (!kindAllowed || keepByRecency || (shouldKeepLocked && isLocked) || !oldEnough || !id) continue;
          moveIds.push(id);
          moveEntries.push(entry);
        }

        if (moveEntries.length === 0) {
          const archiveCount = Number(this.db.prepare('SELECT COUNT(*) AS count FROM agent_memories_archive').get()?.count || 0);
          return {
            ok: true,
            moved: 0,
            rows: archiveCount,
            activeRows: entries.length,
            path: this.dbPath
          };
        }

        const tx = this.db.transaction(() => {
          const upsertArchive = this.db.prepare(`
            INSERT OR REPLACE INTO agent_memories_archive
            (id, key, family_key, kind, symbol, timeframe, summary, tags_json, payload_json, source, created_at_ms, updated_at_ms, last_accessed_at_ms, archived_at_ms)
            VALUES (@id, @key, @family_key, @kind, @symbol, @timeframe, @summary, @tags_json, @payload_json, @source, @created_at_ms, @updated_at_ms, @last_accessed_at_ms, @archived_at_ms)
          `);
          const deleteActive = this.db.prepare('DELETE FROM agent_memories WHERE id = ?');
          for (const entry of moveEntries) {
            upsertArchive.run({
              id: entry.id,
              key: entry.key,
              family_key: entry.familyKey || null,
              kind: entry.kind || null,
              symbol: entry.symbol || null,
              timeframe: entry.timeframe || null,
              summary: entry.summary || null,
              tags_json: toJson(entry.tags || []) || '[]',
              payload_json: toJson(entry) || null,
              source: entry.source || null,
              created_at_ms: Number(entry.createdAtMs || 0) || nowMs(),
              updated_at_ms: Number(entry.updatedAtMs || 0) || nowMs(),
              last_accessed_at_ms: Number(entry.lastAccessedAtMs || 0) || null,
              archived_at_ms: nowMs()
            });
            deleteActive.run(entry.id);
          }
        });
        tx();
        this._markDirty();
        const archiveCount = Number(this.db.prepare('SELECT COUNT(*) AS count FROM agent_memories_archive').get()?.count || 0);
        const activeCount = Number(this.db.prepare('SELECT COUNT(*) AS count FROM agent_memories').get()?.count || 0);
        return {
          ok: true,
          moved: moveEntries.length,
          rows: archiveCount,
          activeRows: activeCount,
          path: this.dbPath
        };
      } catch (err) {
        const msg = redactErrorMessage(err?.message || String(err));
        this._lastError = msg;
        return { ok: false, error: msg, path: this.dbPath };
      }
    });
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
        this.db.prepare('DELETE FROM agent_memories_archive').run();
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
      const agentMemoryArchiveCount = this.db.prepare('SELECT COUNT(*) AS count FROM agent_memories_archive').get().count;
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
        agentMemoryArchiveCount: Number(agentMemoryArchiveCount || 0),
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
