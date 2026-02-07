const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const HISTORY_DIR = 'tradelocker-history';
const DEFAULT_MAX_BARS = 60_000;
const DEFAULT_PERSIST_DELAY_MS = 800;

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

function normalizeBar(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const t = Number(raw.t ?? raw.time ?? raw.timestamp);
  if (!Number.isFinite(t)) return null;
  const toNum = (value) => {
    if (value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  return {
    t: Math.floor(t),
    o: toNum(raw.o ?? raw.open),
    h: toNum(raw.h ?? raw.high),
    l: toNum(raw.l ?? raw.low),
    c: toNum(raw.c ?? raw.close),
    v: toNum(raw.v ?? raw.volume)
  };
}

class MarketHistoryStore {
  constructor({ maxBarsPerSeries = DEFAULT_MAX_BARS, persistDelayMs = DEFAULT_PERSIST_DELAY_MS } = {}) {
    this.maxBarsPerSeries = Number.isFinite(Number(maxBarsPerSeries))
      ? Math.max(1000, Math.floor(Number(maxBarsPerSeries)))
      : DEFAULT_MAX_BARS;
    this.persistDelayMs = Number.isFinite(Number(persistDelayMs))
      ? Math.max(200, Math.floor(Number(persistDelayMs)))
      : DEFAULT_PERSIST_DELAY_MS;
    this.dirPath = path.join(app.getPath('userData'), HISTORY_DIR);
    this.series = new Map();
    this._ensureDir();
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this.dirPath)) fs.mkdirSync(this.dirPath, { recursive: true });
    } catch {
      // ignore
    }
  }

  _seriesKey(instrumentId, resolution) {
    return `${Number(instrumentId)}:${String(resolution || '').trim()}`;
  }

  _seriesPath(instrumentId, resolution) {
    const safeRes = String(resolution || '').replace(/[^a-zA-Z0-9]/g, '');
    return path.join(this.dirPath, `inst_${Number(instrumentId)}_${safeRes}.jsonl`);
  }

  _getSeries(instrumentId, resolution) {
    const key = this._seriesKey(instrumentId, resolution);
    if (this.series.has(key)) return this.series.get(key);
    const entry = {
      key,
      instrumentId: Number(instrumentId),
      resolution: String(resolution || '').trim(),
      bars: new Map(),
      sortedBars: null,
      sortedDirty: true,
      loaded: false,
      dirty: false,
      minTs: null,
      maxTs: null,
      lastFetchedAtMs: 0,
      lastPersistAtMs: 0,
      persistTimer: null,
      persistToken: 0,
      persistInFlight: null
    };
    this.series.set(key, entry);
    return entry;
  }

  async _loadSeries(series) {
    if (series.loaded) return;
    series.loaded = true;
    this._ensureDir();
    const filePath = this._seriesPath(series.instrumentId, series.resolution);
    try {
      if (!fs.existsSync(filePath)) return;
      const text = await fs.promises.readFile(filePath, 'utf8');
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parsed = safeJsonParse(trimmed);
        const bar = normalizeBar(parsed);
        if (!bar) continue;
        series.bars.set(bar.t, bar);
        series.minTs = series.minTs == null ? bar.t : Math.min(series.minTs, bar.t);
        series.maxTs = series.maxTs == null ? bar.t : Math.max(series.maxTs, bar.t);
      }
      series.sortedDirty = true;
    } catch {
      // ignore load errors
    }
  }

  _markDirty(series) {
    series.dirty = true;
    series.sortedDirty = true;
    this._schedulePersist(series);
  }

  _schedulePersist(series) {
    if (series.persistTimer) return;
    series.persistTimer = setTimeout(() => {
      series.persistTimer = null;
      if (series.persistInFlight) return;
      const token = ++series.persistToken;
      series.persistInFlight = (async () => {
        try {
          await this._persistSeries(series, token);
        } finally {
          series.persistInFlight = null;
        }
      })();
    }, this.persistDelayMs);
  }

  async _persistSeries(series, token) {
    if (!series.dirty) return;
    this._ensureDir();
    const filePath = this._seriesPath(series.instrumentId, series.resolution);
    const tempPath = `${filePath}.tmp_${token}`;
    try {
      const entries = this._getSortedBars(series);
      const payload = entries.map((b) => JSON.stringify(b)).join('\n');
      await fs.promises.writeFile(tempPath, payload, 'utf8');
      if (token !== series.persistToken) {
        try { await fs.promises.rm(tempPath, { force: true }); } catch {}
        return;
      }
      try {
        await fs.promises.rename(tempPath, filePath);
      } catch {
        try { await fs.promises.rm(filePath, { force: true }); } catch {}
        await fs.promises.rename(tempPath, filePath);
      }
      series.dirty = false;
      series.lastPersistAtMs = nowMs();
    } catch {
      try { await fs.promises.rm(tempPath, { force: true }); } catch {}
    }
  }

  async getSeriesMeta(instrumentId, resolution) {
    const series = this._getSeries(instrumentId, resolution);
    await this._loadSeries(series);
    return {
      ok: true,
      instrumentId: series.instrumentId,
      resolution: series.resolution,
      count: series.bars.size,
      minTs: series.minTs,
      maxTs: series.maxTs,
      lastFetchedAtMs: series.lastFetchedAtMs || null,
      lastPersistAtMs: series.lastPersistAtMs || null,
      dirty: !!series.dirty
    };
  }

  async getBars(instrumentId, resolution, { from, to, limit } = {}) {
    const series = this._getSeries(instrumentId, resolution);
    await this._loadSeries(series);
    const fromMs = Number.isFinite(Number(from)) ? Number(from) : null;
    const toMs = Number.isFinite(Number(to)) ? Number(to) : null;
    const max = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : 0;

    let items = this._getSortedBars(series);
    if (fromMs != null) items = items.filter((b) => b.t >= fromMs);
    if (toMs != null) items = items.filter((b) => b.t <= toMs);
    if (max > 0 && items.length > max) items = items.slice(items.length - max);

    return {
      ok: true,
      bars: items,
      meta: {
        instrumentId: series.instrumentId,
        resolution: series.resolution,
        count: items.length,
        minTs: series.minTs,
        maxTs: series.maxTs,
        lastFetchedAtMs: series.lastFetchedAtMs || null
      }
    };
  }

  async upsertBars(instrumentId, resolution, bars, { fetchedAtMs } = {}) {
    const series = this._getSeries(instrumentId, resolution);
    await this._loadSeries(series);
    const list = Array.isArray(bars) ? bars : [];
    let added = 0;

    for (const raw of list) {
      const bar = normalizeBar(raw);
      if (!bar) continue;
      const existing = series.bars.get(bar.t);
      if (!existing) added += 1;
      series.bars.set(bar.t, bar);
      series.minTs = series.minTs == null ? bar.t : Math.min(series.minTs, bar.t);
      series.maxTs = series.maxTs == null ? bar.t : Math.max(series.maxTs, bar.t);
    }

    const maxBars = this.maxBarsPerSeries;
    if (series.bars.size > maxBars) {
      const keys = Array.from(series.bars.keys()).sort((a, b) => a - b);
      const toDrop = keys.slice(0, Math.max(0, keys.length - maxBars));
      for (const key of toDrop) series.bars.delete(key);
      if (toDrop.length > 0) {
        series.minTs = keys[toDrop.length] ?? null;
      }
    }

    const fetchedAt = Number.isFinite(Number(fetchedAtMs)) ? Number(fetchedAtMs) : nowMs();
    series.lastFetchedAtMs = Math.max(series.lastFetchedAtMs || 0, fetchedAt);

    if (added > 0 || list.length > 0) this._markDirty(series);

    return {
      ok: true,
      instrumentId: series.instrumentId,
      resolution: series.resolution,
      added,
      total: series.bars.size,
      minTs: series.minTs,
      maxTs: series.maxTs,
      lastFetchedAtMs: series.lastFetchedAtMs
    };
  }

  _getSortedBars(series) {
    if (!series.sortedDirty && Array.isArray(series.sortedBars)) return series.sortedBars;
    const sorted = Array.from(series.bars.values()).sort((a, b) => a.t - b.t);
    series.sortedBars = sorted;
    series.sortedDirty = false;
    return sorted;
  }
}

module.exports = {
  MarketHistoryStore
};
