const { XMLParser } = require('fast-xml-parser');

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_LOOKBACK_HOURS = 24;
const DEFAULT_LOOKAHEAD_HOURS = 7 * 24;

const SOURCES = [
  {
    id: 'forexfactory_thisweek',
    name: 'ForexFactory',
    url: 'https://nfs.faireconomy.media/ff_calendar_thisweek.xml',
    format: 'xml'
  },
  {
    id: 'forexfactory_nextweek',
    name: 'ForexFactory',
    url: 'https://nfs.faireconomy.media/ff_calendar_nextweek.xml',
    format: 'xml'
  }
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: 'text',
  removeNSPrefix: true
});

const toArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const readText = (value) => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    if (typeof value.text === 'string' || typeof value.text === 'number') return String(value.text);
  }
  return '';
};

const normalizeCurrency = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  return raw.replace(/[^A-Z]/g, '');
};

const normalizeImpact = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('high')) return 'high';
  if (raw.includes('medium') || raw.includes('med')) return 'medium';
  if (raw.includes('low')) return 'low';
  return raw;
};

const parseNumericTimestamp = (value) => {
  const str = String(value || '').trim();
  if (!/^\d{9,14}$/.test(str)) return null;
  const n = Number(str);
  if (!Number.isFinite(n)) return null;
  return str.length >= 13 ? n : n * 1000;
};

const parseDateTime = (dateRaw, timeRaw, tzRaw) => {
  const dateStr = readText(dateRaw);
  const timeStr = readText(timeRaw);
  const tzStr = readText(tzRaw);
  if (!dateStr && !timeStr) return null;
  const loweredTime = timeStr.toLowerCase();
  if (loweredTime.includes('all day') || loweredTime.includes('tentative')) {
    return null;
  }
  const baseParts = [];
  if (dateStr) baseParts.push(dateStr);
  if (timeStr) baseParts.push(timeStr);
  if (tzStr) baseParts.push(tzStr);
  let parsed = Date.parse(baseParts.join(' '));
  if (!Number.isFinite(parsed) && dateStr && !/\d{4}/.test(dateStr)) {
    const withYear = `${dateStr} ${new Date().getFullYear()}`;
    parsed = Date.parse(timeStr ? `${withYear} ${timeStr}` : withYear);
  }
  if (!Number.isFinite(parsed) && dateStr) {
    parsed = Date.parse(dateStr);
    if (Number.isFinite(parsed) && timeStr) {
      const timeParsed = Date.parse(`1970-01-01 ${timeStr}`);
      if (Number.isFinite(timeParsed)) {
        const dateObj = new Date(parsed);
        const timeObj = new Date(timeParsed);
        dateObj.setHours(timeObj.getHours(), timeObj.getMinutes(), 0, 0);
        parsed = dateObj.getTime();
      }
    }
  }
  return Number.isFinite(parsed) ? parsed : null;
};

const slugify = (value, max = 64) => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, max);
};

const buildEventId = (sourceId, currency, title, startAtMs, dateStr, timeStr) => {
  const tsPart = startAtMs
    ? new Date(startAtMs).toISOString().slice(0, 16).replace(/[-:T]/g, '')
    : slugify(`${dateStr || ''}-${timeStr || ''}`, 16);
  const parts = [
    slugify(sourceId || 'calendar', 24),
    slugify(currency || '', 8),
    tsPart || 'na',
    slugify(title || '', 48)
  ].filter(Boolean);
  return parts.join(':') || `event:${Date.now()}`;
};

const normalizeEvent = (raw, source) => {
  if (!raw || typeof raw !== 'object') return null;
  const title = readText(raw.title || raw.event || raw.name);
  if (!title) return null;
  const currency = normalizeCurrency(readText(raw.currency || raw.ccy || raw.curr || raw.symbol));
  const country = readText(raw.country || raw.region || raw.zone || raw.area);
  const impact = normalizeImpact(readText(raw.impact || raw.importance || raw.impactLevel || raw['impact_level']));
  const actual = readText(raw.actual);
  const forecast = readText(raw.forecast);
  const previous = readText(raw.previous);
  const url = readText(raw.url || raw.link);
  const status = readText(raw.status);
  const timestamp = parseNumericTimestamp(raw.timestamp || raw.ts || raw.timeStamp || raw.datetime);
  const dateStr = readText(raw.date || raw.day);
  const timeStr = readText(raw.time || raw.hour);
  const tzStr = readText(raw.timezone || raw.tz);
  const startAtMs = timestamp || parseDateTime(dateStr, timeStr, tzStr);
  const id = buildEventId(source?.id, currency || country, title, startAtMs, dateStr, timeStr);
  return {
    id,
    title: String(title).trim(),
    currency: currency || null,
    country: country || null,
    impact: impact || null,
    actual: actual || null,
    forecast: forecast || null,
    previous: previous || null,
    startAtMs,
    endAtMs: null,
    url: url || null,
    source: source?.name || source?.id || null,
    status: status || null
  };
};

const resolveEventList = (parsed) => {
  const candidates = [
    parsed?.calendar?.event,
    parsed?.calendar?.events?.event,
    parsed?.calendar?.events,
    parsed?.events?.event,
    parsed?.events,
    parsed?.event,
    parsed?.rss?.channel?.item,
    parsed?.channel?.item,
    parsed?.items
  ];
  for (const candidate of candidates) {
    if (candidate) return toArray(candidate);
  }
  return [];
};

const parseXmlEvents = (xml, source) => {
  let parsed = null;
  try {
    parsed = parser.parse(xml);
  } catch {
    return [];
  }
  const list = resolveEventList(parsed);
  return list.map((entry) => normalizeEvent(entry, source)).filter(Boolean);
};

const parseJsonEvents = (text, source) => {
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.events) ? parsed.events : [];
  return list.map((entry) => normalizeEvent(entry, source)).filter(Boolean);
};

const fetchWithTimeout = async (url, timeoutMs = 9000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'GlassBrowser AI' }
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    clearTimeout(timeout);
  }
};

class CalendarService {
  constructor() {
    this.cache = new Map();
  }

  async getEvents(input = {}) {
    const lookbackHours = Number.isFinite(Number(input.lookbackHours))
      ? Math.max(0, Number(input.lookbackHours))
      : DEFAULT_LOOKBACK_HOURS;
    const lookaheadHours = Number.isFinite(Number(input.lookaheadHours))
      ? Math.max(1, Number(input.lookaheadHours))
      : DEFAULT_LOOKAHEAD_HOURS;
    const force = input.force === true;
    const sourceIds = Array.isArray(input.sources)
      ? input.sources.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    const sources = sourceIds.length > 0
      ? SOURCES.filter((source) => sourceIds.includes(source.id))
      : SOURCES.slice();

    const cacheKey = sources.map((source) => source.id).sort().join('|') || 'default';
    const cached = this.cache.get(cacheKey);
    const now = Date.now();
    if (!force && cached && now - cached.fetchedAtMs < DEFAULT_TTL_MS) {
      return {
        ok: true,
        cached: true,
        fetchedAtMs: cached.fetchedAtMs,
        events: this.filterEvents(cached.events, lookbackHours, lookaheadHours, now)
      };
    }

    const results = await Promise.allSettled(sources.map(async (source) => {
      const res = await fetchWithTimeout(source.url);
      if (!res.ok || !res.text) {
        throw new Error(res.error || `Fetch failed (${res.status || 'unknown'})`);
      }
      if (source.format === 'json') {
        return parseJsonEvents(res.text, source);
      }
      const xmlEvents = parseXmlEvents(res.text, source);
      if (xmlEvents.length > 0) return xmlEvents;
      return parseJsonEvents(res.text, source);
    }));

    const errors = [];
    const events = [];
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        events.push(...result.value);
      } else {
        const source = sources[idx];
        errors.push({
          source: source?.id || `source_${idx}`,
          error: result.reason?.message || String(result.reason || 'Fetch failed')
        });
      }
    });

    const deduped = [];
    const seen = new Set();
    for (const event of events) {
      if (!event) continue;
      const key = [
        event.currency || '',
        event.title || '',
        event.startAtMs || ''
      ].join('|').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(event);
    }

    this.cache.set(cacheKey, { events: deduped, fetchedAtMs: now });

    return {
      ok: true,
      cached: false,
      fetchedAtMs: now,
      events: this.filterEvents(deduped, lookbackHours, lookaheadHours, now),
      errors: errors.length > 0 ? errors : undefined
    };
  }

  filterEvents(events, lookbackHours, lookaheadHours, now) {
    const minTs = now - lookbackHours * 60 * 60 * 1000;
    const maxTs = now + lookaheadHours * 60 * 60 * 1000;
    return (Array.isArray(events) ? events : []).filter((event) => {
      const ts = Number(event?.startAtMs || 0);
      if (!ts) return true;
      if (ts < minTs) return false;
      if (ts > maxTs) return false;
      return true;
    });
  }
}

module.exports = { CalendarService };
