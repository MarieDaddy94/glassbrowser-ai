const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const { MarketHistoryStore } = require('./marketHistoryStore.cjs');
let SocketIoClient = null;
try {
  SocketIoClient = require('socket.io-client');
} catch {
  SocketIoClient = null;
}

const CONFIG_FILE = 'tradelocker.json';
const ORDER_DEBUG_FILE = 'tradelocker-order-debug.jsonl';
const QUOTE_DEBUG_FILE = 'tradelocker-quotes.jsonl';
const STREAM_DEBUG_FILE = 'tradelocker-stream.log';
const STREAM_SYNC_TIMEOUT_MS = 8_000;

const toPositiveInt = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
};

const DEFAULT_DEBUG = Object.freeze({
  enabled: (() => {
    const raw = process.env.GLASS_TRADELOCKER_DEBUG;
    if (raw == null) return true;
    const v = String(raw).trim().toLowerCase();
    if (v === '0' || v === 'false' || v === 'no') return false;
    if (v === '1' || v === 'true' || v === 'yes') return true;
    return true;
  })(),
  maxBytes: toPositiveInt(process.env.GLASS_TRADELOCKER_DEBUG_MAX_BYTES, 2 * 1024 * 1024),
  maxFiles: toPositiveInt(process.env.GLASS_TRADELOCKER_DEBUG_MAX_FILES, 3),
  textLimit: toPositiveInt(process.env.GLASS_TRADELOCKER_DEBUG_TEXT_LIMIT, 6000)
});

const STREAM_STATUS = Object.freeze({
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  SUBSCRIBING: 'SUBSCRIBING',
  SYNCING: 'SYNCING',
  LIVE: 'LIVE',
  ERROR: 'ERROR'
});

const STREAM_DEBUG = Object.freeze({
  enabled: (() => {
    const raw = process.env.GLASS_TRADELOCKER_STREAM_DEBUG;
    if (raw == null) return false;
    const v = String(raw).trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes') return true;
    if (v === '0' || v === 'false' || v === 'no') return false;
    return false;
  })(),
  maxBytes: toPositiveInt(process.env.GLASS_TRADELOCKER_STREAM_DEBUG_MAX_BYTES, DEFAULT_DEBUG.maxBytes),
  maxFiles: toPositiveInt(process.env.GLASS_TRADELOCKER_STREAM_DEBUG_MAX_FILES, DEFAULT_DEBUG.maxFiles),
  textLimit: toPositiveInt(process.env.GLASS_TRADELOCKER_STREAM_DEBUG_TEXT_LIMIT, DEFAULT_DEBUG.textLimit)
});

const STREAM_SUBSCRIBE_TIMEOUT_MS =
  toPositiveInt(process.env.GLASS_TRADELOCKER_STREAM_SUBSCRIBE_TIMEOUT_MS, 8_000);
const STREAM_TOKEN_REFRESH_LEEWAY_MS =
  toPositiveInt(process.env.GLASS_TRADELOCKER_STREAM_TOKEN_LEEWAY_MS, 60_000);
const STREAM_STALE_MS =
  toPositiveInt(process.env.GLASS_TRADELOCKER_STREAM_STALE_MS, 25_000);
const STREAM_HEALTH_POLL_MS =
  toPositiveInt(process.env.GLASS_TRADELOCKER_STREAM_HEALTH_POLL_MS, 5_000);
const REQUEST_CONCURRENCY =
  toPositiveInt(process.env.GLASS_TRADELOCKER_REQUEST_CONCURRENCY, 3);
const RATE_LIMIT_WINDOW_MS =
  toPositiveInt(process.env.GLASS_TRADELOCKER_RATE_WINDOW_MS, 60_000);
const RATE_LIMIT_TOP_ROUTES =
  toPositiveInt(process.env.GLASS_TRADELOCKER_RATE_TOP_ROUTES, 8);
const RATE_LIMIT_ROUTE_CAP =
  toPositiveInt(process.env.GLASS_TRADELOCKER_RATE_ROUTE_CAP, 72);
const RATE_LIMIT_GUARDED_THRESHOLD =
  toPositiveInt(process.env.GLASS_TRADELOCKER_RATE_GUARDED_THRESHOLD, 1);
const RATE_LIMIT_COOLDOWN_THRESHOLD =
  toPositiveInt(process.env.GLASS_TRADELOCKER_RATE_COOLDOWN_THRESHOLD, 3);
const RATE_LIMIT_RECOVERY_STREAK =
  toPositiveInt(process.env.GLASS_TRADELOCKER_RATE_RECOVERY_STREAK, 18);
const RATE_LIMIT_MAX_INTERVAL_MS =
  toPositiveInt(process.env.GLASS_TRADELOCKER_RATE_MAX_INTERVAL_MS, 5_000);
const RATE_LIMIT_ACCOUNT_CAP =
  toPositiveInt(process.env.GLASS_TRADELOCKER_RATE_ACCOUNT_CAP, 24);
const RATE_LIMIT_PROFILE_DEFAULT = String(
  process.env.GLASS_TRADELOCKER_RATE_PROFILE || 'balanced'
).trim().toLowerCase();

const RATE_LIMIT_PROFILES = Object.freeze({
  safe: Object.freeze({
    guardedThreshold: Math.max(1, RATE_LIMIT_GUARDED_THRESHOLD),
    cooldownThreshold: Math.max(2, RATE_LIMIT_COOLDOWN_THRESHOLD - 1),
    recoveryStreak: Math.max(12, RATE_LIMIT_RECOVERY_STREAK + 6),
    maxIntervalMs: Math.max(2_500, RATE_LIMIT_MAX_INTERVAL_MS),
    guardedIntervalMultiplier: 2.5,
    cooldownIntervalMultiplier: 5.5,
    guardedIntervalFloorMs: 1_400,
    cooldownIntervalFloorMs: 2_800,
    guardedConcurrencyDrop: 1,
    cooldownConcurrency: 1,
    guardedPressure: 0.72,
    cooldownPressure: 0.95
  }),
  balanced: Object.freeze({
    guardedThreshold: Math.max(1, RATE_LIMIT_GUARDED_THRESHOLD),
    cooldownThreshold: Math.max(2, RATE_LIMIT_COOLDOWN_THRESHOLD),
    recoveryStreak: Math.max(10, RATE_LIMIT_RECOVERY_STREAK),
    maxIntervalMs: Math.max(2_000, RATE_LIMIT_MAX_INTERVAL_MS),
    guardedIntervalMultiplier: 2,
    cooldownIntervalMultiplier: 4,
    guardedIntervalFloorMs: 1_200,
    cooldownIntervalFloorMs: 2_200,
    guardedConcurrencyDrop: 1,
    cooldownConcurrency: 1,
    guardedPressure: 0.82,
    cooldownPressure: 1.08
  }),
  aggressive: Object.freeze({
    guardedThreshold: Math.max(2, RATE_LIMIT_GUARDED_THRESHOLD + 1),
    cooldownThreshold: Math.max(3, RATE_LIMIT_COOLDOWN_THRESHOLD + 1),
    recoveryStreak: Math.max(8, RATE_LIMIT_RECOVERY_STREAK - 6),
    maxIntervalMs: Math.max(1_600, Math.floor(RATE_LIMIT_MAX_INTERVAL_MS * 0.7)),
    guardedIntervalMultiplier: 1.5,
    cooldownIntervalMultiplier: 2.8,
    guardedIntervalFloorMs: 900,
    cooldownIntervalFloorMs: 1_600,
    guardedConcurrencyDrop: 0,
    cooldownConcurrency: 1,
    guardedPressure: 0.96,
    cooldownPressure: 1.22
  })
});

const RATE_LIMIT_PROFILE_NAMES = Object.freeze(Object.keys(RATE_LIMIT_PROFILES));

function normalizeRateLimitProfileName(value, fallback = RATE_LIMIT_PROFILE_DEFAULT) {
  const preferred = String(value || '').trim().toLowerCase();
  if (preferred && Object.prototype.hasOwnProperty.call(RATE_LIMIT_PROFILES, preferred)) return preferred;
  const fallbackKey = String(fallback || '').trim().toLowerCase();
  if (fallbackKey && Object.prototype.hasOwnProperty.call(RATE_LIMIT_PROFILES, fallbackKey)) return fallbackKey;
  return 'balanced';
}

function getRateLimitProfileConfig(policy) {
  const key = normalizeRateLimitProfileName(policy, 'balanced');
  return RATE_LIMIT_PROFILES[key] || RATE_LIMIT_PROFILES.balanced;
}

function createQueueMetrics() {
  let maxDepth = 0;
  let maxWaitMs = 0;
  const noteDepth = (depth) => {
    const next = Number(depth);
    if (!Number.isFinite(next)) return;
    if (next > maxDepth) maxDepth = next;
  };
  const noteWait = (waitMs) => {
    const next = Number(waitMs);
    if (!Number.isFinite(next)) return;
    if (next > maxWaitMs) maxWaitMs = next;
  };
  const snapshot = () => ({ maxDepth, maxWaitMs });
  const reset = () => {
    maxDepth = 0;
    maxWaitMs = 0;
  };
  return {
    noteDepth,
    noteWait,
    snapshot,
    reset
  };
}

function getSocketIoClient() {
  if (!SocketIoClient) return null;
  return SocketIoClient.io ? SocketIoClient.io : SocketIoClient;
}

const SENSITIVE_KEY_PATTERN = /(pass(word)?|token|authorization|cookie|api[-_]?key|secret|session|jwt)/i;
const HEADER_ALLOWLIST = new Set([
  'date',
  'content-type',
  'content-length',
  'x-request-id',
  'x-correlation-id',
  'retry-after',
  'retry-after-ms'
]);
const DEFAULT_STATE = Object.freeze({
  env: 'demo', // 'demo' | 'live'
  server: '',
  email: '',
  apiBaseUrl: '',
  authBaseUrl: '',
  autoConnect: false,
  accountId: null,
  accNum: null,
  tradingEnabled: false,
  autoPilotEnabled: false,
  // TradeLocker qty is typically expressed in "lots" (e.g., 0.01).
  defaultOrderQty: 0.01,
  defaultOrderType: 'market', // 'market' | 'limit' | 'stop'
  streamingEnabled: false,
  streamingUrl: '',
  streamingAutoReconnect: true,
  streamingSubscribe: '',
  debug: { ...DEFAULT_DEBUG },
  secrets: {
    password: null, // base64 encrypted
    developerApiKey: null, // base64 encrypted
    profiles: {} // profileKey => { password, developerApiKey }
  }
});

function nowMs() {
  return Date.now();
}

function sleepMs(ms) {
  const delay = Number(ms);
  if (!Number.isFinite(delay) || delay <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delay));
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
  return message.replace(/Bearer\\s+[A-Za-z0-9\\-_.]+/g, 'Bearer [redacted]');
}

function getConfigPath() {
  return path.join(app.getPath('userData'), CONFIG_FILE);
}

function getOrderDebugPath() {
  return path.join(app.getPath('userData'), ORDER_DEBUG_FILE);
}

function getQuoteDebugPath() {
  return path.join(app.getPath('userData'), QUOTE_DEBUG_FILE);
}

function getStreamDebugPath() {
  return path.join(app.getPath('userData'), STREAM_DEBUG_FILE);
}

function normalizeDebugSettings(raw) {
  const base = { ...DEFAULT_DEBUG };
  if (!raw || typeof raw !== 'object') return base;
  if (typeof raw.enabled === 'boolean') base.enabled = raw.enabled;
  base.maxBytes = toPositiveInt(raw.maxBytes, base.maxBytes);
  base.maxFiles = toPositiveInt(raw.maxFiles, base.maxFiles);
  base.textLimit = toPositiveInt(raw.textLimit, base.textLimit);
  return base;
}

function clampString(value, limit) {
  const lim = toPositiveInt(limit, DEFAULT_DEBUG.textLimit);
  const str = String(value ?? '');
  if (str.length <= lim) return str;
  return `${str.slice(0, lim)}...[truncated]`;
}

function redactSensitiveString(value) {
  let str = String(value ?? '');
  str = str.replace(/Bearer\s+[-A-Za-z0-9._~+/]+=*/gi, 'Bearer [redacted]');
  str = str.replace(/(\"?(access_token|refresh_token|id_token|token)\"?\s*:\s*\")([^\"]+)(\")/gi, '$1[redacted]$4');
  return str;
}

function sanitizeHeaders(headers, textLimit) {
  if (!headers || typeof headers !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    const key = String(k || '').toLowerCase();
    if (!key) continue;
    if (HEADER_ALLOWLIST.has(key)) {
      out[key] = clampString(redactSensitiveString(v), textLimit);
      continue;
    }
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = '[redacted]';
    }
  }
  return out;
}

function collectResponseHeaders(res) {
  const out = {};
  if (!res || !res.headers || typeof res.headers.get !== 'function') return out;
  for (const key of HEADER_ALLOWLIST) {
    const value = res.headers.get(key);
    if (value != null && String(value).trim() !== '') out[key] = value;
  }
  return out;
}

function sanitizeDebugValue(value, settings, depth = 0) {
  if (value == null) return value;
  if (depth > 4) return '[truncated]';
  if (typeof value === 'string') return clampString(redactSensitiveString(value), settings.textLimit);
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    const limit = 200;
    const out = value.slice(0, limit).map((item) => sanitizeDebugValue(item, settings, depth + 1));
    if (value.length > limit) out.push(`[truncated ${value.length - limit} items]`);
    return out;
  }

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const key = String(k || '');
    const keyLower = key.toLowerCase();
    if (!key) continue;
    if (keyLower === 'headers') {
      out[key] = sanitizeHeaders(v, settings.textLimit);
      continue;
    }
    if (SENSITIVE_KEY_PATTERN.test(keyLower)) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = sanitizeDebugValue(v, settings, depth + 1);
  }
  return out;
}

function sanitizeDebugEntry(entry, settings) {
  const safe = normalizeDebugSettings(settings);
  return sanitizeDebugValue(entry, safe, 0);
}

function pruneDebugFiles(dir, baseName, settings) {
  if (!Number.isFinite(settings.maxFiles) || settings.maxFiles <= 0) return;
  let entries = [];
  try {
    entries = fs
      .readdirSync(dir)
      .filter((name) => name.startsWith(`${baseName}-`) && name.endsWith('.jsonl'))
      .map((name) => {
        const filePath = path.join(dir, name);
        let stat = null;
        try {
          stat = fs.statSync(filePath);
        } catch {
          stat = null;
        }
        return { name, path: filePath, mtimeMs: stat?.mtimeMs || 0 };
      });
  } catch {
    return;
  }

  entries.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
  const toDelete = entries.slice(settings.maxFiles);
  for (const entry of toDelete) {
    try {
      fs.unlinkSync(entry.path);
    } catch {
      // ignore
    }
  }
}

function rotateDebugFileIfNeeded(filePath, settings) {
  if (!settings.enabled) return;
  if (!Number.isFinite(settings.maxBytes) || settings.maxBytes <= 0) return;
  try {
    if (!fs.existsSync(filePath)) return;
    const stats = fs.statSync(filePath);
    if (!stats || !Number.isFinite(stats.size) || stats.size < settings.maxBytes) return;
  } catch {
    return;
  }

  try {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, '.jsonl');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotated = path.join(dir, `${base}-${stamp}.jsonl`);
    fs.renameSync(filePath, rotated);
    pruneDebugFiles(dir, base, settings);
  } catch {
    // ignore rotation errors
  }
}

function appendOrderDebugLine(entry, settings) {
  const safeSettings = normalizeDebugSettings(settings);
  if (!safeSettings.enabled) return;
  try {
    const filePath = getOrderDebugPath();
    rotateDebugFileIfNeeded(filePath, safeSettings);
    const line = JSON.stringify(sanitizeDebugEntry(entry, safeSettings));
    fs.appendFileSync(filePath, `${line}\n`, 'utf8');
  } catch {
    // ignore logging errors
  }
}

function appendQuoteDebugLine(entry, settings) {
  const safeSettings = normalizeDebugSettings(settings);
  if (!safeSettings.enabled) return;
  try {
    const filePath = getQuoteDebugPath();
    rotateDebugFileIfNeeded(filePath, safeSettings);
    const line = JSON.stringify(sanitizeDebugEntry(entry, safeSettings));
    fs.appendFileSync(filePath, `${line}\n`, 'utf8');
  } catch {
    // ignore logging errors
  }
}

function appendStreamDebugLine(entry) {
  const safeSettings = normalizeDebugSettings(STREAM_DEBUG);
  if (!safeSettings.enabled) return;
  try {
    const filePath = getStreamDebugPath();
    rotateDebugFileIfNeeded(filePath, safeSettings);
    const line = JSON.stringify(sanitizeDebugEntry(entry, safeSettings));
    fs.appendFileSync(filePath, `${line}\n`, 'utf8');
  } catch {
    // ignore logging errors
  }
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = deepMerge(out[key] || {}, value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function loadPersistedState() {
  const filePath = getConfigPath();
  try {
    if (!fs.existsSync(filePath)) return { ...DEFAULT_STATE };
    const text = fs.readFileSync(filePath, 'utf8');
    const parsed = safeJsonParse(text);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_STATE };
    const merged = deepMerge(DEFAULT_STATE, parsed);
    // Ensure secrets object exists
    merged.secrets = deepMerge(DEFAULT_STATE.secrets, merged.secrets || {});
    if (!merged.secrets || typeof merged.secrets !== 'object') {
      merged.secrets = deepMerge(DEFAULT_STATE.secrets, {});
    }
    if (!merged.secrets.profiles || typeof merged.secrets.profiles !== 'object' || Array.isArray(merged.secrets.profiles)) {
      merged.secrets.profiles = {};
    }
    merged.debug = normalizeDebugSettings(merged.debug);
    merged.accountId = parseAccountIdentifier(merged.accountId);
    merged.accNum = parseAccountIdentifier(merged.accNum);

    // Migration: older builds used a legacy defaultOrderQty=1000 which commonly causes broker-side risk rule rejections.
    // If the stored config still uses that legacy value, move it to the current default.
    const legacyQty = parseNumberLoose(parsed?.defaultOrderQty);
    if (legacyQty != null && legacyQty === 1000) {
      merged.defaultOrderQty = DEFAULT_STATE.defaultOrderQty;
      persistState(merged);
    }

    return merged;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function persistState(state) {
  const filePath = getConfigPath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: redactErrorMessage(e?.message || String(e)), path: filePath };
  }
}

function encryptSecret(value) {
  if (!value) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const buf = safeStorage.encryptString(value);
    return buf.toString('base64');
  } catch {
    return null;
  }
}

function decryptSecret(base64) {
  if (!base64) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const buf = Buffer.from(base64, 'base64');
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

function baseUrlForEnv(env) {
  return env === 'live'
    ? 'https://live.tradelocker.com/backend-api'
    : 'https://demo.tradelocker.com/backend-api';
}

function authUrlForEnv() {
  return 'https://auth.tradelocker.com';
}

function normalizeBaseUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.replace(/\/+$/, '');
}

async function readResponseBody(res) {
  const text = await res.text();
  const json = safeJsonParse(text);
  const contentType = res?.headers?.get ? res.headers.get('content-type') : null;
  return { text, json, contentType };
}

function looksLikeHtmlResponse(text, contentType) {
  const type = String(contentType || '').toLowerCase();
  if (type.includes('text/html')) return true;
  const trimmed = String(text || '').trim().slice(0, 64).toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

function formatHttpError({ status, statusText, bodyText, bodyJson }) {
  const msgParts = [`HTTP ${status}${statusText ? ` ${statusText}` : ''}`];
  if (bodyJson && typeof bodyJson === 'object') {
    const maybeMessage = bodyJson.message || bodyJson.error || bodyJson.title || bodyJson.detail;
    if (maybeMessage) msgParts.push(String(maybeMessage));
  } else if (bodyText) {
    msgParts.push(bodyText.slice(0, 400));
  }
  return msgParts.join(' - ');
}

function parseRetryAfterMs(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum >= 0) return Math.floor(asNum * 1000);

  const asDate = new Date(raw);
  if (!Number.isNaN(asDate.getTime())) {
    const delta = asDate.getTime() - nowMs();
    return delta > 0 ? delta : 0;
  }
  return null;
}

const REQUEST_PRIORITY = Object.freeze({
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3
});

function normalizePathForKey(pathname) {
  const raw = String(pathname || '').trim();
  if (!raw) return '';
  let pathOnly = raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      pathOnly = new URL(raw).pathname || '';
    } catch {
      pathOnly = raw;
    }
  }
  if (pathOnly.includes('?')) pathOnly = pathOnly.split('?')[0] || '';
  const parts = pathOnly.split('/').filter(Boolean);
  const normalized = parts.map((part) => (/^\d+$/.test(part) ? ':id' : part.toLowerCase()));
  return `/${normalized.join('/')}`;
}

function buildRouteKey(method, pathname) {
  const verb = String(method || 'GET').toUpperCase();
  const pathKey = normalizePathForKey(pathname);
  if (!pathKey) return '';
  return `${verb} ${pathKey}`;
}

function extractRouteIdFromPath(pathname) {
  const raw = String(pathname || '');
  const queryIndex = raw.indexOf('?');
  if (queryIndex === -1) return null;
  const query = raw.slice(queryIndex + 1);
  if (!query) return null;
  try {
    const params = new URLSearchParams(query);
    const candidates = [
      params.get('routeId'),
      params.get('routeID'),
      params.get('route_id')
    ].filter((v) => v != null && v !== '');
    if (!candidates.length) return null;
    const parsed = parseNumberLoose(candidates[0]);
    return parsed != null && Number.isFinite(Number(parsed)) ? Number(parsed) : null;
  } catch {
    return null;
  }
}

function normalizeRateMeasure(measure) {
  const raw = String(measure || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes('millisecond') || raw === 'ms' || raw === 'msec') return 1;
  if (raw.includes('second') || raw === 's' || raw === 'sec') return 1000;
  if (raw.includes('minute') || raw === 'm' || raw === 'min') return 60_000;
  if (raw.includes('hour') || raw === 'h' || raw === 'hr') return 3_600_000;
  if (raw.includes('day') || raw === 'd') return 86_400_000;
  return null;
}

function parseRateLimitIntervalMs(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const directMs = parseNumberLoose(
    entry.intervalMs ??
      entry.intervalMS ??
      entry.windowMs ??
      entry.windowMS ??
      entry.periodMs ??
      entry.periodMS ??
      entry.retryAfterMs
  );
  if (directMs != null && directMs > 0) return Math.floor(directMs);

  const directSec = parseNumberLoose(
    entry.intervalSec ??
      entry.intervalSeconds ??
      entry.windowSec ??
      entry.windowSeconds ??
      entry.periodSec ??
      entry.periodSeconds
  );
  if (directSec != null && directSec > 0) return Math.floor(directSec * 1000);

  const intervalNum = parseNumberLoose(
    entry.intervalNum ??
      entry.intervalCount ??
      entry.interval ??
      entry.window ??
      entry.period ??
      entry?.interval?.num ??
      entry?.interval?.count ??
      entry?.interval?.value
  );
  const measure =
    entry.measure ??
    entry.intervalMeasure ??
    entry.intervalUnit ??
    entry.intervalType ??
    entry.unit ??
    entry.timeUnit ??
    entry.periodUnit ??
    entry?.interval?.measure ??
    entry?.interval?.unit;
  const unitMs = normalizeRateMeasure(measure);
  if (intervalNum != null && intervalNum > 0 && unitMs != null) {
    return Math.floor(intervalNum * unitMs);
  }
  return null;
}

function parseRateLimitEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const limit = parseNumberLoose(
    entry.limit ??
      entry.max ??
      entry.maxRequests ??
      entry.requestLimit ??
      entry.requests ??
      entry.count ??
      entry.value
  );
  const intervalMs = parseRateLimitIntervalMs(entry);
  if (limit == null || limit <= 0 || intervalMs == null || intervalMs <= 0) return null;

  const method = entry.method ?? entry.httpMethod ?? entry.verb ?? entry.requestMethod;
  const path =
    entry.path ??
    entry.route ??
    entry.endpoint ??
    entry.uri ??
    entry.url ??
    entry.routePath ??
    entry.endpointPath ??
    entry.routeTemplate ??
    entry.pathTemplate;
  const routeId = parseNumberLoose(
    entry.routeId ??
      entry.routeID ??
      entry.route_id ??
      entry.endpointId ??
      entry.endpointID ??
      entry.id
  );

  return {
    limit: Math.floor(limit),
    intervalMs: Math.floor(intervalMs),
    method: method != null ? String(method).toUpperCase() : null,
    path: path != null ? String(path) : null,
    routeId: routeId != null && Number.isFinite(Number(routeId)) ? Number(routeId) : null
  };
}

function pickMoreRestrictiveRateLimit(a, b) {
  if (!a) return b;
  if (!b) return a;
  const rateA = a.limit / a.intervalMs;
  const rateB = b.limit / b.intervalMs;
  return rateB < rateA ? b : a;
}

function extractRateLimitEntries(config) {
  if (!config || typeof config !== 'object') return [];
  const root = config?.d ?? config;
  const entries = [];
  const queue = [{ value: root, depth: 0, keyHint: '' }];
  const maxDepth = 5;
  const maxArrayScan = 400;

  const shouldScanArray = (hint, arr) => {
    if (!Array.isArray(arr)) return false;
    const key = String(hint || '').toLowerCase();
    if (key.includes('limit') || key.includes('rate') || key.includes('throttle') || key.includes('quota')) return true;
    return arr.length <= maxArrayScan;
  };

  while (queue.length) {
    const { value, depth, keyHint } = queue.shift();
    if (!value || depth > maxDepth) continue;

    if (Array.isArray(value)) {
      if (!shouldScanArray(keyHint, value)) continue;
      for (const item of value) {
        if (item && typeof item === 'object') {
          const parsed = parseRateLimitEntry(item);
          if (parsed) entries.push(parsed);
          queue.push({ value: item, depth: depth + 1, keyHint });
        }
      }
      continue;
    }

    if (typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (!child || typeof child !== 'object') continue;
        queue.push({ value: child, depth: depth + 1, keyHint: key });
      }
    }
  }

  return entries;
}

function buildRateLimitMaps(config) {
  const entries = extractRateLimitEntries(config);
  if (!entries.length) return null;

  const byRouteKey = new Map();
  const byPathKey = new Map();
  const byRouteId = new Map();
  let global = null;

  for (const entry of entries) {
    const rule = { limit: entry.limit, intervalMs: entry.intervalMs };

    const pathKey = entry.path ? normalizePathForKey(entry.path) : '';
    const routeKey = entry.method && pathKey ? `${entry.method} ${pathKey}` : '';
    if (routeKey) {
      const prev = byRouteKey.get(routeKey) || null;
      byRouteKey.set(routeKey, pickMoreRestrictiveRateLimit(prev, rule));
    }
    if (pathKey) {
      const prev = byPathKey.get(pathKey) || null;
      byPathKey.set(pathKey, pickMoreRestrictiveRateLimit(prev, rule));
    }
    if (entry.routeId != null && Number.isFinite(Number(entry.routeId))) {
      const key = String(entry.routeId);
      const prev = byRouteId.get(key) || null;
      byRouteId.set(key, pickMoreRestrictiveRateLimit(prev, rule));
    }
    if (!routeKey && !pathKey && entry.routeId == null) {
      global = pickMoreRestrictiveRateLimit(global, rule);
    }
  }

  return {
    updatedAtMs: nowMs(),
    global,
    byRouteKey,
    byPathKey,
    byRouteId
  };
}

class TokenBucket {
  constructor(limit, intervalMs) {
    this.limit = Number(limit) || 0;
    this.intervalMs = Number(intervalMs) || 0;
    this.tokens = this.limit > 0 ? this.limit : 0;
    this.lastRefillAtMs = nowMs();
    this.blockedUntilMs = 0;
  }

  update(limit, intervalMs) {
    const nextLimit = Number(limit) || 0;
    const nextInterval = Number(intervalMs) || 0;
    if (nextLimit <= 0 || nextInterval <= 0) return;
    if (nextLimit === this.limit && nextInterval === this.intervalMs) return;
    this.limit = nextLimit;
    this.intervalMs = nextInterval;
    this.tokens = Math.min(this.tokens, this.limit);
    this.lastRefillAtMs = nowMs();
  }

  refill(now) {
    if (!this.limit || !this.intervalMs) return;
    const elapsed = now - this.lastRefillAtMs;
    if (!Number.isFinite(elapsed) || elapsed <= 0) return;
    const ratePerMs = this.limit / this.intervalMs;
    this.tokens = Math.min(this.limit, this.tokens + elapsed * ratePerMs);
    this.lastRefillAtMs = now;
  }

  peekDelay(now, count = 1) {
    let delay = 0;
    if (this.blockedUntilMs && now < this.blockedUntilMs) {
      delay = Math.max(delay, this.blockedUntilMs - now);
    }
    this.refill(now);
    if (!this.limit || !this.intervalMs) return delay;
    if (this.tokens >= count) return delay;
    const ratePerMs = this.limit / this.intervalMs;
    if (ratePerMs <= 0) return delay;
    const needed = count - this.tokens;
    const waitMs = Math.ceil(needed / ratePerMs);
    return Math.max(delay, waitMs);
  }

  consume(now, count = 1) {
    this.refill(now);
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  blockUntil(untilMs) {
    const until = Number(untilMs) || 0;
    if (!Number.isFinite(until) || until <= 0) return;
    this.blockedUntilMs = Math.max(this.blockedUntilMs || 0, until);
  }
}

class HttpError extends Error {
  constructor(message, { status, retryAfterMs, code } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.code = code;
  }
}

const UPSTREAM_ERROR_STATUSES = new Set([502, 503, 504]);
const UPSTREAM_FAILURE_WINDOW_MS = 30_000;
const UPSTREAM_FAILURE_THRESHOLD = 4;
const UPSTREAM_BACKOFF_BASE_MS = 15_000;
const UPSTREAM_BACKOFF_MAX_MS = 60_000;

function isUpstreamStatus(status) {
  if (status == null) return false;
  const code = Number(status);
  return Number.isFinite(code) && UPSTREAM_ERROR_STATUSES.has(code);
}

function isTransientNetworkError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  if (!msg) return false;
  return (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('econn') ||
    msg.includes('enotfound') ||
    msg.includes('socket') ||
    msg.includes('connection') ||
    msg.includes('tls') ||
    msg.includes('http2')
  );
}

function classifyTradeLockerError({ status, message }) {
  if (status === 429) return 'RATE_LIMITED';
  if (isUpstreamStatus(status)) return 'UPSTREAM_UNAVAILABLE';
  const msg = String(message || '').toLowerCase();
  if (!msg) return null;
  if (msg.includes('refresh token') || msg.includes('jwt') || msg.includes('unauthorized') || msg.includes('forbidden')) {
    return 'AUTH_REFRESH_FAILED';
  }
  if (msg.includes('accountid not set') || msg.includes('accnum not set') || msg.includes('account not selected')) {
    return 'ACCOUNT_NOT_READY';
  }
  if (msg.includes('unknown instrument') || msg.includes('tradableinstrumentid') || msg.includes('routeid')) {
    return 'INSTRUMENT_NOT_READY';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('429')) {
    return 'RATE_LIMITED';
  }
  return null;
}

function classifyAccountRouteFailureReason({ status, message, code }) {
  const statusCode = Number(status);
  const rawCode = String(code || '').trim();
  const msg = String(message || '').toLowerCase();

  if (rawCode === 'ACCOUNT_NOT_READY') return 'account_not_ready';
  if (rawCode === 'ACCOUNT_UNRESOLVED' || rawCode === 'account_unresolved' || rawCode === 'account_ambiguous') {
    return 'account_context_mismatch';
  }
  if (statusCode === 401 || statusCode === 403) return 'account_auth_invalid';
  if (statusCode === 400) {
    if (
      msg.includes('accnum') ||
      msg.includes('accountid') ||
      msg.includes('account context') ||
      msg.includes('account not selected') ||
      msg.includes('account could not be resolved') ||
      msg.includes('account unresolved')
    ) {
      return 'account_context_mismatch';
    }
    if (
      msg.includes('authentication error') ||
      msg.includes('unauthorized') ||
      msg.includes('forbidden') ||
      msg.includes('invalid credential')
    ) {
      return 'account_auth_invalid';
    }
  }
  if (msg.includes('account not selected') || msg.includes('accnum not set') || msg.includes('accountid not set')) {
    return 'account_not_ready';
  }
  return null;
}

function isAccountRouteFailure({ status, message, code }) {
  return classifyAccountRouteFailureReason({ status, message, code }) != null;
}

function normalizeEnv(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'live') return 'live';
  return 'demo';
}

function normalizeTradeLockerProfileSecretKey(raw) {
  const text = String(raw || '').trim().toLowerCase();
  if (!text) return '';
  const parts = text.split(':').map((part) => String(part || '').trim()).filter(Boolean);
  if (parts.length < 3) return '';
  const env = normalizeEnv(parts[0]);
  const server = String(parts[1] || '').trim().toLowerCase();
  const email = String(parts.slice(2).join(':') || '').trim().toLowerCase();
  if (!server || !email) return '';
  return `${env}:${server}:${email}`;
}

function buildTradeLockerProfileSecretKey({ env, server, email }) {
  const normalizedEnv = normalizeEnv(env);
  const normalizedServer = String(server || '').trim().toLowerCase();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedServer || !normalizedEmail) return '';
  return `${normalizedEnv}:${normalizedServer}:${normalizedEmail}`;
}

function ensureTradeLockerProfileSecretMap(state) {
  if (!state.secrets || typeof state.secrets !== 'object') state.secrets = {};
  const map = state.secrets.profiles;
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    state.secrets.profiles = {};
  }
  return state.secrets.profiles;
}

function parseNumberLoose(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const str = String(value).trim();
  if (!str) return null;
  const normalized = str.replace(/,/g, '');
  const num = Number(normalized);
  if (Number.isFinite(num)) return num;

  const match = normalized.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAccountIdentifier(value) {
  const parsed = parseNumberLoose(value);
  if (parsed == null) return null;
  const normalized = Math.trunc(parsed);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

function readAccountIdFromEntry(entry) {
  return parseAccountIdentifier(pickFirst(entry, ['id', 'accountId', 'accountID']));
}

function readAccNumFromEntry(entry) {
  return parseAccountIdentifier(pickFirst(entry, ['accNum', 'accountNum', 'accountNumber']));
}

function normalizeAccountEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const accountId = readAccountIdFromEntry(entry);
  if (accountId == null) return null;
  const accNum = readAccNumFromEntry(entry);
  return {
    ...entry,
    id: accountId,
    accountId,
    accNum: accNum ?? null,
    accountNum: accNum ?? null,
    accountNumber: accNum ?? null
  };
}

function normalizeAccountsList(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const next = [];
  const seen = new Set();
  for (const raw of list) {
    const normalized = normalizeAccountEntry(raw);
    if (!normalized) continue;
    const key = `${normalized.id}:${normalized.accNum != null ? normalized.accNum : 'na'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(normalized);
  }
  return next;
}

function resolveTradeLockerAccountPair(accounts, { accountId, accNum, allowSingleAccountFallback = true } = {}) {
  const safeAccounts = normalizeAccountsList(Array.isArray(accounts) ? accounts : []);
  const parsedAccountId = parseAccountIdentifier(accountId);
  const parsedAccNum = parseAccountIdentifier(accNum);

  const byAccountId =
    parsedAccountId == null
      ? []
      : safeAccounts.filter((entry) => readAccountIdFromEntry(entry) === parsedAccountId);
  const byAccNum =
    parsedAccNum == null
      ? []
      : safeAccounts.filter((entry) => readAccNumFromEntry(entry) === parsedAccNum);

  const buildPair = (entry) => {
    const nextAccountId = readAccountIdFromEntry(entry);
    const nextAccNum = readAccNumFromEntry(entry);
    if (nextAccountId == null || nextAccNum == null) return null;
    return { accountId: nextAccountId, accNum: nextAccNum };
  };

  if (parsedAccountId != null && parsedAccNum != null) {
    const exact = safeAccounts.find((entry) => {
      const entryAccountId = readAccountIdFromEntry(entry);
      const entryAccNum = readAccNumFromEntry(entry);
      return entryAccountId === parsedAccountId && entryAccNum === parsedAccNum;
    });
    if (exact) {
      return {
        ok: true,
        accountId: parsedAccountId,
        accNum: parsedAccNum,
        resolvedBy: 'exact'
      };
    }
    return {
      ok: false,
      code: 'account_context_mismatch',
      error: 'TradeLocker accountId/accNum pair does not match available accounts.'
    };
  }

  if (parsedAccountId != null) {
    if (byAccountId.length === 1) {
      const pair = buildPair(byAccountId[0]);
      if (pair) {
        return { ok: true, ...pair, resolvedBy: 'accountId_fallback' };
      }
      return {
        ok: false,
        code: 'account_unresolved',
        error: 'TradeLocker account could not be resolved to a valid accNum.'
      };
    }
    if (byAccountId.length > 1) {
      return {
        ok: false,
        code: 'account_ambiguous',
        error: 'TradeLocker accountId maps to multiple accNum values. Select an exact pair.'
      };
    }
    return {
      ok: false,
      code: 'account_unresolved',
      error: 'TradeLocker accountId is not available in current accounts.'
    };
  }

  if (parsedAccNum != null) {
    if (byAccNum.length === 1) {
      const pair = buildPair(byAccNum[0]);
      if (pair) {
        return { ok: true, ...pair, resolvedBy: 'accNum_unique' };
      }
      return {
        ok: false,
        code: 'account_unresolved',
        error: 'TradeLocker accNum could not be resolved to a valid accountId.'
      };
    }
    if (byAccNum.length > 1) {
      return {
        ok: false,
        code: 'account_ambiguous',
        error: 'TradeLocker accNum maps to multiple accountIds. Select an exact pair.'
      };
    }
    return {
      ok: false,
      code: 'account_unresolved',
      error: 'TradeLocker accNum is not available in current accounts.'
    };
  }

  if (allowSingleAccountFallback && safeAccounts.length === 1) {
    const pair = buildPair(safeAccounts[0]);
    if (pair) return { ok: true, ...pair, resolvedBy: 'single_account' };
  }

  return {
    ok: false,
    code: safeAccounts.length > 1 ? 'account_ambiguous' : 'account_not_ready',
    error: safeAccounts.length > 1
      ? 'TradeLocker account selection is ambiguous.'
      : 'TradeLocker account not selected.'
  };
}

const RESOLUTION_MS = Object.freeze({
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1H': 60 * 60_000,
  '4H': 4 * 60 * 60_000,
  '1D': 24 * 60 * 60_000,
  '1W': 7 * 24 * 60 * 60_000,
  '1M': 30 * 24 * 60 * 60_000
});

function normalizeResolution(value) {
  const raw = String(value || '').trim();
  if (!raw) return '1m';
  if (/^\d+$/.test(raw)) return `${raw}m`;
  const match = raw.match(/^(\d+)\s*([a-zA-Z]+)$/);
  if (!match) return raw;
  const count = Number(match[1]);
  const unit = String(match[2] || '').trim().toLowerCase();
  if (!Number.isFinite(count) || count <= 0) return raw;
  if (unit.startsWith('m') && unit !== 'mo' && unit !== 'mon' && unit !== 'month' && unit !== 'months') return `${count}m`;
  if (unit.startsWith('h')) return `${count}H`;
  if (unit.startsWith('d')) return `${count}D`;
  if (unit.startsWith('w')) return `${count}W`;
  if (unit.startsWith('mo')) return `${count}M`;
  if (unit.startsWith('y')) return `${count}Y`;
  return raw;
}

function resolutionToMs(value) {
  const normalized = normalizeResolution(value);
  if (RESOLUTION_MS[normalized]) return RESOLUTION_MS[normalized];
  const match = String(normalized || '').match(/^(\d+)\s*([a-zA-Z]+)$/);
  if (!match) return null;
  const count = Number(match[1]);
  const unit = String(match[2] || '').trim();
  if (!Number.isFinite(count) || count <= 0) return null;
  const unitKey = unit === 'm' ? 'm' : unit.toUpperCase();
  switch (unitKey) {
    case 'm':
      return count * 60_000;
    case 'H':
      return count * 60 * 60_000;
    case 'D':
      return count * 24 * 60 * 60_000;
    case 'W':
      return count * 7 * 24 * 60 * 60_000;
    case 'M':
      return count * 30 * 24 * 60 * 60_000;
    case 'Y':
      return count * 365 * 24 * 60 * 60_000;
    case 'S':
      return count * 1000;
    default:
      return null;
  }
}

function aggregateBars(bars, resolutionMs) {
  const interval = Number(resolutionMs);
  if (!Number.isFinite(interval) || interval <= 0) return [];
  const list = Array.isArray(bars) ? bars : [];
  if (list.length === 0) return [];

  const readNum = (value) => {
    const n = parseNumberLoose(value);
    return Number.isFinite(n) ? n : null;
  };

  const readBar = (bar) => {
    const t = Number(bar?.t ?? bar?.time ?? bar?.timestamp);
    if (!Number.isFinite(t)) return null;
    const open = readNum(bar?.o ?? bar?.open ?? bar?.c ?? bar?.close);
    const high = readNum(bar?.h ?? bar?.high ?? open ?? bar?.l ?? bar?.low);
    const low = readNum(bar?.l ?? bar?.low ?? open ?? bar?.h ?? bar?.high);
    const close = readNum(bar?.c ?? bar?.close ?? open);
    const volume = readNum(bar?.v ?? bar?.volume);
    return { t: Math.floor(t), o: open, h: high, l: low, c: close, v: volume };
  };

  const sorted = list
    .map(readBar)
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);

  const out = [];
  let bucket = null;
  let bucketStart = null;

  for (const bar of sorted) {
    const start = Math.floor(bar.t / interval) * interval;
    if (bucket == null || bucketStart !== start) {
      if (bucket) out.push(bucket);
      bucketStart = start;
      bucket = {
        t: start,
        o: bar.o ?? bar.c ?? null,
        h: bar.h ?? bar.o ?? bar.c ?? null,
        l: bar.l ?? bar.o ?? bar.c ?? null,
        c: bar.c ?? bar.o ?? null,
        v: bar.v ?? null
      };
      continue;
    }

    if (bar.h != null) bucket.h = bucket.h != null ? Math.max(bucket.h, bar.h) : bar.h;
    if (bar.l != null) bucket.l = bucket.l != null ? Math.min(bucket.l, bar.l) : bar.l;
    if (bar.c != null) bucket.c = bar.c;
    if (bar.v != null) bucket.v = (bucket.v != null ? bucket.v : 0) + bar.v;
  }

  if (bucket) out.push(bucket);
  return out;
}

function alignToResolutionFloor(ts, resolutionMs) {
  const n = Number(ts);
  if (!Number.isFinite(n)) return null;
  const res = Number(resolutionMs);
  if (!Number.isFinite(res) || res <= 0) return Math.floor(n);
  return Math.floor(n / res) * res;
}

function computeHistoryCoverage(bars, resolutionMs, fromMs, toMs) {
  const res = Number(resolutionMs);
  if (!Number.isFinite(res) || res <= 0) return null;
  const list = Array.isArray(bars) ? bars : [];
  const fromAligned = alignToResolutionFloor(fromMs, res);
  const toAligned = alignToResolutionFloor(toMs, res);
  const hasAligned = Number.isFinite(fromAligned) && Number.isFinite(toAligned) && toAligned >= fromAligned;
  const expectedBars = hasAligned ? Math.max(0, Math.floor((toAligned - fromAligned) / res) + 1) : 0;
  if (list.length === 0) {
    return {
      expectedBars,
      missingBars: expectedBars,
      gapCount: 0,
      maxGapMs: null,
      coveragePct: expectedBars > 0 ? 0 : null,
      firstTs: null,
      lastTs: null
    };
  }

  const times = list
    .map((bar) => alignToResolutionFloor(bar?.t ?? bar?.time ?? bar?.timestamp, res))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  if (times.length === 0) {
    return {
      expectedBars,
      missingBars: expectedBars,
      gapCount: 0,
      maxGapMs: null,
      coveragePct: expectedBars > 0 ? 0 : null,
      firstTs: null,
      lastTs: null
    };
  }

  const uniqueTimes = [];
  let last = null;
  for (const ts of times) {
    if (last !== null && ts === last) continue;
    uniqueTimes.push(ts);
    last = ts;
  }

  const firstTs = uniqueTimes[0];
  const lastTs = uniqueTimes[uniqueTimes.length - 1];
  let missingBars = 0;
  let gapCount = 0;
  let maxGapMs = 0;
  const gapThreshold = res * 1.5;

  if (hasAligned && Number.isFinite(firstTs) && firstTs > fromAligned) {
    const startGap = firstTs - fromAligned;
    if (startGap > gapThreshold) {
      const missing = Math.max(0, Math.round(startGap / res) - 1);
      if (missing > 0) {
        missingBars += missing;
        gapCount += 1;
        maxGapMs = Math.max(maxGapMs, startGap);
      }
    }
  }

  let prevTs = firstTs;
  for (let i = 1; i < uniqueTimes.length; i += 1) {
    const current = uniqueTimes[i];
    const delta = current - prevTs;
    if (delta > gapThreshold) {
      const missing = Math.max(0, Math.round(delta / res) - 1);
      if (missing > 0) {
        missingBars += missing;
        gapCount += 1;
        maxGapMs = Math.max(maxGapMs, delta);
      }
    }
    prevTs = current;
  }

  if (hasAligned && Number.isFinite(lastTs) && lastTs < toAligned) {
    const endGap = toAligned - lastTs;
    if (endGap > gapThreshold) {
      const missing = Math.max(0, Math.round(endGap / res) - 1);
      if (missing > 0) {
        missingBars += missing;
        gapCount += 1;
        maxGapMs = Math.max(maxGapMs, endGap);
      }
    }
  }

  const cappedMissing = expectedBars > 0 ? Math.min(missingBars, expectedBars) : missingBars;
  const coveragePct =
    expectedBars > 0
      ? Math.max(0, Math.min(1, (expectedBars - cappedMissing) / expectedBars))
      : null;

  return {
    expectedBars,
    missingBars: cappedMissing,
    gapCount,
    maxGapMs: maxGapMs > 0 ? maxGapMs : null,
    coveragePct,
    firstTs,
    lastTs
  };
}

function normalizeStreamEndpoint(rawUrl, env) {
  const defaults = {
    origin: env === 'live' ? 'https://api.tradelocker.com' : 'https://api-dev.tradelocker.com',
    namespace: '/streams-api',
    path: '/streams-api/socket.io'
  };
  const text = String(rawUrl || '').trim();
  if (!text) {
    return {
      ...defaults,
      connectUrl: `${defaults.origin}${defaults.namespace}`,
      displayUrl: `${defaults.origin}${defaults.path}`
    };
  }

  let normalized = text;
  if (!/^[a-z]+:\/\//i.test(normalized)) normalized = `https://${normalized}`;
  normalized = normalized.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');

  let parsed = null;
  try {
    parsed = new URL(normalized);
  } catch {
    parsed = null;
  }
  if (!parsed) {
    return {
      ...defaults,
      connectUrl: `${defaults.origin}${defaults.namespace}`,
      displayUrl: `${defaults.origin}${defaults.path}`
    };
  }

  const origin = `${parsed.protocol}//${parsed.host}`;
  let namespace = defaults.namespace;
  let path = defaults.path;
  const pathname = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';

  if (pathname) {
    if (/socket\.io/i.test(pathname)) {
      path = pathname;
      if (/\/streams-api/i.test(pathname)) namespace = '/streams-api';
    } else if (/streams-api/i.test(pathname)) {
      namespace = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
      if (!namespace.startsWith('/')) namespace = `/${namespace}`;
      path = `${namespace}/socket.io`;
    }
  }

  return {
    origin,
    namespace,
    path,
    connectUrl: `${origin}${namespace}`,
    displayUrl: `${origin}${path}`
  };
}

function parseStreamSubscribe(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeStreamPayload(raw) {
  if (raw == null) return raw;
  if (Buffer.isBuffer(raw)) {
    raw = raw.toString('utf8');
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return raw;
    const parsed = safeJsonParse(trimmed);
    return parsed ?? raw;
  }
  return raw;
}

function isStreamSyncEnd(payload, eventName) {
  const eventType = String(eventName || '').trim().toLowerCase();
  if (eventType === 'syncend') return true;
  if (!payload || typeof payload !== 'object') return false;
  const typeRaw = String(payload?.type || payload?.event || eventName || '').trim().toLowerCase();
  const nameRaw = String(payload?.name || payload?.data?.name || payload?.propertyName || '').trim().toLowerCase();
  if (typeRaw === 'property' && nameRaw === 'syncend') return true;
  if (typeRaw === 'syncend' || nameRaw === 'syncend') return true;
  return false;
}

function normalizeStreamStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function classifyStreamError(raw, { phase = '' } = {}) {
  const message = redactErrorMessage(raw?.message ? String(raw.message) : String(raw || 'Stream error'));
  const text = message.toLowerCase();
  const phaseLower = String(phase || '').toLowerCase();
  if (text.includes('invalidapikey') || text.includes('invalid api key') || text.includes('developer api key')) {
    return { reason: 'invalid_developer_key', message };
  }
  if (text.includes('unauthorized') && text.includes('apikey')) {
    return { reason: 'invalid_developer_key', message };
  }
  if (text.includes('token') && (text.includes('expired') || text.includes('invalid') || text.includes('unauthorized'))) {
    return { reason: 'invalid_stream_token', message };
  }
  if (text.includes('timed out') || text.includes('timeout')) {
    const reason = phaseLower === 'subscribe' ? 'timeout_subscribe_ack' : 'timeout_connect';
    return { reason, message };
  }
  if (
    text.includes('econnreset') ||
    text.includes('ehostunreach') ||
    text.includes('enetunreach') ||
    text.includes('getaddrinfo') ||
    text.includes('network') ||
    text.includes('offline')
  ) {
    return { reason: 'network', message };
  }
  if (
    text.includes('disconnect') ||
    text.includes('transport close') ||
    text.includes('server disconnect') ||
    text.includes('io server disconnect') ||
    text.includes('ping timeout')
  ) {
    return { reason: 'server_disconnect', message };
  }
  return { reason: 'unknown', message };
}

function normalizeEpochMs(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asNum = parseNumberLoose(trimmed);
    if (asNum != null) {
      if (asNum > 1e11) return Math.floor(asNum);
      if (asNum > 0) return Math.floor(asNum * 1000);
    }
    const parsed = parseDateLoose(trimmed);
    return parsed ? parsed.getTime() : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1e11) return Math.floor(value);
    if (value > 0) return Math.floor(value * 1000);
    return null;
  }
  const parsed = parseDateLoose(value);
  return parsed ? parsed.getTime() : null;
}

function parseLookbackMs(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d+)\s*([a-zA-Z]+)$/);
  if (!match) return null;
  const count = Number(match[1]);
  const unit = String(match[2] || '').trim().toLowerCase();
  if (!Number.isFinite(count) || count <= 0) return null;
  const unitKey = unit === 'm' ? 'm' : unit.toUpperCase();
  switch (unitKey) {
    case 'S':
      return count * 1000;
    case 'm':
      return count * 60_000;
    case 'H':
      return count * 60 * 60_000;
    case 'D':
      return count * 24 * 60 * 60_000;
    case 'W':
      return count * 7 * 24 * 60 * 60_000;
    case 'M':
      return count * 30 * 24 * 60 * 60_000;
    case 'Y':
      return count * 365 * 24 * 60 * 60_000;
    default:
      return null;
  }
}

function normalizeQuotePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const bid = parseNumberLoose(pickFirst(payload, ['bp', 'bid', 'bidPrice', 'bid_price']));
  const ask = parseNumberLoose(pickFirst(payload, ['ap', 'ask', 'askPrice', 'ask_price']));
  const last = parseNumberLoose(pickFirst(payload, ['p', 'price', 'last', 'lastPrice']));
  const bidSize = parseNumberLoose(pickFirst(payload, ['bs', 'bidSize', 'bid_size']));
  const askSize = parseNumberLoose(pickFirst(payload, ['as', 'askSize', 'ask_size']));
  const timestampRaw = pickFirst(payload, ['t', 'time', 'timestamp', 'ts']);
  const timestampMs = normalizeEpochMs(timestampRaw);
  const mid = bid != null && ask != null ? (bid + ask) / 2 : (last != null ? last : (bid != null ? bid : ask));
  const spread = bid != null && ask != null ? ask - bid : null;

  if (bid == null && ask == null && last == null) return null;

  return {
    bid,
    ask,
    last,
    bidSize,
    askSize,
    mid,
    spread,
    timestampMs
  };
}

function mapQuoteFromColumns(container) {
  if (!container || typeof container !== 'object') return null;
  const columns = Array.isArray(container?.columns) ? container.columns : (Array.isArray(container?.cols) ? container.cols : null);
  const rows = Array.isArray(container?.data) ? container.data : (Array.isArray(container?.rows) ? container.rows : null);
  if (!columns || !rows || rows.length === 0) return null;
  const row = rows[0];
  const mapped = Array.isArray(row) ? mapRowToObject(row, columns) : (row && typeof row === 'object' ? row : null);
  return mapped ? normalizeQuotePayload(mapped) : null;
}

function extractQuotePayload(payload) {
  if (!payload) return null;
  const candidates = [];
  const list = [];
  const pushObj = (value) => {
    if (value && typeof value === 'object') candidates.push(value);
  };
  const pushList = (value) => {
    if (Array.isArray(value)) list.push(...value);
  };

  pushObj(payload);
  pushObj(payload?.quote);
  pushObj(payload?.q);
  pushObj(payload?.data);
  pushObj(payload?.d);
  pushObj(payload?.result);
  pushObj(payload?.payload);

  for (const cand of candidates) {
    const mapped = mapQuoteFromColumns(cand);
    if (mapped) return mapped;
    const direct = normalizeQuotePayload(cand);
    if (direct) return direct;
    if (Array.isArray(cand)) pushList(cand);
    if (Array.isArray(cand?.quotes)) pushList(cand.quotes);
    if (Array.isArray(cand?.data)) pushList(cand.data);
    if (Array.isArray(cand?.d)) pushList(cand.d);
  }

  for (const item of list) {
    const mapped = mapQuoteFromColumns(item);
    if (mapped) return mapped;
    const cand = item?.quote ?? item?.q ?? item;
    const direct = normalizeQuotePayload(cand);
    if (direct) return direct;
  }

  return null;
}

function summarizeInstrument(inst) {
  if (!inst || typeof inst !== 'object') return null;
  const names = [
    inst?.name,
    inst?.localizedName,
    inst?.symbol,
    inst?.ticker,
    inst?.instrument,
    inst?.displayName,
    inst?.tradingSymbol,
    inst?.tradableInstrumentName
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);

  const routes = Array.isArray(inst?.routes) ? inst.routes : [];
  const routeSummary = routes.slice(0, 40).map((r) => ({
    id: r?.id ?? null,
    type: r?.type ?? null,
    name: r?.name ?? null,
    status: r?.status ?? null
  }));

  const routeFields = {
    infoRouteId: inst?.infoRouteId ?? inst?.infoRouteID ?? null,
    quoteRouteId: inst?.quoteRouteId ?? inst?.quoteRouteID ?? null,
    priceRouteId: inst?.priceRouteId ?? inst?.priceRouteID ?? null,
    marketRouteId: inst?.marketRouteId ?? inst?.marketRouteID ?? null,
    marketDataRouteId: inst?.marketDataRouteId ?? inst?.marketDataRouteID ?? null,
    dataRouteId: inst?.dataRouteId ?? inst?.dataRouteID ?? null,
    routeId: inst?.routeId ?? inst?.routeID ?? null,
    tradeRouteId: inst?.tradeRouteId ?? inst?.tradeRouteID ?? null,
    executionRouteId: inst?.executionRouteId ?? inst?.executionRouteID ?? null
  };

  return {
    tradableInstrumentId: inst?.tradableInstrumentId ?? null,
    name: inst?.name ?? null,
    localizedName: inst?.localizedName ?? null,
    names: Array.from(new Set(names)),
    routes: routeSummary,
    routeFields
  };
}

function setCacheValue(cacheMap, key, value, maxEntries = 60) {
  if (!cacheMap || typeof cacheMap.set !== 'function') return;
  cacheMap.set(key, value);
  if (cacheMap.size <= maxEntries) return;
  const oldestKey = cacheMap.keys().next().value;
  if (oldestKey !== undefined) cacheMap.delete(oldestKey);
}

function pickNumberLooseDeep(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  const parents = ['trade', 'trading', 'order', 'orders', 'settings', 'constraints', 'limits', 'spec', 'specs', 'meta', 'metadata'];
  for (const key of keys) {
    const direct = parseNumberLoose(obj?.[key]);
    if (direct != null) return direct;
    for (const parent of parents) {
      const nested = obj?.[parent];
      const v = parseNumberLoose(nested?.[key]);
      if (v != null) return v;
    }
  }
  return null;
}

function clampDecimalsDown(value, decimals) {
  const n = Number(value);
  if (!Number.isFinite(n)) return n;
  const d = Number.isFinite(Number(decimals)) ? Math.max(0, Math.min(12, Math.floor(Number(decimals)))) : 8;
  const pow = 10 ** d;
  return Math.floor(n * pow) / pow;
}

function normalizeOrderQuantity(inst, requestedQty) {
  const qty = Number(requestedQty);
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: 'Order qty must be > 0.' };

  const minQty =
    pickNumberLooseDeep(inst, [
      'minQty',
      'minQuantity',
      'minVolume',
      'minLot',
      'minLots',
      'minOrderQty',
      'minOrderQuantity',
      'minTradeQty',
      'minTradeQuantity',
      'qtyMin',
      'quantityMin',
      'volumeMin',
      'lotMin'
    ]) ?? null;

  const maxQty =
    pickNumberLooseDeep(inst, [
      'maxQty',
      'maxQuantity',
      'maxVolume',
      'maxLot',
      'maxLots',
      'maxOrderQty',
      'maxOrderQuantity',
      'maxTradeQty',
      'maxTradeQuantity',
      'qtyMax',
      'quantityMax',
      'volumeMax',
      'lotMax',
      'maxPositionQty',
      'maxPositionSize'
    ]) ?? null;

  const qtyStep =
    pickNumberLooseDeep(inst, [
      'qtyStep',
      'quantityStep',
      'volumeStep',
      'lotStep',
      'stepQty',
      'stepQuantity',
      'stepVolume',
      'qtyIncrement',
      'quantityIncrement',
      'volumeIncrement',
      'lotIncrement',
      'step'
    ]) ?? null;

  const qtyPrecision =
    pickNumberLooseDeep(inst, ['qtyPrecision', 'quantityPrecision', 'volumePrecision', 'lotPrecision', 'precision', 'decimals']) ?? null;

  let normalized = qty;

  if (qtyPrecision != null && qtyPrecision >= 0) {
    normalized = clampDecimalsDown(normalized, qtyPrecision);
  } else {
    normalized = clampDecimalsDown(normalized, 8);
  }

  if (qtyStep != null && qtyStep > 0) {
    normalized = Math.floor(normalized / qtyStep) * qtyStep;
    normalized = clampDecimalsDown(normalized, 12);
  }

  if (!Number.isFinite(normalized) || normalized <= 0) {
    return { ok: false, error: 'Order qty rounds to 0 for this instrument.' };
  }

  if (minQty != null && minQty > 0 && normalized < minQty) {
    const msg = `Order qty ${normalized} is below instrument minimum ${minQty}.`;
    return { ok: false, error: msg, minQty, maxQty, qtyStep, qtyPrecision, normalizedQty: normalized };
  }

  if (maxQty != null && maxQty > 0 && normalized > maxQty) {
    const msg = `Order qty ${normalized} exceeds instrument maximum ${maxQty}.`;
    return { ok: false, error: msg, minQty, maxQty, qtyStep, qtyPrecision, normalizedQty: normalized };
  }

  return { ok: true, qty: normalized, minQty, maxQty, qtyStep, qtyPrecision, normalizedQty: normalized };
}

function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return n.toFixed(decimals).replace(/\.?0+$/, '');
}

function extractInstrumentConstraints(inst) {
  if (!inst || typeof inst !== 'object') return { minStopDistance: null, priceStep: null, sessionId: null, sessionStatusId: null };

  const minStopDistance =
    pickNumberLooseDeep(inst, [
      'minStopDistance',
      'minStopLossDistance',
      'minStopLoss',
      'minStop',
      'stopDistance',
      'stopsLevel',
      'stopLevel',
      'minSlDistance',
      'minTpDistance',
      'stopLossMinDistance',
      'takeProfitMinDistance'
    ]) ?? null;

  const minStopPips =
    pickNumberLooseDeep(inst, [
      'minStopDistancePips',
      'minStopPips',
      'stopsLevelPips',
      'stopLevelPips'
    ]) ?? null;

  const pipSize =
    pickNumberLooseDeep(inst, [
      'pipSize',
      'pip',
      'pipValue',
      'pipStep',
      'pipSizeValue'
    ]) ?? null;

  const priceStep =
    pickNumberLooseDeep(inst, [
      'tickSize',
      'priceStep',
      'minPriceStep',
      'minStep',
      'step'
    ]) ?? null;

  let minStop = minStopDistance;
  if (minStop == null && minStopPips != null) {
    const scale = pipSize != null ? pipSize : priceStep;
    if (scale != null) minStop = minStopPips * scale;
  }

  const sessionId =
    pickNumberLooseDeep(inst, ['sessionId', 'tradeSessionId', 'tradingSessionId', 'marketSessionId']) ?? null;
  const sessionStatusId =
    pickNumberLooseDeep(inst, ['sessionStatusId', 'sessionStatusID', 'sessionStatus']) ?? null;

  return {
    minStopDistance: minStop,
    priceStep,
    sessionId,
    sessionStatusId
  };
}

function parseSessionOpen(status) {
  if (!status || typeof status !== 'object') return null;
  const boolFrom = (value) => {
    if (typeof value === 'boolean') return value;
    const s = String(value || '').trim().toLowerCase();
    if (!s) return null;
    if (['true', '1', 'yes', 'open', 'trading', 'active'].includes(s)) return true;
    if (['false', '0', 'no', 'closed', 'halted', 'inactive', 'suspended'].includes(s)) return false;
    return null;
  };

  for (const key of ['isOpen', 'isTrading', 'isMarketOpen', 'open', 'active']) {
    const v = boolFrom(status?.[key]);
    if (v != null) return v;
  }

  const label = String(status?.status || status?.state || status?.sessionStatus || status?.marketStatus || '').trim().toUpperCase();
  if (label.includes('OPEN') || label.includes('TRADING') || label.includes('ACTIVE')) return true;
  if (label.includes('CLOSED') || label.includes('HALT') || label.includes('SUSPEND')) return false;
  return null;
}

function validateStopDistances({ stopLoss, takeProfit, refPrice, minStopDistance }) {
  const minDist = Number(minStopDistance);
  const price = Number(refPrice);
  if (!Number.isFinite(minDist) || minDist <= 0) return null;
  if (!Number.isFinite(price) || price <= 0) return null;

  const sl = parseNumberLoose(stopLoss);
  if (sl != null && Math.abs(price - sl) < minDist) {
    return `Stop loss is too close to price. Min distance ${formatNumber(minDist)}.`;
  }

  const tp = parseNumberLoose(takeProfit);
  if (tp != null && Math.abs(price - tp) < minDist) {
    return `Take profit is too close to price. Min distance ${formatNumber(minDist)}.`;
  }

  return null;
}

function parseDateLoose(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const num = typeof value === 'number' ? value : null;
  if (num != null && Number.isFinite(num)) {
    const d = new Date(num);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function columnTextLower(col) {
  const parts = [
    col?.id,
    col?.name,
    col?.label,
    col?.title,
    col?.caption,
    col?.description,
    col?.localizedName,
    col?.localizedDescription,
    col?.tooltip,
    col?.displayName
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  return parts.join(' ').toLowerCase();
}

function collapseSearchKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function extractSymbolCandidates(raw) {
  const input = String(raw || '').trim();
  if (!input) return [];

  const out = [];
  const seen = new Set();
  const push = (v) => {
    const s = String(v || '').trim();
    if (!s) return;
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };

  push(input);

  // If user/agent sends a URL, try to extract ?symbol=... (TradingView style).
  try {
    if (/^https?:\/\//i.test(input)) {
      const u = new URL(input);
      const sym = u.searchParams?.get?.('symbol');
      if (sym) {
        let decoded = sym;
        try { decoded = decodeURIComponent(sym); } catch {}
        push(decoded);
      }
    }
  } catch {
    // ignore URL parse errors
  }

  // Also support strings that contain symbol=... without being a valid URL.
  const symMatch = input.match(/[?&]symbol=([^&\s]+)/i);
  if (symMatch && symMatch[1]) {
    let decoded = symMatch[1];
    try { decoded = decodeURIComponent(decoded); } catch {}
    push(decoded);
  }

  // If there's an "exchange:symbol" prefix, try the part after the last colon.
  if (input.includes(':')) {
    push(input.split(':').pop());
  }

  // If the string contains spaces, use the first token.
  const firstToken = input.split(/\s+/).filter(Boolean)[0];
  if (firstToken && firstToken !== input) push(firstToken);

  // Strip common suffix delimiters (e.g., BTCUSD.P, BTCUSDm).
  const dotIdx = input.indexOf('.');
  if (dotIdx > 0) push(input.slice(0, dotIdx));

  const dashIdx = input.indexOf('-');
  if (dashIdx > 0) push(input.slice(0, dashIdx));

  const pipeIdx = input.indexOf('|');
  if (pipeIdx > 0) push(input.slice(0, pipeIdx));

  // Handle "symbol=EXCHANGE:PAIR" like values extracted above.
  for (const v of [...out]) {
    if (v.includes(':')) push(v.split(':').pop());
  }

  return out;
}

function scoreInstrumentMatch(inst, query) {
  const q = String(query || '').trim();
  if (!q) return 0;

  const qLower = q.toLowerCase();
  const qUpper = q.toUpperCase();
  const qCollapsed = collapseSearchKey(q);

  const name = String(inst?.name || '').trim();
  const localized = String(inst?.localizedName || '').trim();
  const desc = String(inst?.description || inst?.localizedDescription || '').trim();

  const nameUpper = name.toUpperCase();
  const localizedUpper = localized.toUpperCase();

  const nameLower = name.toLowerCase();
  const localizedLower = localized.toLowerCase();
  const descLower = desc.toLowerCase();

  const nameCollapsed = collapseSearchKey(name);
  const localizedCollapsed = collapseSearchKey(localized);

  let score = 0;

  if (nameUpper === qUpper) score += 1000;
  if (localizedUpper && localizedUpper === qUpper) score += 900;

  if (nameUpper.startsWith(qUpper)) score += 800;
  if (localizedUpper && localizedUpper.startsWith(qUpper)) score += 700;

  if (qCollapsed) {
    if (nameCollapsed === qCollapsed) score += 650;
    if (localizedCollapsed && localizedCollapsed === qCollapsed) score += 600;
    if (nameCollapsed.startsWith(qCollapsed)) score += 550;
    if (localizedCollapsed && localizedCollapsed.startsWith(qCollapsed)) score += 520;
  }

  if (nameLower.includes(qLower)) score += 450;
  if (localizedLower && localizedLower.includes(qLower)) score += 420;
  if (descLower && descLower.includes(qLower)) score += 120;

  // Prefer shorter symbols for the same match quality (e.g., BTCUSD over BTCUSDm if both match).
  if (score > 0 && name) score += Math.max(0, 30 - Math.min(30, name.length));

  return score;
}

function toUpperSide(side) {
  const v = String(side || '').trim().toUpperCase();
  if (v === 'BUY') return 'BUY';
  if (v === 'SELL') return 'SELL';
  if (v === 'LONG') return 'BUY';
  if (v === 'SHORT') return 'SELL';
  if (v === 'B' || v === 'BUY') return 'BUY';
  if (v === 'S' || v === 'SELL') return 'SELL';
  const lower = String(side || '').trim().toLowerCase();
  if (lower === 'buy') return 'BUY';
  if (lower === 'sell') return 'SELL';
  return 'BUY';
}

function mapRowToObject(row, columns) {
  const out = {};
  const safeRow = Array.isArray(row) ? row : [];
  const safeCols = Array.isArray(columns) ? columns : [];
  for (let i = 0; i < safeCols.length; i++) {
    const id = safeCols[i]?.id;
    if (!id) continue;
    out[id] = safeRow[i];
  }
  return out;
}

function pickFirst(obj, keys) {
  for (const key of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null && String(obj[key]).trim() !== '') {
      return obj[key];
    }
  }
  return null;
}

function getStreamItemId(raw, keys) {
  if (!raw || typeof raw !== 'object') return null;
  const value = pickFirst(raw, keys);
  if (value == null) return null;
  const id = String(value).trim();
  return id ? id : null;
}

function normalizeTokenPayload(json) {
  if (!json || typeof json !== 'object') return null;
  const candidate = json.data || json.result || json.payload || json.token || json;
  if (candidate && typeof candidate === 'object') {
    if (candidate.token && typeof candidate.token === 'object') return candidate.token;
    if (candidate.tokens && typeof candidate.tokens === 'object') return candidate.tokens;
    return candidate;
  }
  return json;
}

function extractTokenInfo(json) {
  const payload = normalizeTokenPayload(json);
  const accessToken = pickFirst(payload, [
    'accessToken',
    'access_token',
    'token',
    'jwt',
    'idToken',
    'id_token',
    'access',
    'accessJwt'
  ]);
  const refreshToken = pickFirst(payload, [
    'refreshToken',
    'refresh_token',
    'refresh',
    'refreshJwt',
    'refreshJwtToken'
  ]);
  const expireDate = pickFirst(payload, ['expireDate', 'expiresAt', 'expires_at', 'expireAt', 'expiry', 'expiration', 'expiryDate']);
  const expiresInRaw = payload && typeof payload === 'object' ? (payload.expiresIn ?? payload.expires_in) : null;
  let expireAtMs = expireDate ? parseDateLoose(expireDate)?.getTime() || null : null;
  if (!expireAtMs && expiresInRaw != null && Number.isFinite(Number(expiresInRaw))) {
    const seconds = Number(expiresInRaw);
    const ms = seconds > 10_000 ? seconds : seconds * 1000;
    expireAtMs = nowMs() + ms;
  }
  return {
    accessToken,
    refreshToken,
    expireAtMs,
    rootKeys: json && typeof json === 'object' ? Object.keys(json) : [],
    payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload) : []
  };
}

function extractStreamTokens(json) {
  if (!json || typeof json !== 'object') return [];
  const root = json.data || json.d || json.result || json.payload || json;
  let list = null;
  if (Array.isArray(root?.accountsTokens)) list = root.accountsTokens;
  else if (Array.isArray(root?.accounts)) list = root.accounts;
  else if (Array.isArray(root?.tokens)) list = root.tokens;
  else if (Array.isArray(root)) list = root;
  else list = [];

  return list
    .map((entry) => {
      const token = pickFirst(entry, ['token', 'jwt', 'accessToken', 'streamToken']);
      if (!token) return null;
      const accountId = pickFirst(entry, ['accountId', 'accountID', 'id']);
      const brandId = pickFirst(entry, ['brandId', 'brandID']);
      const expireDate = pickFirst(entry, ['expireDate', 'expiresAt', 'expireAt', 'expiration', 'expiry']);
      const expireAtMs = normalizeEpochMs(expireDate);
      return {
        token: String(token),
        accountId: accountId != null && accountId !== '' ? Number(accountId) : null,
        brandId: brandId != null && brandId !== '' ? String(brandId) : null,
        expireAtMs: expireAtMs ?? null
      };
    })
    .filter(Boolean);
}

function extractErrorDetail(json) {
  if (!json || typeof json !== 'object') return null;
  const msg = pickFirst(json, ['message', 'error', 'detail', 'title', 'msg', 'reason']);
  if (msg) return String(msg);
  if (json.data && typeof json.data === 'object') {
    const nested = pickFirst(json.data, ['message', 'error', 'detail', 'title', 'msg', 'reason']);
    if (nested) return String(nested);
  }
  return null;
}

class TradeLockerClient {
  constructor() {
    this.state = loadPersistedState();
    this.tokens = null;
    this.lastError = null;
    this.lastOrderDebug = null;
    this.config = null;
    this.rateLimitConfig = null;
    this.rateLimitBuckets = new Map();
    this.routeRateLimitedUntilMs = new Map();
    this.instruments = null;
    this.instrumentsByTradableId = new Map();
    this.instrumentsByNameLower = new Map();
    this.accountsCache = { accounts: [], fetchedAtMs: 0 };
    this.refreshInFlight = null;
    this.rateLimitedUntilMs = 0;
    this.upstreamFailureCount = 0;
    this.upstreamFailureWindowStartMs = 0;
    this.upstreamBackoffUntilMs = 0;
    this.upstreamLastError = null;
    this.upstreamLastStatus = null;
    this.upstreamFailureCount = 0;
    this.upstreamFailureWindowStartMs = 0;
    this.upstreamBackoffUntilMs = 0;
    this.upstreamLastError = null;
    this.upstreamLastStatus = null;
    this.snapshotCache = null;
    this.snapshotCacheAtMs = 0;
    this.snapshotInFlight = null;
    this.snapshotCacheWithOrders = null;
    this.snapshotCacheWithOrdersAtMs = 0;
    this.snapshotInFlightWithOrders = null;
    this.accountMetricsCache = null;
    this.accountMetricsCacheAtMs = 0;
    this.accountMetricsInFlight = null;
    this.quoteCache = new Map();
    this.dailyBarCache = new Map();
    this.historyCache = new Map();
    this.historyStore = new MarketHistoryStore({
      maxBarsPerSeries: toPositiveInt(process.env.GLASS_TRADELOCKER_HISTORY_MAX_BARS, 60_000),
      persistDelayMs: toPositiveInt(process.env.GLASS_TRADELOCKER_HISTORY_PERSIST_MS, 800)
    });
    this.instrumentDetailsCache = new Map();
    this.sessionStatusCache = new Map();
    this.infoRouteCache = new Map();
    this.sessionDeveloperApiKey = null;
    this.accountRouteHealthy = false;
    this.accountRouteDegradedReason = 'account_not_ready';
    this.lastAccountAuthError = null;
    this.lastAccountAuthAtMs = null;
    this.streamTokensCache = { tokens: [], fetchedAtMs: 0, minExpireAtMs: 0 };
    this.streamTokensInFlight = null;
    this.stream = { status: STREAM_STATUS.DISCONNECTED, lastError: null, lastMessageAtMs: 0, url: null, reason: null, detail: null };
    this.streamSocket = null;
    this.streamEndpoint = null;
    this.streamSyncState = null;
    this.streamSyncTimer = null;
    this.streamReconnectTimer = null;
    this.streamTokenRefreshTimer = null;
    this.streamHealthTimer = null;
    this.streamSubscribeInFlight = false;
    this.streamSubscribeNonce = 0;
    this.streamSubscribeStartedAtMs = 0;
    this.streamSyncRevision = 0;
    this.streamActiveSubscribeNonce = 0;
    this.streamDebugCounters = {
      quote: 0,
      positions: 0,
      position: 0,
      orders: 0,
      order: 0,
      account: 0,
      raw: 0
    };
    this.streamStopRequested = false;
    this.streamListeners = new Set();

    this.requestQueue = [];
    this.requestInFlightCount = 0;
    this.requestConcurrency = REQUEST_CONCURRENCY;
    this.requestWakeTimer = null;
    this.lastRequestAtMs = 0;
    this.minRequestIntervalMs = 900;
    this.baseRequestConcurrency = this.requestConcurrency;
    this.baseMinRequestIntervalMs = this.minRequestIntervalMs;
    this.requestQueueMetrics = createQueueMetrics();
    this.rateLimitConfig = null;
    this.rateLimitBuckets = new Map();
    this.routeRateLimitedUntilMs = new Map();
    this.rateLimitPolicy = normalizeRateLimitProfileName(RATE_LIMIT_PROFILE_DEFAULT, 'balanced');
    this.rateLimitTelemetry = null;
    this.rateLimitRouteStats = new Map();
    this.rateLimitAccountStats = new Map();
    this.resetRateLimitTelemetryState();
    this.migrateLegacySecretsToCurrentProfile();
  }

  migrateLegacySecretsToCurrentProfile() {
    const env = normalizeEnv(this.state?.env);
    const server = String(this.state?.server || '').trim();
    const email = String(this.state?.email || '').trim();
    const profileKey = buildTradeLockerProfileSecretKey({ env, server, email });
    if (!profileKey) return;
    const secrets = this.state?.secrets || {};
    const legacyPassword = secrets?.password || null;
    const legacyDeveloperApiKey = secrets?.developerApiKey || null;
    if (!legacyPassword && !legacyDeveloperApiKey) return;
    const map = ensureTradeLockerProfileSecretMap(this.state);
    const entry = map[profileKey] && typeof map[profileKey] === 'object' ? { ...map[profileKey] } : {};
    let mutated = false;
    if (!entry.password && legacyPassword) {
      entry.password = legacyPassword;
      mutated = true;
    }
    if (!entry.developerApiKey && legacyDeveloperApiKey) {
      entry.developerApiKey = legacyDeveloperApiKey;
      mutated = true;
    }
    if (!mutated) return;
    map[profileKey] = entry;
    persistState(this.state);
  }

  resetAccountRouteHealth(reason = 'account_not_ready') {
    this.accountRouteHealthy = false;
    this.accountRouteDegradedReason = reason || 'account_not_ready';
    this.lastAccountAuthError = null;
    this.lastAccountAuthAtMs = null;
  }

  noteAccountRouteHealthy() {
    this.accountRouteHealthy = true;
    this.accountRouteDegradedReason = null;
    this.lastAccountAuthError = null;
    this.lastAccountAuthAtMs = nowMs();
  }

  noteAccountRouteFailure(reason, errorMessage = null) {
    this.accountRouteHealthy = false;
    this.accountRouteDegradedReason = String(reason || 'account_auth_invalid');
    this.lastAccountAuthError = errorMessage ? redactErrorMessage(String(errorMessage)) : null;
    this.lastAccountAuthAtMs = nowMs();
  }

  getConnectionStateSnapshot() {
    const tokenConnected = !!(this.tokens && this.tokens.accessToken);
    const accountId = parseAccountIdentifier(this.state.accountId);
    const accNum = parseAccountIdentifier(this.state.accNum);
    const accountContextReady = accountId != null && accNum != null;
    const accountRouteHealthy = tokenConnected && accountContextReady && this.accountRouteHealthy === true;

    let connectionState = 'disconnected';
    let degradedReason = null;
    if (tokenConnected) {
      if (!accountContextReady) {
        connectionState = 'degraded_account_auth';
        degradedReason = 'account_not_ready';
      } else if (!accountRouteHealthy) {
        connectionState = 'degraded_account_auth';
        degradedReason = this.accountRouteDegradedReason || 'account_auth_invalid';
      } else {
        connectionState = 'connected';
      }
    } else if (this.lastError) {
      connectionState = 'error';
    }

    return {
      tokenConnected,
      accountContextReady,
      accountRouteHealthy,
      connectionState,
      degradedReason
    };
  }

  resetRateLimitTelemetryState() {
    const now = nowMs();
    const baseConcurrency = Math.max(1, Number(this.baseRequestConcurrency || REQUEST_CONCURRENCY) || 1);
    const baseInterval = Math.max(100, Number(this.baseMinRequestIntervalMs || 900) || 900);
    const policy = normalizeRateLimitProfileName(this.rateLimitPolicy, RATE_LIMIT_PROFILE_DEFAULT);
    const profile = getRateLimitProfileConfig(policy);
    this.rateLimitPolicy = policy;
    this.requestConcurrency = baseConcurrency;
    this.minRequestIntervalMs = baseInterval;
    this.rateLimitTelemetry = {
      mode: 'normal',
      modeChangedAtMs: now,
      policy,
      pressure: 0,
      policyThresholds: {
        guardedThreshold: Number(profile.guardedThreshold || RATE_LIMIT_GUARDED_THRESHOLD),
        cooldownThreshold: Number(profile.cooldownThreshold || RATE_LIMIT_COOLDOWN_THRESHOLD),
        guardedPressure: Number(profile.guardedPressure || 0),
        cooldownPressure: Number(profile.cooldownPressure || 0),
        recoveryStreak: Number(profile.recoveryStreak || RATE_LIMIT_RECOVERY_STREAK),
        maxIntervalMs: Number(profile.maxIntervalMs || RATE_LIMIT_MAX_INTERVAL_MS)
      },
      windowMs: RATE_LIMIT_WINDOW_MS,
      windowStartedAtMs: now,
      windowRequests: 0,
      window429: 0,
      windowBlocked: 0,
      totalRequests: 0,
      total429: 0,
      totalBlocked: 0,
      totalErrors: 0,
      totalSuccess: 0,
      consecutive429: 0,
      consecutiveSuccess: 0,
      adaptiveMinIntervalMs: baseInterval,
      baseMinIntervalMs: baseInterval,
      adaptiveRequestConcurrency: baseConcurrency,
      baseRequestConcurrency: baseConcurrency,
      last429AtMs: 0,
      lastSuccessAtMs: 0,
      lastBlockedAtMs: 0,
      lastRouteKey: null,
      lastAccountKey: null
    };
    this.rateLimitRouteStats = new Map();
    this.rateLimitAccountStats = new Map();
  }

  rotateRateLimitTelemetryWindow(now = nowMs()) {
    if (!this.rateLimitTelemetry) return;
    const windowMs = Math.max(5_000, Number(this.rateLimitTelemetry.windowMs || RATE_LIMIT_WINDOW_MS) || RATE_LIMIT_WINDOW_MS);
    if (now - Number(this.rateLimitTelemetry.windowStartedAtMs || 0) < windowMs) return;
    this.rateLimitTelemetry.windowStartedAtMs = now;
    this.rateLimitTelemetry.windowRequests = 0;
    this.rateLimitTelemetry.window429 = 0;
    this.rateLimitTelemetry.windowBlocked = 0;
    if (this.rateLimitRouteStats && this.rateLimitRouteStats.size > 0) {
      for (const route of this.rateLimitRouteStats.values()) {
        route.windowRequests = 0;
        route.window429 = 0;
        route.windowBlocked = 0;
        if (Number(route.blockedUntilMs || 0) > 0 && Number(route.blockedUntilMs) <= now) {
          route.blockedUntilMs = 0;
        }
      }
    }
    if (this.rateLimitAccountStats && this.rateLimitAccountStats.size > 0) {
      for (const account of this.rateLimitAccountStats.values()) {
        account.windowRequests = 0;
        account.window429 = 0;
        account.windowBlocked = 0;
        if (Number(account.blockedUntilMs || 0) > 0 && Number(account.blockedUntilMs) <= now) {
          account.blockedUntilMs = 0;
        }
      }
    }
  }

  getRateLimitTelemetryRouteKey({ method = 'GET', pathname = '' } = {}) {
    const routeKey = buildRouteKey(method, pathname);
    if (routeKey) return routeKey;
    const verb = String(method || 'GET').toUpperCase();
    const pathKey = normalizePathForKey(pathname);
    return `${verb} ${pathKey || '/'}`;
  }

  ensureRateLimitRouteTelemetry({ method = 'GET', pathname = '' } = {}) {
    if (!this.rateLimitRouteStats) this.rateLimitRouteStats = new Map();
    const key = this.getRateLimitTelemetryRouteKey({ method, pathname });
    const verb = String(method || 'GET').toUpperCase();
    const pathKey = normalizePathForKey(pathname);
    const existing = this.rateLimitRouteStats.get(key);
    if (existing) {
      existing.method = verb;
      if (pathKey) existing.path = pathKey;
      return existing;
    }
    const next = {
      routeKey: key,
      method: verb,
      path: pathKey || null,
      windowRequests: 0,
      window429: 0,
      windowBlocked: 0,
      totalRequests: 0,
      total429: 0,
      totalBlocked: 0,
      lastStatus: null,
      lastError: null,
      lastRequestAtMs: 0,
      last429AtMs: 0,
      lastBlockedAtMs: 0,
      blockedUntilMs: 0,
      retryAfterMs: 0,
      avgLatencyMs: null,
      latencySamples: 0
    };
    this.rateLimitRouteStats.set(key, next);
    this.trimRateLimitRouteTelemetry();
    return next;
  }

  trimRateLimitRouteTelemetry() {
    if (!this.rateLimitRouteStats || this.rateLimitRouteStats.size <= RATE_LIMIT_ROUTE_CAP) return;
    const entries = Array.from(this.rateLimitRouteStats.values())
      .sort((a, b) => Number(a.lastRequestAtMs || 0) - Number(b.lastRequestAtMs || 0));
    const removeCount = this.rateLimitRouteStats.size - RATE_LIMIT_ROUTE_CAP;
    for (let i = 0; i < removeCount; i += 1) {
      const route = entries[i];
      if (!route?.routeKey) continue;
      this.rateLimitRouteStats.delete(route.routeKey);
    }
  }

  getRateLimitAccountIdentity() {
    const env = normalizeEnv(this.state?.env || 'demo');
    const serverRaw = String(this.state?.server || '').trim();
    const server = serverRaw ? serverRaw.toUpperCase() : null;
    const accountId = parseAccountIdentifier(this.state?.accountId);
    const accNum = parseAccountIdentifier(this.state?.accNum);
    const accountKey = `${env}:${server || 'NA'}:${accountId ?? 'NA'}:${accNum ?? 'NA'}`;
    const label = `${server || 'UNKNOWN'} (${accountId ?? '--'}/${accNum ?? '--'})`;
    return {
      accountKey,
      env,
      server,
      accountId,
      accNum,
      label
    };
  }

  ensureRateLimitAccountTelemetry() {
    if (!this.rateLimitAccountStats) this.rateLimitAccountStats = new Map();
    const identity = this.getRateLimitAccountIdentity();
    const existing = this.rateLimitAccountStats.get(identity.accountKey);
    if (existing) {
      existing.env = identity.env;
      existing.server = identity.server;
      existing.accountId = identity.accountId;
      existing.accNum = identity.accNum;
      existing.label = identity.label;
      return existing;
    }
    const row = {
      accountKey: identity.accountKey,
      env: identity.env,
      server: identity.server,
      accountId: identity.accountId,
      accNum: identity.accNum,
      label: identity.label,
      windowRequests: 0,
      window429: 0,
      windowBlocked: 0,
      totalRequests: 0,
      total429: 0,
      totalBlocked: 0,
      lastStatus: null,
      lastError: null,
      lastRequestAtMs: 0,
      last429AtMs: 0,
      lastBlockedAtMs: 0,
      blockedUntilMs: 0,
      retryAfterMs: 0
    };
    this.rateLimitAccountStats.set(identity.accountKey, row);
    this.trimRateLimitAccountTelemetry();
    return row;
  }

  trimRateLimitAccountTelemetry() {
    if (!this.rateLimitAccountStats || this.rateLimitAccountStats.size <= RATE_LIMIT_ACCOUNT_CAP) return;
    const entries = Array.from(this.rateLimitAccountStats.values())
      .sort((a, b) => Number(a.lastRequestAtMs || 0) - Number(b.lastRequestAtMs || 0));
    const removeCount = this.rateLimitAccountStats.size - RATE_LIMIT_ACCOUNT_CAP;
    for (let i = 0; i < removeCount; i += 1) {
      const row = entries[i];
      if (!row?.accountKey) continue;
      this.rateLimitAccountStats.delete(row.accountKey);
    }
  }

  noteRateLimitTelemetry({
    method = 'GET',
    pathname = '',
    event = 'request',
    status = null,
    retryAfterMs = null,
    blockedUntilMs = null,
    latencyMs = null,
    error = null
  } = {}) {
    if (!this.rateLimitTelemetry) this.resetRateLimitTelemetryState();
    const now = nowMs();
    this.rotateRateLimitTelemetryWindow(now);
    const state = this.rateLimitTelemetry;
    const route = this.ensureRateLimitRouteTelemetry({ method, pathname });
    const account = this.ensureRateLimitAccountTelemetry();

    route.lastRequestAtMs = now;
    if (status != null && Number.isFinite(Number(status))) route.lastStatus = Number(status);
    if (error != null) route.lastError = String(error);
    if (retryAfterMs != null && Number.isFinite(Number(retryAfterMs))) {
      route.retryAfterMs = Math.max(0, Number(retryAfterMs));
    }
    if (blockedUntilMs != null && Number.isFinite(Number(blockedUntilMs))) {
      route.blockedUntilMs = Math.max(Number(route.blockedUntilMs || 0), Number(blockedUntilMs));
    }
    account.lastRequestAtMs = now;
    if (status != null && Number.isFinite(Number(status))) account.lastStatus = Number(status);
    if (error != null) account.lastError = String(error);
    if (retryAfterMs != null && Number.isFinite(Number(retryAfterMs))) {
      account.retryAfterMs = Math.max(0, Number(retryAfterMs));
    }
    if (blockedUntilMs != null && Number.isFinite(Number(blockedUntilMs))) {
      account.blockedUntilMs = Math.max(Number(account.blockedUntilMs || 0), Number(blockedUntilMs));
    }
    if (latencyMs != null && Number.isFinite(Number(latencyMs)) && Number(latencyMs) >= 0) {
      const sample = Math.max(0, Number(latencyMs));
      route.latencySamples = Math.max(0, Number(route.latencySamples || 0)) + 1;
      if (!Number.isFinite(Number(route.avgLatencyMs))) {
        route.avgLatencyMs = sample;
      } else {
        route.avgLatencyMs = Number(route.avgLatencyMs) + (sample - Number(route.avgLatencyMs)) / route.latencySamples;
      }
    }

    if (event === 'request') {
      state.totalRequests += 1;
      state.windowRequests += 1;
      route.totalRequests += 1;
      route.windowRequests += 1;
      account.totalRequests += 1;
      account.windowRequests += 1;
    } else if (event === 'success') {
      state.totalSuccess += 1;
      state.consecutiveSuccess += 1;
      state.consecutive429 = 0;
      state.lastSuccessAtMs = now;
    } else if (event === 'error') {
      state.totalErrors += 1;
      state.consecutiveSuccess = 0;
    } else if (event === 'rate_limited') {
      state.total429 += 1;
      state.totalErrors += 1;
      state.window429 += 1;
      state.consecutive429 += 1;
      state.consecutiveSuccess = 0;
      state.last429AtMs = now;
      route.total429 += 1;
      route.window429 += 1;
      route.last429AtMs = now;
      account.total429 += 1;
      account.window429 += 1;
      account.last429AtMs = now;
      if (blockedUntilMs != null && Number.isFinite(Number(blockedUntilMs))) {
        route.blockedUntilMs = Math.max(Number(route.blockedUntilMs || 0), Number(blockedUntilMs));
        account.blockedUntilMs = Math.max(Number(account.blockedUntilMs || 0), Number(blockedUntilMs));
      }
    } else if (event === 'blocked') {
      state.totalBlocked += 1;
      state.windowBlocked += 1;
      state.lastBlockedAtMs = now;
      route.totalBlocked += 1;
      route.windowBlocked += 1;
      route.lastBlockedAtMs = now;
      account.totalBlocked += 1;
      account.windowBlocked += 1;
      account.lastBlockedAtMs = now;
      if (blockedUntilMs != null && Number.isFinite(Number(blockedUntilMs))) {
        route.blockedUntilMs = Math.max(Number(route.blockedUntilMs || 0), Number(blockedUntilMs));
        account.blockedUntilMs = Math.max(Number(account.blockedUntilMs || 0), Number(blockedUntilMs));
      }
    }

    state.lastRouteKey = route.routeKey || null;
    state.lastAccountKey = account.accountKey || null;
    this.applyRateLimitGovernor(now);
  }

  getRateLimitPolicyConfig() {
    const policy = normalizeRateLimitProfileName(this.rateLimitPolicy, RATE_LIMIT_PROFILE_DEFAULT);
    this.rateLimitPolicy = policy;
    return {
      policy,
      profile: getRateLimitProfileConfig(policy)
    };
  }

  computeRateLimitPressure(now = nowMs(), profile = null) {
    if (!this.rateLimitTelemetry) return 0;
    const activeProfile = profile || this.getRateLimitPolicyConfig().profile;
    const state = this.rateLimitTelemetry;
    const cooldownThreshold = Math.max(1, Number(activeProfile?.cooldownThreshold || RATE_LIMIT_COOLDOWN_THRESHOLD));
    const guardedThreshold = Math.max(1, Number(activeProfile?.guardedThreshold || RATE_LIMIT_GUARDED_THRESHOLD));
    const window429Pressure = Number(state.window429 || 0) / cooldownThreshold;
    const blockedPressure = Number(state.windowBlocked || 0) / Math.max(1, guardedThreshold);
    const streakPressure = Number(state.consecutive429 || 0) / 2;
    const queueDepth = Number(this.requestQueue?.length || 0);
    const concurrency = Math.max(1, Number(this.requestConcurrency || this.baseRequestConcurrency || REQUEST_CONCURRENCY) || 1);
    const queuePressure = queueDepth / Math.max(2, concurrency * 3);
    const routePressure = this.rateLimitRouteStats && this.rateLimitRouteStats.size > 0
      ? Array.from(this.rateLimitRouteStats.values()).reduce((max, row) => {
          const rowPressure = Number(row?.window429 || 0) / cooldownThreshold;
          return rowPressure > max ? rowPressure : max;
        }, 0)
      : 0;
    const activeBlockBoost = Number(this.rateLimitedUntilMs || 0) > now ? 1.3 : 0;
    const score = Math.max(
      activeBlockBoost,
      window429Pressure + (blockedPressure * 0.65) + (streakPressure * 0.45) + (queuePressure * 0.4) + (routePressure * 0.5)
    );
    return Math.max(0, Math.min(2.5, Number(score || 0)));
  }

  getRateLimitGovernorMode(now = nowMs(), profile = null) {
    if (!this.rateLimitTelemetry) return 'normal';
    this.rotateRateLimitTelemetryWindow(now);
    const state = this.rateLimitTelemetry;
    const activeProfile = profile || this.getRateLimitPolicyConfig().profile;
    const cooldownThreshold = Math.max(1, Number(activeProfile?.cooldownThreshold || RATE_LIMIT_COOLDOWN_THRESHOLD));
    const guardedThreshold = Math.max(1, Number(activeProfile?.guardedThreshold || RATE_LIMIT_GUARDED_THRESHOLD));
    const cooldownPressure = Math.max(0, Number(activeProfile?.cooldownPressure || 1));
    const guardedPressure = Math.max(0, Number(activeProfile?.guardedPressure || 0));
    const pressure = this.computeRateLimitPressure(now, activeProfile);
    const activeGlobalBlock = Number(this.rateLimitedUntilMs || 0) > now;
    if (
      activeGlobalBlock ||
      Number(state.window429 || 0) >= cooldownThreshold ||
      Number(state.consecutive429 || 0) >= 2 ||
      pressure >= cooldownPressure
    ) {
      return 'cooldown';
    }
    if (
      Number(state.window429 || 0) >= guardedThreshold ||
      Number(state.windowBlocked || 0) > 0 ||
      pressure >= guardedPressure
    ) {
      return 'guarded';
    }
    if (state.mode !== 'normal') {
      const last429At = Number(state.last429AtMs || 0);
      const ageMs = last429At > 0 ? now - last429At : Number.MAX_SAFE_INTEGER;
      const recoveryStreak = Math.max(1, Number(activeProfile?.recoveryStreak || RATE_LIMIT_RECOVERY_STREAK));
      const windowMs = Math.max(5_000, Number(state.windowMs || RATE_LIMIT_WINDOW_MS) || RATE_LIMIT_WINDOW_MS);
      if (ageMs < windowMs && Number(state.consecutiveSuccess || 0) < recoveryStreak) {
        return 'guarded';
      }
    }
    return 'normal';
  }

  applyRateLimitGovernor(now = nowMs()) {
    if (!this.rateLimitTelemetry) this.resetRateLimitTelemetryState();
    const state = this.rateLimitTelemetry;
    const { policy, profile } = this.getRateLimitPolicyConfig();
    const desiredMode = this.getRateLimitGovernorMode(now, profile);
    const pressure = this.computeRateLimitPressure(now, profile);
    const baseInterval = Math.max(100, Number(this.baseMinRequestIntervalMs || 900) || 900);
    const baseConcurrency = Math.max(1, Number(this.baseRequestConcurrency || REQUEST_CONCURRENCY) || 1);
    const maxIntervalMs = Math.max(baseInterval, Number(profile?.maxIntervalMs || RATE_LIMIT_MAX_INTERVAL_MS));
    let nextInterval = baseInterval;
    let nextConcurrency = baseConcurrency;

    if (desiredMode === 'guarded') {
      const multiplier = Math.max(1, Number(profile?.guardedIntervalMultiplier || 2));
      const floorMs = Math.max(baseInterval, Number(profile?.guardedIntervalFloorMs || 1_000));
      const concurrencyDrop = Math.max(0, Number(profile?.guardedConcurrencyDrop || 0));
      nextInterval = Math.min(maxIntervalMs, Math.max(floorMs, Math.round(baseInterval * multiplier)));
      nextConcurrency = Math.max(1, baseConcurrency - concurrencyDrop);
    } else if (desiredMode === 'cooldown') {
      const multiplier = Math.max(1.25, Number(profile?.cooldownIntervalMultiplier || 4));
      const floorMs = Math.max(baseInterval, Number(profile?.cooldownIntervalFloorMs || 2_000));
      const cooldownConcurrency = Math.max(1, Number(profile?.cooldownConcurrency || 1));
      nextInterval = Math.min(maxIntervalMs, Math.max(floorMs, Math.round(baseInterval * multiplier)));
      nextConcurrency = Math.min(baseConcurrency, cooldownConcurrency);
    }

    const modeChanged = state.mode !== desiredMode;
    state.mode = desiredMode;
    if (modeChanged) state.modeChangedAtMs = now;
    state.policy = policy;
    state.pressure = pressure;
    state.policyThresholds = {
      guardedThreshold: Math.max(1, Number(profile?.guardedThreshold || RATE_LIMIT_GUARDED_THRESHOLD)),
      cooldownThreshold: Math.max(1, Number(profile?.cooldownThreshold || RATE_LIMIT_COOLDOWN_THRESHOLD)),
      guardedPressure: Math.max(0, Number(profile?.guardedPressure || 0)),
      cooldownPressure: Math.max(0, Number(profile?.cooldownPressure || 1)),
      recoveryStreak: Math.max(1, Number(profile?.recoveryStreak || RATE_LIMIT_RECOVERY_STREAK)),
      maxIntervalMs
    };
    state.adaptiveMinIntervalMs = nextInterval;
    state.baseMinIntervalMs = baseInterval;
    state.adaptiveRequestConcurrency = nextConcurrency;
    state.baseRequestConcurrency = baseConcurrency;
    this.minRequestIntervalMs = nextInterval;
    this.requestConcurrency = nextConcurrency;
  }

  getRateLimitTelemetrySnapshot() {
    if (!this.rateLimitTelemetry) this.resetRateLimitTelemetryState();
    const now = nowMs();
    this.applyRateLimitGovernor(now);
    const state = this.rateLimitTelemetry;
    const routes = this.rateLimitRouteStats
      ? Array.from(this.rateLimitRouteStats.values())
          .map((route) => ({
            routeKey: route.routeKey,
            method: route.method || null,
            path: route.path || null,
            windowRequests: Number(route.windowRequests || 0),
            window429: Number(route.window429 || 0),
            windowBlocked: Number(route.windowBlocked || 0),
            totalRequests: Number(route.totalRequests || 0),
            total429: Number(route.total429 || 0),
            totalBlocked: Number(route.totalBlocked || 0),
            lastStatus: Number.isFinite(Number(route.lastStatus)) ? Number(route.lastStatus) : null,
            lastError: route.lastError ? String(route.lastError) : null,
            lastRequestAtMs: Number(route.lastRequestAtMs || 0) || null,
            last429AtMs: Number(route.last429AtMs || 0) || null,
            lastBlockedAtMs: Number(route.lastBlockedAtMs || 0) || null,
            blockedUntilMs: Number(route.blockedUntilMs || 0) || null,
            retryAfterMs: Number(route.retryAfterMs || 0) || null,
              avgLatencyMs: Number.isFinite(Number(route.avgLatencyMs)) ? Number(route.avgLatencyMs) : null
            }))
          .sort((a, b) => {
            if (b.window429 !== a.window429) return b.window429 - a.window429;
            if (b.windowBlocked !== a.windowBlocked) return b.windowBlocked - a.windowBlocked;
            if (b.total429 !== a.total429) return b.total429 - a.total429;
            return Number(b.lastRequestAtMs || 0) - Number(a.lastRequestAtMs || 0);
          })
      : [];
    const accounts = this.rateLimitAccountStats
      ? Array.from(this.rateLimitAccountStats.values())
          .map((row) => ({
            accountKey: String(row.accountKey || ''),
            env: row.env || null,
            server: row.server || null,
            accountId: Number.isFinite(Number(row.accountId)) ? Number(row.accountId) : null,
            accNum: Number.isFinite(Number(row.accNum)) ? Number(row.accNum) : null,
            label: row.label ? String(row.label) : null,
            windowRequests: Number(row.windowRequests || 0),
            window429: Number(row.window429 || 0),
            windowBlocked: Number(row.windowBlocked || 0),
            totalRequests: Number(row.totalRequests || 0),
            total429: Number(row.total429 || 0),
            totalBlocked: Number(row.totalBlocked || 0),
            lastStatus: Number.isFinite(Number(row.lastStatus)) ? Number(row.lastStatus) : null,
            lastError: row.lastError ? String(row.lastError) : null,
            lastRequestAtMs: Number(row.lastRequestAtMs || 0) || null,
            last429AtMs: Number(row.last429AtMs || 0) || null,
            lastBlockedAtMs: Number(row.lastBlockedAtMs || 0) || null,
            blockedUntilMs: Number(row.blockedUntilMs || 0) || null,
            retryAfterMs: Number(row.retryAfterMs || 0) || null
          }))
          .sort((a, b) => {
            if (b.window429 !== a.window429) return b.window429 - a.window429;
            if (b.windowBlocked !== a.windowBlocked) return b.windowBlocked - a.windowBlocked;
            if (b.total429 !== a.total429) return b.total429 - a.total429;
            return Number(b.lastRequestAtMs || 0) - Number(a.lastRequestAtMs || 0);
          })
      : [];

    return {
      mode: state.mode || 'normal',
      modeChangedAtMs: Number(state.modeChangedAtMs || now),
      policy: normalizeRateLimitProfileName(state.policy, this.rateLimitPolicy),
      pressure: Number.isFinite(Number(state.pressure)) ? Number(state.pressure) : 0,
      policyThresholds: state.policyThresholds && typeof state.policyThresholds === 'object'
        ? {
            guardedThreshold: Math.max(1, Number(state.policyThresholds.guardedThreshold || RATE_LIMIT_GUARDED_THRESHOLD)),
            cooldownThreshold: Math.max(1, Number(state.policyThresholds.cooldownThreshold || RATE_LIMIT_COOLDOWN_THRESHOLD)),
            guardedPressure: Math.max(0, Number(state.policyThresholds.guardedPressure || 0)),
            cooldownPressure: Math.max(0, Number(state.policyThresholds.cooldownPressure || 1)),
            recoveryStreak: Math.max(1, Number(state.policyThresholds.recoveryStreak || RATE_LIMIT_RECOVERY_STREAK)),
            maxIntervalMs: Math.max(100, Number(state.policyThresholds.maxIntervalMs || RATE_LIMIT_MAX_INTERVAL_MS))
          }
        : null,
      windowMs: Number(state.windowMs || RATE_LIMIT_WINDOW_MS),
      windowStartedAtMs: Number(state.windowStartedAtMs || now),
      windowRequests: Number(state.windowRequests || 0),
      window429: Number(state.window429 || 0),
      windowBlocked: Number(state.windowBlocked || 0),
      totalRequests: Number(state.totalRequests || 0),
      total429: Number(state.total429 || 0),
      totalBlocked: Number(state.totalBlocked || 0),
      totalErrors: Number(state.totalErrors || 0),
      totalSuccess: Number(state.totalSuccess || 0),
      consecutive429: Number(state.consecutive429 || 0),
      consecutiveSuccess: Number(state.consecutiveSuccess || 0),
      adaptiveMinIntervalMs: Number(state.adaptiveMinIntervalMs || this.minRequestIntervalMs || 0),
      baseMinIntervalMs: Number(state.baseMinIntervalMs || this.baseMinRequestIntervalMs || 0),
      adaptiveRequestConcurrency: Number(state.adaptiveRequestConcurrency || this.requestConcurrency || 0),
      baseRequestConcurrency: Number(state.baseRequestConcurrency || this.baseRequestConcurrency || 0),
      last429AtMs: Number(state.last429AtMs || 0) || null,
      lastSuccessAtMs: Number(state.lastSuccessAtMs || 0) || null,
      lastBlockedAtMs: Number(state.lastBlockedAtMs || 0) || null,
      lastRouteKey: state.lastRouteKey || null,
      lastAccountKey: state.lastAccountKey || null,
      topRoutes: routes.slice(0, Math.max(1, RATE_LIMIT_TOP_ROUTES)),
      topAccounts: accounts.slice(0, Math.max(1, Math.min(8, RATE_LIMIT_ACCOUNT_CAP)))
    };
  }

  applyRateLimitConfig(config) {
    const maps = buildRateLimitMaps(config);
    this.rateLimitConfig = maps;
    if (this.rateLimitBuckets) this.rateLimitBuckets.clear();
    else this.rateLimitBuckets = new Map();
  }

  getRequestPriority({ method = 'GET', pathname = '', priority } = {}) {
    if (Number.isFinite(Number(priority))) return Number(priority);
    const verb = String(method || 'GET').toUpperCase();
    const path = String(pathname || '').split('?')[0].toLowerCase();
    if (verb !== 'GET') {
      if (path.includes('/trade/orders') || path.includes('/trade/positions')) return REQUEST_PRIORITY.CRITICAL;
      return REQUEST_PRIORITY.HIGH;
    }
    if (path.includes('/trade/orders') || path.includes('/trade/positions')) return REQUEST_PRIORITY.HIGH;
    if (path.includes('/trade/accounts') && path.includes('/state')) return REQUEST_PRIORITY.HIGH;
    if (path.includes('/trade/quotes')) return REQUEST_PRIORITY.HIGH;
    if (path.includes('/trade/history') || path.includes('/trade/dailybar')) return REQUEST_PRIORITY.LOW;
    if (path.includes('/trade/config') || path.includes('/trade/instruments')) return REQUEST_PRIORITY.LOW;
    return REQUEST_PRIORITY.NORMAL;
  }

  getRateLimitRulesForRequest({ method = 'GET', pathname = '' } = {}) {
    const config = this.rateLimitConfig;
    if (!config) return [];
    const rules = [];
    if (config.global) rules.push({ key: 'global', rule: config.global });
    const routeKey = buildRouteKey(method, pathname);
    if (routeKey && config.byRouteKey?.has(routeKey)) {
      rules.push({ key: `route:${routeKey}`, rule: config.byRouteKey.get(routeKey) });
    }
    const pathKey = normalizePathForKey(pathname);
    if (pathKey && config.byPathKey?.has(pathKey)) {
      rules.push({ key: `path:${pathKey}`, rule: config.byPathKey.get(pathKey) });
    }
    const routeId = extractRouteIdFromPath(pathname);
    if (routeId != null) {
      const idKey = String(routeId);
      if (config.byRouteId?.has(idKey)) {
        rules.push({ key: `routeId:${idKey}`, rule: config.byRouteId.get(idKey) });
      }
    }
    if (config.global && this.state?.accountId != null) {
      rules.push({ key: `account:${this.state.accountId}`, rule: config.global });
    }
    return rules;
  }

  ensureRateLimitBucket(key, rule) {
    if (!key || !rule) return null;
    if (!this.rateLimitBuckets) this.rateLimitBuckets = new Map();
    const existing = this.rateLimitBuckets.get(key);
    if (existing) {
      existing.update(rule.limit, rule.intervalMs);
      return existing;
    }
    const bucket = new TokenBucket(rule.limit, rule.intervalMs);
    this.rateLimitBuckets.set(key, bucket);
    return bucket;
  }

  getRateLimitBlockUntilMs({ method = 'GET', pathname = '' } = {}) {
    const now = nowMs();
    let until = Number(this.rateLimitedUntilMs || 0);
    if (until && until <= now) {
      this.rateLimitedUntilMs = 0;
      until = 0;
    }

    if (!this.routeRateLimitedUntilMs) this.routeRateLimitedUntilMs = new Map();
    const keys = [];
    const routeKey = buildRouteKey(method, pathname);
    if (routeKey) keys.push(`route:${routeKey}`);
    const pathKey = normalizePathForKey(pathname);
    if (pathKey) keys.push(`path:${pathKey}`);
    const routeId = extractRouteIdFromPath(pathname);
    if (routeId != null) keys.push(`routeId:${routeId}`);

    for (const key of keys) {
      const stored = Number(this.routeRateLimitedUntilMs.get(key) || 0);
      if (!stored) continue;
      if (stored <= now) {
        this.routeRateLimitedUntilMs.delete(key);
        continue;
      }
      until = Math.max(until, stored);
    }

    return until;
  }

  computeRequestDelayMs(task) {
    const now = nowMs();
    let delay = 0;

    const minInterval = Number(this.minRequestIntervalMs) || 0;
    if (minInterval > 0) {
      const nextAt = (Number(this.lastRequestAtMs) || 0) + minInterval;
      if (nextAt > now) delay = Math.max(delay, nextAt - now);
    }

    const blockUntil = this.getRateLimitBlockUntilMs({ method: task.method, pathname: task.pathname });
    if (blockUntil && blockUntil > now) delay = Math.max(delay, blockUntil - now);

    const rules = this.getRateLimitRulesForRequest({ method: task.method, pathname: task.pathname });
    for (const entry of rules) {
      const bucket = this.ensureRateLimitBucket(entry.key, entry.rule);
      if (!bucket) continue;
      delay = Math.max(delay, bucket.peekDelay(now));
    }

    return delay;
  }

  drainRequestQueue() {
    if (!this.requestQueue || this.requestQueue.length === 0) return;
    if (this.requestWakeTimer) return;
    if (this.requestInFlightCount >= this.requestConcurrency) return;

    this.requestQueue.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.enqueuedAt - b.enqueuedAt;
    });

    let selectedIndex = -1;
    let minDelayMs = null;
    for (let i = 0; i < this.requestQueue.length; i += 1) {
      const candidate = this.requestQueue[i];
      const delayMs = this.computeRequestDelayMs(candidate);
      if (delayMs <= 0) {
        selectedIndex = i;
        break;
      }
      if (minDelayMs == null || delayMs < minDelayMs) {
        minDelayMs = delayMs;
      }
    }

    if (selectedIndex < 0) {
      if (minDelayMs != null && minDelayMs > 0) {
        this.requestWakeTimer = setTimeout(() => {
          this.requestWakeTimer = null;
          this.drainRequestQueue();
        }, minDelayMs);
      }
      return;
    }

    const [next] = this.requestQueue.splice(selectedIndex, 1);
    if (!next) return;
    const waitMs = Math.max(0, nowMs() - next.enqueuedAt);
    if (this.requestQueueMetrics) this.requestQueueMetrics.noteWait(waitMs);
    this.requestInFlightCount += 1;
    const now = nowMs();
    this.lastRequestAtMs = now;

    const rules = this.getRateLimitRulesForRequest({ method: next.method, pathname: next.pathname });
    for (const entry of rules) {
      const bucket = this.ensureRateLimitBucket(entry.key, entry.rule);
      if (bucket) bucket.consume(now);
    }

    Promise.resolve()
      .then(() => next.fn())
      .then(next.resolve, next.reject)
      .finally(() => {
        this.requestInFlightCount = Math.max(0, this.requestInFlightCount - 1);
        this.drainRequestQueue();
      });

    if (this.requestInFlightCount < this.requestConcurrency) {
      this.drainRequestQueue();
    }
  }

  withRequestThrottle(fn, opts = {}) {
    const method = opts?.method ?? 'GET';
    const pathname = opts?.pathname ?? '';
    const priority = this.getRequestPriority({ method, pathname, priority: opts?.priority });
    const now = nowMs();
    this.applyRateLimitGovernor(now);
    const blockUntil = this.getRateLimitBlockUntilMs({ method, pathname });
    if (blockUntil && blockUntil > now && priority <= REQUEST_PRIORITY.HIGH) {
      const retryAfterMs = blockUntil - now;
      this.noteRateLimitTelemetry({
        method,
        pathname,
        event: 'blocked',
        status: 429,
        retryAfterMs,
        blockedUntilMs: blockUntil,
        error: 'throttle_blocked'
      });
      return Promise.reject(
        new HttpError(`TradeLocker rate limited. Retry in ${Math.ceil(retryAfterMs / 1000)}s.`, {
          status: 429,
          retryAfterMs,
          code: 'RATE_LIMITED'
        })
      );
    }

    return new Promise((resolve, reject) => {
      const task = {
        fn,
        resolve,
        reject,
        method,
        pathname,
        priority,
        enqueuedAt: nowMs()
      };
      if (!this.requestQueue) this.requestQueue = [];
      this.requestQueue.push(task);
      if (this.requestQueueMetrics) this.requestQueueMetrics.noteDepth(this.requestQueue.length);
      if (this.requestWakeTimer) {
        clearTimeout(this.requestWakeTimer);
        this.requestWakeTimer = null;
      }
      this.drainRequestQueue();
    });
  }

  noteRateLimitHit({ method = 'GET', pathname = '', retryAfterMs } = {}) {
    const now = nowMs();
    const cooldownMs = Number.isFinite(Number(retryAfterMs)) && Number(retryAfterMs) > 0 ? Number(retryAfterMs) : 15_000;
    const until = now + cooldownMs;
    this.rateLimitedUntilMs = Math.max(this.rateLimitedUntilMs || 0, until);

    if (!this.routeRateLimitedUntilMs) this.routeRateLimitedUntilMs = new Map();
    const keys = [];
    const routeKey = buildRouteKey(method, pathname);
    if (routeKey) keys.push(`route:${routeKey}`);
    const pathKey = normalizePathForKey(pathname);
    if (pathKey) keys.push(`path:${pathKey}`);
    const routeId = extractRouteIdFromPath(pathname);
    if (routeId != null) keys.push(`routeId:${routeId}`);

    for (const key of keys) {
      const prev = Number(this.routeRateLimitedUntilMs.get(key) || 0);
      this.routeRateLimitedUntilMs.set(key, Math.max(prev, until));
      const bucket = this.rateLimitBuckets?.get?.(key);
      if (bucket) bucket.blockUntil(until);
    }

    const globalBucket = this.rateLimitBuckets?.get?.('global');
    if (globalBucket) globalBucket.blockUntil(until);

    this.noteRateLimitTelemetry({
      method,
      pathname,
      event: 'rate_limited',
      status: 429,
      retryAfterMs: cooldownMs,
      blockedUntilMs: until,
      error: 'http_429'
    });
  }


  getUpstreamBackoff() {
    const until = Number(this.upstreamBackoffUntilMs || 0);
    if (!Number.isFinite(until) || until <= 0) return null;
    const now = nowMs();
    if (now >= until) return null;
    return { until, retryAfterMs: until - now };
  }

  noteUpstreamFailure(status, message) {
    const now = nowMs();
    if (!this.upstreamFailureWindowStartMs || now - this.upstreamFailureWindowStartMs > UPSTREAM_FAILURE_WINDOW_MS) {
      this.upstreamFailureWindowStartMs = now;
      this.upstreamFailureCount = 0;
    }

    this.upstreamFailureCount += 1;
    this.upstreamLastStatus = status != null ? Number(status) : null;
    this.upstreamLastError = message ? String(message) : null;

    if (this.upstreamFailureCount >= UPSTREAM_FAILURE_THRESHOLD) {
      const backoffMs = Math.min(
        UPSTREAM_BACKOFF_MAX_MS,
        UPSTREAM_BACKOFF_BASE_MS * Math.max(1, this.upstreamFailureCount - UPSTREAM_FAILURE_THRESHOLD + 1)
      );
      this.upstreamBackoffUntilMs = Math.max(this.upstreamBackoffUntilMs || 0, now + backoffMs);
    }
  }

  noteUpstreamSuccess() {
    this.upstreamFailureCount = 0;
    this.upstreamFailureWindowStartMs = 0;
    if (this.upstreamBackoffUntilMs && nowMs() >= this.upstreamBackoffUntilMs) {
      this.upstreamBackoffUntilMs = 0;
    }
  }

  async withTransientRetry(fn, { attempts = 3, baseDelayMs = 250, maxDelayMs = 2000 } = {}) {
    let lastErr = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        const status = typeof e?.status === 'number' ? e.status : null;
        const code = e?.code;
        const retryable =
          isUpstreamStatus(status) ||
          code === 'UPSTREAM_UNAVAILABLE' ||
          status === 0 ||
          isTransientNetworkError(e);
        if (!retryable || attempt >= attempts - 1) throw e;
        const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
        await sleepMs(delay + Math.floor(Math.random() * 120));
      }
    }
    throw lastErr;
  }

  getBaseUrl() {
    const custom = normalizeBaseUrl(this.state.apiBaseUrl);
    return custom || baseUrlForEnv(this.state.env);
  }

  getAuthBaseUrl() {
    const custom = normalizeBaseUrl(this.state.authBaseUrl);
    return custom || authUrlForEnv();
  }

  getRateLimitPolicy() {
    const { policy, profile } = this.getRateLimitPolicyConfig();
    return {
      ok: true,
      policy,
      profile: {
        guardedThreshold: Math.max(1, Number(profile?.guardedThreshold || RATE_LIMIT_GUARDED_THRESHOLD)),
        cooldownThreshold: Math.max(1, Number(profile?.cooldownThreshold || RATE_LIMIT_COOLDOWN_THRESHOLD)),
        guardedPressure: Math.max(0, Number(profile?.guardedPressure || 0)),
        cooldownPressure: Math.max(0, Number(profile?.cooldownPressure || 1)),
        recoveryStreak: Math.max(1, Number(profile?.recoveryStreak || RATE_LIMIT_RECOVERY_STREAK)),
        maxIntervalMs: Math.max(100, Number(profile?.maxIntervalMs || RATE_LIMIT_MAX_INTERVAL_MS)),
        guardedIntervalMultiplier: Math.max(1, Number(profile?.guardedIntervalMultiplier || 2)),
        cooldownIntervalMultiplier: Math.max(1.25, Number(profile?.cooldownIntervalMultiplier || 4)),
        guardedConcurrencyDrop: Math.max(0, Number(profile?.guardedConcurrencyDrop || 0)),
        cooldownConcurrency: Math.max(1, Number(profile?.cooldownConcurrency || 1))
      },
      availablePolicies: RATE_LIMIT_PROFILE_NAMES.slice()
    };
  }

  setRateLimitPolicy(input = {}) {
    const nextPolicy = normalizeRateLimitProfileName(input?.policy, this.rateLimitPolicy);
    this.rateLimitPolicy = nextPolicy;
    this.applyRateLimitGovernor(nowMs());
    const current = this.getRateLimitPolicy();
    return {
      ok: true,
      ...current
    };
  }

  getStatus() {
    this.applyRateLimitGovernor(nowMs());
    const queueMetrics = this.requestQueueMetrics ? this.requestQueueMetrics.snapshot() : { maxDepth: 0, maxWaitMs: 0 };
    const snapshot = this.getConnectionStateSnapshot();
    return {
      ok: true,
      connected: snapshot.connectionState === 'connected',
      tokenConnected: snapshot.tokenConnected,
      accountContextReady: snapshot.accountContextReady,
      accountRouteHealthy: snapshot.accountRouteHealthy,
      connectionState: snapshot.connectionState,
      degradedReason: snapshot.degradedReason || undefined,
      lastAccountAuthError: this.lastAccountAuthError || null,
      lastAccountAuthAtMs: this.lastAccountAuthAtMs || null,
      env: this.state.env,
      server: this.state.server || null,
      email: this.state.email || null,
      accountId: this.state.accountId,
      accNum: this.state.accNum,
      tradingEnabled: !!this.state.tradingEnabled,
      autoPilotEnabled: !!this.state.autoPilotEnabled,
      hasSavedPassword: !!this.state.secrets?.password,
      hasSavedDeveloperApiKey: !!this.state.secrets?.developerApiKey,
      lastError: this.lastError,
      rateLimitedUntilMs: this.rateLimitedUntilMs || 0,
      upstreamBackoffUntilMs: this.upstreamBackoffUntilMs || 0,
      upstreamLastError: this.upstreamLastError,
      upstreamLastStatus: this.upstreamLastStatus,
      requestQueueDepth: this.requestQueue ? this.requestQueue.length : 0,
      requestQueueMaxDepth: queueMetrics.maxDepth,
      requestQueueMaxWaitMs: queueMetrics.maxWaitMs,
      requestInFlight: this.requestInFlightCount || 0,
      requestConcurrency: this.requestConcurrency,
      minRequestIntervalMs: this.minRequestIntervalMs || 0,
      rateLimitPolicy: this.rateLimitPolicy,
      rateLimitPolicies: RATE_LIMIT_PROFILE_NAMES.slice(),
      rateLimitTelemetry: this.getRateLimitTelemetrySnapshot()
    };
  }

  onStreamEvent(handler) {
    if (typeof handler !== 'function') return () => {};
    this.streamListeners.add(handler);
    return () => this.streamListeners.delete(handler);
  }

  emitStreamEvent(payload) {
    for (const fn of this.streamListeners) {
      try { fn(payload); } catch { /* ignore */ }
    }
  }

  _setStreamStatus(status, { reason = null, detail = null, atMs = null } = {}) {
    if (!this.stream) this.stream = {};
    const nextStatus = normalizeStreamStatus(status) || this.stream.status || STREAM_STATUS.DISCONNECTED;
    const when = Number.isFinite(Number(atMs)) ? Number(atMs) : nowMs();
    const prevStatus = this.stream.status;
    const prevReason = this.stream.reason;
    const prevDetail = this.stream.detail;

    this.stream.status = nextStatus;
    if (reason !== undefined) this.stream.reason = reason;
    if (detail !== undefined) this.stream.detail = detail;
    if (nextStatus === STREAM_STATUS.ERROR && detail) this.stream.lastError = detail;

    if (prevStatus !== nextStatus || prevReason !== this.stream.reason || prevDetail !== this.stream.detail) {
      this.emitStreamEvent({
        type: 'stream_status',
        status: nextStatus,
        reason: this.stream.reason || null,
        detail: this.stream.detail || null,
        atMs: when,
        url: this.stream?.url || null,
        lastMessageAtMs: this.stream?.lastMessageAtMs || null,
        streamSyncRevision: this.streamSyncRevision || 0
      });
    }
  }

  _emitStreamError({ reason = null, message = null, phase = null } = {}) {
    const info = reason ? { reason, message: message || 'Stream error' } : classifyStreamError(message, { phase });
    const msg = info?.message ? String(info.message) : 'Stream error';
    const rsn = info?.reason ? String(info.reason) : 'unknown';
    const atMs = nowMs();
    if (!this.stream) this.stream = {};
    this.stream.lastError = msg;
    this.stream.reason = rsn;
    this.stream.detail = msg;
    this.emitStreamEvent({
      type: 'stream_error',
      reason: rsn,
      message: msg,
      atMs,
      endpoint: this.stream?.url || null,
      phase: this.stream?.status || null,
      streamSyncRevision: this.streamSyncRevision || 0
    });
    if (STREAM_DEBUG.enabled) {
      appendStreamDebugLine({ type: 'stream_error', reason: rsn, message: msg, phase: this.stream?.status || null, atMs });
    }
    this._setStreamStatus(STREAM_STATUS.ERROR, { reason: rsn, detail: msg, atMs });
  }

  _resetStreamDebugCounters() {
    this.streamDebugCounters = {
      quote: 0,
      positions: 0,
      position: 0,
      orders: 0,
      order: 0,
      account: 0,
      raw: 0
    };
  }

  _clearStreamTokenRefreshTimer() {
    if (this.streamTokenRefreshTimer) {
      try { clearTimeout(this.streamTokenRefreshTimer); } catch {}
      this.streamTokenRefreshTimer = null;
    }
  }

  _clearStreamHealthWatchdog() {
    if (this.streamHealthTimer) {
      try { clearInterval(this.streamHealthTimer); } catch {}
      this.streamHealthTimer = null;
    }
  }

  _scheduleStreamTokenRefresh(cfg) {
    this._clearStreamTokenRefreshTimer();
    if (this.streamStopRequested) return;
    const cache = this.streamTokensCache;
    const minExpireAtMs = Number(cache?.minExpireAtMs || 0);
    if (!minExpireAtMs || !Number.isFinite(minExpireAtMs)) return;
    const delay = Math.max(0, minExpireAtMs - nowMs() - STREAM_TOKEN_REFRESH_LEEWAY_MS);
    this.streamTokenRefreshTimer = setTimeout(async () => {
      this.streamTokenRefreshTimer = null;
      if (this.streamStopRequested) return;
      try {
        await this.ensureStreamTokens({ force: true });
        if (this.streamSocket && this.streamSocket.connected) {
          const status = normalizeStreamStatus(this.stream?.status || '');
          if ([STREAM_STATUS.CONNECTED, STREAM_STATUS.SUBSCRIBING, STREAM_STATUS.SYNCING, STREAM_STATUS.LIVE].includes(status)) {
            await this._subscribeStream(this.streamSocket, cfg, { force: true, reason: 'token_refresh' });
          }
        }
      } catch (e) {
        const info = classifyStreamError(e, { phase: 'token_refresh' });
        this._emitStreamError({ reason: info.reason, message: info.message, phase: 'token_refresh' });
      }
    }, delay);
  }

  _startStreamHealthWatchdog(cfg) {
    if (this.streamHealthTimer) return;
    if (!STREAM_HEALTH_POLL_MS || STREAM_HEALTH_POLL_MS <= 0) return;
    this.streamHealthTimer = setInterval(() => {
      if (this.streamStopRequested) return;
      const status = normalizeStreamStatus(this.stream?.status || '');
      if (![STREAM_STATUS.SYNCING, STREAM_STATUS.LIVE].includes(status)) return;
      const lastAt = Number(this.stream?.lastMessageAtMs || 0);
      if (!lastAt || !Number.isFinite(lastAt)) return;
      const age = nowMs() - lastAt;
      if (age <= STREAM_STALE_MS) return;
      this._emitStreamError({ reason: 'stale_no_messages', message: `Stream stale for ${Math.round(age / 1000)}s`, phase: status });
      try { this.streamSocket?.disconnect?.(); } catch {}
      this._scheduleStreamReconnect(cfg);
    }, STREAM_HEALTH_POLL_MS);
  }

  getStreamConfig() {
    const envEnabled = String(process.env.GLASS_TRADELOCKER_STREAM_ENABLED || '').trim().toLowerCase();
    const enabledFromEnv = envEnabled === '1' || envEnabled === 'true' || envEnabled === 'yes';
    const enabled = enabledFromEnv || !!this.state.streamingEnabled;
    const url = String(this.state.streamingUrl || process.env.GLASS_TRADELOCKER_STREAM_URL || '').trim();
    const autoReconnect =
      this.state.streamingAutoReconnect !== false &&
      String(process.env.GLASS_TRADELOCKER_STREAM_AUTORECONNECT || '').trim().toLowerCase() !== 'false';
    const subscribeRaw = String(this.state.streamingSubscribe || process.env.GLASS_TRADELOCKER_STREAM_SUBSCRIBE || '').trim();
    const subscribe = parseStreamSubscribe(subscribeRaw);
    return { enabled, url, autoReconnect, subscribe };
  }

  getStreamStatus() {
    const cfg = this.getStreamConfig();
    const enabled = !!cfg.enabled;
    const status = enabled ? (this.stream?.status || STREAM_STATUS.DISCONNECTED) : 'DISABLED';
    return {
      ok: true,
      enabled,
      status,
      url: this.stream?.url || null,
      lastError: enabled ? (this.stream?.lastError || null) : null,
      reason: enabled ? (this.stream?.reason || null) : 'streaming_disabled',
      detail: enabled ? (this.stream?.detail || null) : 'Streaming disabled in settings.',
      lastMessageAtMs: enabled ? (this.stream?.lastMessageAtMs || null) : null
    };
  }

  async ensureStreamTokens({ force = false } = {}) {
    const now = nowMs();
    const cached = this.streamTokensCache;
    if (!force && cached && Array.isArray(cached.tokens) && cached.tokens.length > 0) {
      const minExpireAtMs = Number(cached.minExpireAtMs || 0);
      if (minExpireAtMs > 0 && minExpireAtMs - now > 60_000) return cached.tokens;
      if (!minExpireAtMs && now - (cached.fetchedAtMs || 0) < 5 * 60_000) return cached.tokens;
    }

    if (this.streamTokensInFlight) return this.streamTokensInFlight;

    this.streamTokensInFlight = (async () => {
      await this.ensureAccessTokenValid();
      if (!this.tokens?.accessToken) throw new Error('Not connected to TradeLocker.');

      const url = `${this.getBaseUrl()}/auth/jwt/accounts/tokens`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${this.tokens.accessToken}`
        },
        body: '{}'
      });
      const { text, json, contentType } = await readResponseBody(res);
      const isHtml = looksLikeHtmlResponse(text, contentType);
      if (!res.ok) {
        const err = formatHttpError({ status: res.status, statusText: res.statusText, bodyText: text, bodyJson: json });
        const msg = isHtml ? `TradeLocker stream token endpoint returned HTML (${this.getBaseUrl()}). ${err}` : err;
        throw new Error(msg);
      }

      const tokens = extractStreamTokens(json);
      if (!tokens.length) {
        const detail = extractErrorDetail(json);
        throw new Error(detail ? detail : 'TradeLocker stream token response was empty.');
      }

      const expireTimes = tokens.map((t) => t?.expireAtMs).filter((t) => Number.isFinite(Number(t)));
      const minExpireAtMs = expireTimes.length ? Math.min(...expireTimes.map((t) => Number(t))) : 0;
      this.streamTokensCache = { tokens, fetchedAtMs: nowMs(), minExpireAtMs };
      this._scheduleStreamTokenRefresh(this.getStreamConfig());
      return tokens;
    })().finally(() => {
      this.streamTokensInFlight = null;
    });

    return this.streamTokensInFlight;
  }

  async getStreamTokenForAccount(accountId) {
    const tokens = await this.ensureStreamTokens();
    if (!Array.isArray(tokens) || tokens.length === 0) return null;
    const targetId = Number(accountId ?? this.state.accountId);
    if (Number.isFinite(targetId)) {
      const match = tokens.find((t) => Number(t?.accountId) === targetId);
      if (match) return match;
    }
    return tokens[0] || null;
  }

  _resetStreamSyncState(revision) {
    if (this.streamSyncTimer) {
      try { clearTimeout(this.streamSyncTimer); } catch {}
      this.streamSyncTimer = null;
    }
    this.streamSyncState = {
      active: true,
      revision: Number.isFinite(Number(revision)) ? Number(revision) : this.streamSyncRevision || 0,
      startedAtMs: nowMs(),
      positionsById: new Map(),
      positionsLoose: [],
      ordersById: new Map(),
      ordersLoose: [],
      account: null,
      sawPositions: false,
      sawOrders: false,
      sawAccount: false
    };
    this.streamSyncTimer = setTimeout(() => {
      this.streamSyncTimer = null;
      this._flushStreamSyncState(nowMs(), { force: false, reason: 'sync_timeout' });
      this._emitStreamError({ reason: 'sync_end_missing', message: 'Stream SyncEnd not received before timeout.', phase: 'sync' });
      try { this.streamSocket?.disconnect?.(); } catch {}
    }, STREAM_SYNC_TIMEOUT_MS);
  }

  _flushStreamSyncState(atMs, { force = false, reason = null } = {}) {
    const sync = this.streamSyncState;
    if (!sync || !sync.active) return;
    sync.active = false;
    if (this.streamSyncTimer) {
      try { clearTimeout(this.streamSyncTimer); } catch {}
      this.streamSyncTimer = null;
    }

    const shouldEmitPositions = force || sync.sawPositions;
    const shouldEmitOrders = force || sync.sawOrders;
    const revision = sync.revision || this.streamSyncRevision || 0;

    if (shouldEmitPositions) {
      const positions = [...sync.positionsById.values(), ...sync.positionsLoose];
      this.emitStreamEvent({ type: 'positions', positions, atMs, reason, streamSyncRevision: revision });
    }
    if (shouldEmitOrders) {
      const orders = [...sync.ordersById.values(), ...sync.ordersLoose];
      this.emitStreamEvent({ type: 'orders', orders, atMs, reason, streamSyncRevision: revision });
    }
    if (sync.account) {
      this.emitStreamEvent({ type: 'account', account: sync.account, atMs, reason, streamSyncRevision: revision });
    }

    if (STREAM_DEBUG.enabled) {
      appendStreamDebugLine({
        type: 'sync_flush',
        reason,
        atMs,
        streamSyncRevision: revision,
        counts: { ...this.streamDebugCounters }
      });
    }
  }

  _cacheStreamSyncEvent(event, raw) {
    const sync = this.streamSyncState;
    if (!sync || !sync.active || !event) return false;
    const type = String(event?.type || '').trim().toLowerCase();
    if (type === 'positions') {
      sync.sawPositions = true;
      sync.positionsById.clear();
      sync.positionsLoose = [];
      const list = Array.isArray(event.positions) ? event.positions : [];
      for (const item of list) {
        const id = getStreamItemId(item, ['positionId', 'id', 'positionID', 'posId', 'posID']);
        if (id) sync.positionsById.set(id, item);
        else sync.positionsLoose.push(item);
      }
      return true;
    }
    if (type === 'position') {
      sync.sawPositions = true;
      const item = event.position || raw || {};
      const id = getStreamItemId(item, ['positionId', 'id', 'positionID', 'posId', 'posID']);
      if (id) sync.positionsById.set(id, item);
      else sync.positionsLoose.push(item);
      return true;
    }
    if (type === 'orders') {
      sync.sawOrders = true;
      sync.ordersById.clear();
      sync.ordersLoose = [];
      const list = Array.isArray(event.orders) ? event.orders : [];
      for (const item of list) {
        const id = getStreamItemId(item, ['orderId', 'id', 'orderID', 'clientOrderId', 'clientOrderID']);
        if (id) sync.ordersById.set(id, item);
        else sync.ordersLoose.push(item);
      }
      return true;
    }
    if (type === 'order') {
      sync.sawOrders = true;
      const item = event.order || raw || {};
      const id = getStreamItemId(item, ['orderId', 'id', 'orderID', 'clientOrderId', 'clientOrderID']);
      if (id) sync.ordersById.set(id, item);
      else sync.ordersLoose.push(item);
      return true;
    }
    if (type === 'account') {
      sync.sawAccount = true;
      sync.account = event.account || raw || null;
      return true;
    }
    return false;
  }

  async _subscribeStream(socket, cfg, opts = {}) {
    if (!socket) return;
    const attempt = Number(opts.attempt || 0);
    const force = opts.force === true;
    const now = nowMs();
    if (this.streamSubscribeInFlight) {
      const age = this.streamSubscribeStartedAtMs ? now - this.streamSubscribeStartedAtMs : 0;
      const isStale = age > STREAM_SUBSCRIBE_TIMEOUT_MS * 2;
      if (!force && !isStale) return;
      if (isStale) {
        this.streamSubscribeInFlight = false;
        this.streamSubscribeStartedAtMs = 0;
      }
    }

    this.streamSubscribeInFlight = true;
    this.streamSubscribeStartedAtMs = now;
    const nonce = Number(this.streamSubscribeNonce || 0) + 1;
    this.streamSubscribeNonce = nonce;
    this.streamActiveSubscribeNonce = nonce;

    this._setStreamStatus(STREAM_STATUS.SUBSCRIBING, {
      reason: opts.reason || null,
      detail: 'Subscribing to stream.',
      atMs: now
    });

    try {
      const tokenInfo = await this.getStreamTokenForAccount(this.state.accountId);
      if (!tokenInfo?.token) throw new Error('Stream token unavailable.');

      const basePayload = { action: 'SUBSCRIBE', token: tokenInfo.token };
      const override = cfg?.subscribe && typeof cfg.subscribe === 'object' ? cfg.subscribe : null;
      const payload = override ? { ...basePayload, ...override } : basePayload;
      if (!payload.token) payload.token = tokenInfo.token;
      if (!payload.action) payload.action = 'SUBSCRIBE';

      if (STREAM_DEBUG.enabled) {
        appendStreamDebugLine({ type: 'subscribe_emit', payload, atMs: now, streamSyncRevision: this.streamSyncRevision || 0 });
      }

      const ack = await new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error('Stream subscription timed out.'));
        }, STREAM_SUBSCRIBE_TIMEOUT_MS);

        socket.emit('subscriptions', payload, (ackPayload) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (ackPayload?.ok === false) {
            reject(new Error(String(ackPayload?.error || ackPayload?.message || 'Stream subscription rejected.')));
            return;
          }
          const status = String(ackPayload?.status || '').toLowerCase();
          if (status === 'error' || status === 'failed') {
            reject(new Error(String(ackPayload?.error || ackPayload?.message || 'Stream subscription rejected.')));
            return;
          }
          resolve(ackPayload);
        });
      });

      if (this.streamActiveSubscribeNonce !== nonce) return;

      this.streamSubscribeInFlight = false;
      this.streamSubscribeStartedAtMs = 0;
      this.streamSyncRevision = Number(this.streamSyncRevision || 0) + 1;
      const revision = this.streamSyncRevision;
      socket.__streamRevision = revision;
      this._resetStreamDebugCounters();
      this._resetStreamSyncState(revision);
      this._setStreamStatus(STREAM_STATUS.SYNCING, {
        reason: 'subscribe_ack',
        detail: 'Stream subscription acknowledged.',
        atMs: nowMs()
      });
      if (STREAM_DEBUG.enabled) {
        appendStreamDebugLine({ type: 'subscribe_ack', ack, atMs: nowMs(), streamSyncRevision: revision });
      }
      this._scheduleStreamTokenRefresh(cfg);
      this._startStreamHealthWatchdog(cfg);
      return ack;
    } catch (e) {
      if (this.streamActiveSubscribeNonce === nonce) {
        this.streamSubscribeInFlight = false;
        this.streamSubscribeStartedAtMs = 0;
      }
      const info = classifyStreamError(e, { phase: 'subscribe' });
      if (info.reason === 'invalid_stream_token' && attempt < 1) {
        try {
          await this.ensureStreamTokens({ force: true });
        } catch {}
        return this._subscribeStream(socket, cfg, { attempt: attempt + 1, force: true, reason: 'token_refresh' });
      }
      this._emitStreamError({ reason: info.reason, message: info.message, phase: 'subscribe' });
      try { socket.disconnect?.(); } catch {}
      this._scheduleStreamReconnect(cfg);
      return null;
    } finally {
      if (this.streamActiveSubscribeNonce === nonce) {
        this.streamSubscribeInFlight = false;
        this.streamSubscribeStartedAtMs = 0;
      }
    }
  }

  async startStream() {
    const cfg = this.getStreamConfig();
    if (!cfg.enabled) return { ok: false, error: 'Streaming is disabled.' };
    if (!getSocketIoClient()) return { ok: false, error: 'Socket.IO client unavailable.' };
    try {
      await this.ensureAccessTokenValid();
    } catch (e) {
      const msg = redactErrorMessage(e?.message || String(e));
      this.lastError = msg;
      return { ok: false, error: msg };
    }
    if (!this.tokens?.accessToken) return { ok: false, error: 'Not connected to TradeLocker.' };

    const accountRes = await this.ensureAccountContext();
    if (accountRes?.ok === false) {
      return { ok: false, error: accountRes.error || 'TradeLocker account not selected.' };
    }

    const developerHeaders = this.buildDeveloperHeaders();
    if (!Object.keys(developerHeaders).length) {
      this._setStreamStatus('DISABLED', {
        reason: 'missing_developer_key',
        detail: 'TradeLocker developer API key is required for streaming.'
      });
      return { ok: true, status: this.stream?.status || 'DISABLED', disabled: true, reason: 'missing_developer_key' };
    }

    const endpoint = normalizeStreamEndpoint(cfg.url, this.state.env);
    if (!endpoint?.connectUrl) return { ok: false, error: 'Stream URL is missing.' };

    this.streamStopRequested = false;
    const state = this.stream || {};
    if (this.streamSocket && (this.streamSocket.connected || this.streamSocket.active)) {
      return { ok: true, status: state.status || 'connecting' };
    }

    this._connectStream(endpoint, cfg);
    return { ok: true, status: this.stream?.status || STREAM_STATUS.CONNECTING };
  }

  stopStream() {
    this.streamStopRequested = true;
    if (this.streamReconnectTimer) {
      try { clearTimeout(this.streamReconnectTimer); } catch {}
      this.streamReconnectTimer = null;
    }
    if (this.streamSyncTimer) {
      try { clearTimeout(this.streamSyncTimer); } catch {}
      this.streamSyncTimer = null;
    }
    this._clearStreamTokenRefreshTimer();
    this._clearStreamHealthWatchdog();
    this.streamSubscribeInFlight = false;
    this.streamSubscribeStartedAtMs = 0;
    if (this.streamSocket) {
      try { this.streamSocket.removeAllListeners?.(); } catch {}
      try { this.streamSocket.disconnect?.(); } catch {}
    }
    this.streamSocket = null;
    this.streamEndpoint = null;
    this.streamSyncState = null;
    this.streamSyncRevision = 0;
    this._setStreamStatus(STREAM_STATUS.DISCONNECTED, { reason: 'stop', detail: 'Stream stopped.' });
    return { ok: true, status: this.stream?.status || STREAM_STATUS.DISCONNECTED };
  }

  _scheduleStreamReconnect(cfg) {
    if (!cfg?.autoReconnect || this.streamStopRequested) return;
    if (this.streamReconnectTimer) return;
    const attempt = Number(this.stream?.reconnectAttempts || 0) + 1;
    if (this.stream) this.stream.reconnectAttempts = attempt;
    const delay = Math.min(60_000, 1500 * attempt);
    if (STREAM_DEBUG.enabled) {
      appendStreamDebugLine({
        type: 'reconnect_scheduled',
        attempt,
        delayMs: delay,
        reason: this.stream?.reason || null,
        atMs: nowMs()
      });
    }
    this.streamReconnectTimer = setTimeout(() => {
      this.streamReconnectTimer = null;
      if (this.streamStopRequested) return;
      if (this.streamEndpoint) this._connectStream(this.streamEndpoint, cfg);
    }, delay);
  }

  _connectStream(endpoint, cfg) {
    const ioClient = getSocketIoClient();
    if (!ioClient) return;
    if (!endpoint?.connectUrl) return;

    this._clearStreamHealthWatchdog();

    if (this.streamSocket) {
      try { this.streamSocket.removeAllListeners?.(); } catch {}
      try { this.streamSocket.disconnect?.(); } catch {}
    }

    const headers = this.buildDeveloperHeaders();
    const url = endpoint.displayUrl || endpoint.connectUrl;
    const socket = ioClient(endpoint.connectUrl, {
      path: endpoint.path || '/streams-api/socket.io',
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
      timeout: 12_000,
      extraHeaders: headers
    });

    this.streamSocket = socket;
    this.streamEndpoint = endpoint;
    if (!this.stream) this.stream = {};
    this.stream.url = url;
    this._setStreamStatus(STREAM_STATUS.CONNECTING, { reason: 'connect', detail: 'Connecting to stream.' });

    if (STREAM_DEBUG.enabled) {
      appendStreamDebugLine({
        type: 'connect_init',
        url,
        connectUrl: endpoint.connectUrl,
        path: endpoint.path || '/streams-api/socket.io',
        transports: ['websocket'],
        timeoutMs: 12_000,
        autoReconnect: cfg?.autoReconnect !== false,
        headers,
        atMs: nowMs()
      });
    }

    socket.on('connect', () => {
      if (!this.stream) this.stream = {};
      this.stream.lastError = null;
      this.stream.reconnectAttempts = 0;
      this._setStreamStatus(STREAM_STATUS.CONNECTED, { reason: 'connect', detail: 'Stream connected.' });
      void this._subscribeStream(socket, cfg);
    });

    socket.on('disconnect', (reason) => {
      const info = classifyStreamError(reason, { phase: 'disconnect' });
      this._setStreamStatus(STREAM_STATUS.DISCONNECTED, { reason: info.reason, detail: info.message, atMs: nowMs() });
      if (STREAM_DEBUG.enabled) {
        appendStreamDebugLine({ type: 'disconnect', reason: info.reason, message: info.message, atMs: nowMs() });
      }
      this._scheduleStreamReconnect(cfg);
    });

    socket.on('connect_error', (err) => {
      const info = classifyStreamError(err, { phase: 'connect' });
      this._emitStreamError({ reason: info.reason, message: info.message, phase: 'connect' });
      this._scheduleStreamReconnect(cfg);
    });

    socket.on('error', (err) => {
      const info = classifyStreamError(err, { phase: 'socket' });
      this._emitStreamError({ reason: info.reason, message: info.message, phase: 'socket' });
    });

    const ignoreEvents = new Set([
      'connect',
      'disconnect',
      'connect_error',
      'error',
      'reconnect',
      'reconnect_attempt',
      'reconnect_error',
      'reconnect_failed',
      'ping',
      'pong',
      'subscriptions'
    ]);

    socket.onAny((event, ...args) => {
      if (ignoreEvents.has(event)) return;
      const atMs = nowMs();
      const revision = Number(socket.__streamRevision || 0);
      const payloads = (args || []).filter((arg) => typeof arg !== 'function');
      if (payloads.length === 0) {
        this._handleStreamMessage(null, atMs, event, revision);
        return;
      }
      for (const payload of payloads) {
        this._handleStreamMessage(payload, atMs, event, revision);
      }
    });
  }

  _handleStreamMessage(data, atMsOverride, eventName, revision) {
    const atMs = Number.isFinite(Number(atMsOverride)) ? Number(atMsOverride) : nowMs();
    const activeRevision = Number(this.streamSyncRevision || 0);
    const msgRevision = Number(revision || 0);
    if (!msgRevision) return;
    if (activeRevision && msgRevision !== activeRevision) return;
    const payload = normalizeStreamPayload(data);
    if (!this.stream) this.stream = {};

    if (isStreamSyncEnd(payload, eventName)) {
      this.stream.lastMessageAtMs = atMs;
      this._flushStreamSyncState(atMs, { force: true, reason: 'sync_end' });
      this._setStreamStatus(STREAM_STATUS.LIVE, { reason: 'sync_end', detail: 'Initial sync complete.', atMs });
      if (STREAM_DEBUG.enabled) {
        appendStreamDebugLine({ type: 'sync_end', atMs, streamSyncRevision: activeRevision || msgRevision || 0 });
      }
      return;
    }

    if (Array.isArray(payload)) {
      for (const item of payload) {
        this._handleStreamMessage(item, atMs, eventName, revision);
      }
      return;
    }

    const event = this._normalizeStreamEvent(payload, atMs, eventName);
    if (event && typeof event === 'object') {
      event.streamSyncRevision = activeRevision || msgRevision || 0;
    }
    const eventType = String(event?.type || '').toLowerCase();
    if (eventType) {
      if (eventType in this.streamDebugCounters) this.streamDebugCounters[eventType] += 1;
      else this.streamDebugCounters.raw += 1;
    }
    if (eventType !== 'stream_raw') {
      this.stream.lastMessageAtMs = atMs;
    }
    if (this._cacheStreamSyncEvent(event, payload)) return;
    this.emitStreamEvent(event);
  }

  _normalizeStreamEvent(payload, atMs, eventName) {
    if (!payload || typeof payload !== 'object') {
      return { type: 'stream_raw', raw: payload, atMs };
    }

    const data = payload?.data ?? payload?.d ?? payload;
    const typeRaw = String(payload?.type || payload?.event || payload?.topic || eventName || '').trim().toLowerCase();
    const typeNorm = typeRaw.replace(/[^a-z0-9]/g, '');
    const symbol =
      String(data?.symbol || data?.sym || payload?.symbol || payload?.sym || '').trim() ||
      null;

    const bid = parseNumberLoose(data?.bid ?? data?.bp ?? payload?.bid);
    const ask = parseNumberLoose(data?.ask ?? data?.ap ?? payload?.ask);
    const last = parseNumberLoose(data?.last ?? data?.p ?? data?.price ?? payload?.last);
    const quoteTimestamp = normalizeEpochMs(data?.timestamp ?? data?.t ?? payload?.timestamp);

    if (symbol && (bid != null || ask != null || last != null)) {
      return {
        type: 'quote',
        symbol,
        quote: {
          bid: bid ?? null,
          ask: ask ?? null,
          last: last ?? null,
          mid: bid != null && ask != null ? (bid + ask) / 2 : (last ?? bid ?? ask ?? null),
          spread: bid != null && ask != null ? ask - bid : null,
          timestampMs: quoteTimestamp ?? null
        },
        atMs,
        raw: payload
      };
    }

    if (Array.isArray(data?.positions)) {
      return { type: 'positions', positions: data.positions, atMs, raw: payload };
    }
    if (Array.isArray(data?.orders)) {
      return { type: 'orders', orders: data.orders, atMs, raw: payload };
    }
    if (Array.isArray(data) && typeNorm.includes('position')) {
      return { type: 'positions', positions: data, atMs, raw: payload };
    }
    if (Array.isArray(data) && typeNorm.includes('order')) {
      return { type: 'orders', orders: data, atMs, raw: payload };
    }
    if (data?.position || data?.positionId) {
      return { type: 'position', position: data?.position || data, atMs, raw: payload };
    }
    if (data?.order || data?.orderId) {
      return { type: 'order', order: data?.order || data, atMs, raw: payload };
    }
    if (data?.balance != null || data?.equity != null || data?.accountId != null) {
      return { type: 'account', account: data, atMs, raw: payload };
    }
    if (typeNorm.includes('position')) {
      return { type: 'position', position: data, atMs, raw: payload };
    }
    if (typeNorm.includes('order')) {
      return { type: 'order', order: data, atMs, raw: payload };
    }
    if (typeNorm.includes('account')) {
      return { type: 'account', account: data, atMs, raw: payload };
    }

    if (typeRaw) {
      return { type: typeRaw, data, atMs, raw: payload };
    }

    return { type: 'stream_raw', raw: payload, atMs };
  }

  getSavedConfig() {
    return {
      ok: true,
      env: this.state.env,
      server: this.state.server || '',
      email: this.state.email || '',
      autoConnect: !!this.state.autoConnect,
      accountId: parseAccountIdentifier(this.state.accountId),
      accNum: parseAccountIdentifier(this.state.accNum),
      tradingEnabled: !!this.state.tradingEnabled,
      autoPilotEnabled: !!this.state.autoPilotEnabled,
      defaultOrderQty: this.state.defaultOrderQty,
      defaultOrderType: this.state.defaultOrderType,
      streamingEnabled: !!this.state.streamingEnabled,
      streamingUrl: this.state.streamingUrl || '',
      streamingAutoReconnect: this.state.streamingAutoReconnect !== false,
      streamingSubscribe: this.state.streamingSubscribe || '',
      debug: normalizeDebugSettings(this.state.debug),
      hasSavedPassword: !!this.state.secrets?.password,
      hasSavedDeveloperApiKey: !!this.state.secrets?.developerApiKey,
      encryptionAvailable: safeStorage.isEncryptionAvailable()
    };
  }

  getLastOrderDebug() {
    return { ok: true, path: getOrderDebugPath(), debug: this.lastOrderDebug };
  }

  updateSavedConfig(patch) {
    const next = deepMerge(this.state, patch || {});
    next.env = normalizeEnv(next.env);
    next.apiBaseUrl = normalizeBaseUrl(next.apiBaseUrl);
    next.authBaseUrl = normalizeBaseUrl(next.authBaseUrl);
    next.accountId = parseAccountIdentifier(next.accountId);
    next.accNum = parseAccountIdentifier(next.accNum);
    if (!['market', 'limit', 'stop'].includes(String(next.defaultOrderType || '').toLowerCase())) {
      next.defaultOrderType = DEFAULT_STATE.defaultOrderType;
    }
    next.debug = normalizeDebugSettings(next.debug);
    this.state = next;
    return persistState(this.state);
  }

  clearSavedSecrets() {
    this.state = deepMerge(this.state, {
      secrets: { password: null, developerApiKey: null, profiles: {} }
    });
    this.sessionDeveloperApiKey = null;
    const res = persistState(this.state);
    return { ...res, ok: !!res.ok };
  }

  async connect(opts) {
    const env = normalizeEnv(opts?.env);
    const server = String(opts?.server || this.state.server || '').trim();
    const email = String(opts?.email || this.state.email || '').trim();
    const explicitProfileKey = normalizeTradeLockerProfileSecretKey(opts?.profileKey);
    const profileKey = explicitProfileKey || buildTradeLockerProfileSecretKey({ env, server, email });
    const profileScopedConnect = explicitProfileKey !== '' || opts?.profileScoped === true;
    const requestedAccountId = parseAccountIdentifier(opts?.accountId);
    const requestedAccNum = parseAccountIdentifier(opts?.accNum);

    const rememberPassword = opts?.rememberPassword === true;
    const rememberDeveloperApiKey = opts?.rememberDeveloperApiKey === true;

    if (!server) return { ok: false, error: 'TradeLocker server is required.' };
    if (!email) return { ok: false, error: 'TradeLocker email is required.' };

    const profileSecretMap = ensureTradeLockerProfileSecretMap(this.state);
    const profileSecretEntryRaw = profileKey ? profileSecretMap[profileKey] : null;
    const profileSecretEntry =
      profileSecretEntryRaw && typeof profileSecretEntryRaw === 'object' && !Array.isArray(profileSecretEntryRaw)
        ? profileSecretEntryRaw
        : {};

    let password = String(opts?.password || '').trim();
    if (!password && profileSecretEntry?.password) password = decryptSecret(profileSecretEntry.password) || '';
    if (!password && !profileScopedConnect) password = decryptSecret(this.state.secrets?.password) || '';

    let developerApiKey = String(opts?.developerApiKey || '').trim();
    if (!developerApiKey && profileSecretEntry?.developerApiKey) {
      developerApiKey = decryptSecret(profileSecretEntry.developerApiKey) || '';
    }
    if (!developerApiKey && !profileScopedConnect) developerApiKey = decryptSecret(this.state.secrets?.developerApiKey) || '';
    this.sessionDeveloperApiKey = developerApiKey || null;

    if (!password) {
      if (profileScopedConnect) {
        return {
          ok: false,
          error: 'TradeLocker password is required for the selected profile.',
          code: 'password_required_for_profile'
        };
      }
      return { ok: false, error: 'TradeLocker password is required (or save it in Settings).' };
    }

    this.lastError = null;

    const prevEnv = normalizeEnv(this.state.env);
    const prevServer = String(this.state.server || '').trim().toLowerCase();
    const prevEmail = String(this.state.email || '').trim().toLowerCase();
    const nextServer = String(server || '').trim().toLowerCase();
    const nextEmail = String(email || '').trim().toLowerCase();
    const contextChanged = prevEnv !== env || prevServer !== nextServer || prevEmail !== nextEmail;
    const currentAccountId = parseAccountIdentifier(this.state.accountId);
    const currentAccNum = parseAccountIdentifier(this.state.accNum);
    const nextAccountId = requestedAccountId != null ? requestedAccountId : (contextChanged ? null : currentAccountId);
    const nextAccNum = requestedAccNum != null ? requestedAccNum : (contextChanged ? null : currentAccNum);

    // Update persisted non-secret config immediately
    this.updateSavedConfig({
      env,
      server,
      email,
      accountId: nextAccountId,
      accNum: nextAccNum
    });

    const warnings = [];
    if (rememberPassword) {
      const enc = encryptSecret(password);
      if (!enc) warnings.push('Password was not saved (encryption unavailable).');
      else {
        this.state.secrets.password = enc;
        if (profileKey) {
          const profileMap = ensureTradeLockerProfileSecretMap(this.state);
          const nextEntry = {
            ...(profileMap[profileKey] && typeof profileMap[profileKey] === 'object' ? profileMap[profileKey] : {}),
            password: enc
          };
          profileMap[profileKey] = nextEntry;
        }
      }
    }
    if (rememberDeveloperApiKey) {
      const enc = encryptSecret(developerApiKey);
      if (!enc && developerApiKey) warnings.push('Developer API key was not saved (encryption unavailable).');
      else {
        this.state.secrets.developerApiKey = enc;
        if (profileKey) {
          const profileMap = ensureTradeLockerProfileSecretMap(this.state);
          const nextEntry = {
            ...(profileMap[profileKey] && typeof profileMap[profileKey] === 'object' ? profileMap[profileKey] : {}),
            developerApiKey: enc
          };
          profileMap[profileKey] = nextEntry;
        }
      }
    }
    if (rememberPassword || rememberDeveloperApiKey) persistState(this.state);

      try {
        const debugSettings = normalizeDebugSettings(this.state.debug);
        const authCandidates = [];
        const addAuthCandidate = (value) => {
          const normalized = normalizeBaseUrl(value);
          if (!normalized) return;
          if (!authCandidates.includes(normalized)) authCandidates.push(normalized);
        };
        addAuthCandidate(this.state.authBaseUrl);
        addAuthCandidate(authUrlForEnv());
        addAuthCandidate(this.getBaseUrl());
        if (authCandidates.length === 0) authCandidates.push(authUrlForEnv());

        let tokenInfo = null;
        let authBaseUrlUsed = null;
        let lastError = null;

        for (const authBaseUrl of authCandidates) {
          const url = `${authBaseUrl}/auth/jwt/token`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...this.buildDeveloperHeaders()
            },
            body: JSON.stringify({ email, password, server })
          });
          const { text, json, contentType } = await readResponseBody(res);
          const isHtml = looksLikeHtmlResponse(text, contentType);
          if (!res.ok) {
            const err = formatHttpError({ status: res.status, statusText: res.statusText, bodyText: text, bodyJson: json });
            const errWithHint = isHtml ? `TradeLocker auth endpoint returned HTML (${authBaseUrl}). ${err}` : err;
            this.lastError = errWithHint;
            lastError = errWithHint;
            appendOrderDebugLine({
              at: new Date().toISOString(),
              atMs: nowMs(),
              type: 'auth_token',
              env: this.state.env,
              server: this.state.server || null,
              request: { path: '/auth/jwt/token', baseUrl: authBaseUrl, email: email ? '[set]' : '[empty]' },
              response: {
                ok: false,
                status: res.status,
                statusText: res.statusText,
                contentType,
                isHtml,
                text: typeof text === 'string' ? text.slice(0, Math.max(500, debugSettings.textLimit)) : '',
                json
              }
            }, debugSettings);
            continue;
          }

          const tokenCandidate = extractTokenInfo(json);
          const accessToken = tokenCandidate.accessToken;
          const refreshToken = tokenCandidate.refreshToken;
          if (!accessToken || !refreshToken) {
            const detail = extractErrorDetail(json);
            const keys = tokenCandidate.payloadKeys.length ? tokenCandidate.payloadKeys : tokenCandidate.rootKeys;
            const keyList = keys.length ? ` (keys: ${keys.join(', ')})` : '';
            const baseError = detail ? `${detail}` : `Invalid token response from TradeLocker${keyList}.`;
            const errWithHint = isHtml ? `TradeLocker auth endpoint returned HTML (${authBaseUrl}). ${baseError}` : baseError;
            this.lastError = errWithHint;
            lastError = errWithHint;
            appendOrderDebugLine({
              at: new Date().toISOString(),
              atMs: nowMs(),
              type: 'auth_token',
              env: this.state.env,
              server: this.state.server || null,
              request: { path: '/auth/jwt/token', baseUrl: authBaseUrl, email: email ? '[set]' : '[empty]' },
              response: {
                ok: true,
                status: res.status,
                statusText: res.statusText,
                contentType,
                isHtml,
                text: typeof text === 'string' ? text.slice(0, Math.max(500, debugSettings.textLimit)) : '',
                json,
                tokenKeys: keys
              }
            }, debugSettings);
            continue;
          }

          tokenInfo = tokenCandidate;
          authBaseUrlUsed = authBaseUrl;
          this.lastError = null;
          break;
        }

        if (!tokenInfo) {
          const fallbackError = lastError || 'Invalid token response from TradeLocker.';
          this.lastError = fallbackError;
          return { ok: false, error: fallbackError };
        }

        if (authBaseUrlUsed && normalizeBaseUrl(authBaseUrlUsed) !== normalizeBaseUrl(this.state.authBaseUrl)) {
          this.updateSavedConfig({ authBaseUrl: authBaseUrlUsed });
        }

        this.tokens = {
          accessToken: tokenInfo.accessToken,
          refreshToken: tokenInfo.refreshToken,
          expireAtMs: tokenInfo.expireAtMs,
          obtainedAtMs: nowMs()
        };
      this.resetAccountRouteHealth('account_not_ready');

      // Clear caches that depend on auth/account
      this.config = null;
      this.rateLimitConfig = null;
      this.rateLimitBuckets = new Map();
      this.routeRateLimitedUntilMs = new Map();
      this.resetRateLimitTelemetryState();
      this.instruments = null;
      this.instrumentsByTradableId = new Map();
      this.instrumentsByNameLower = new Map();
      this.quoteCache = new Map();
      this.dailyBarCache = new Map();
      this.historyCache = new Map();
      this.instrumentDetailsCache = new Map();
      this.sessionStatusCache = new Map();
      this.infoRouteCache = new Map();

      // Auto-select account if possible (or fill in missing accountId/accNum).
      try {
        const accountsJson = await this.apiJson('/auth/jwt/all-accounts');
        const accounts = normalizeAccountsList(Array.isArray(accountsJson?.accounts) ? accountsJson.accounts : []);
        this.accountsCache = { accounts, fetchedAtMs: nowMs() };

        const resolved = resolveTradeLockerAccountPair(accounts, {
          accountId: this.state.accountId,
          accNum: this.state.accNum,
          allowSingleAccountFallback: true
        });
        if (resolved?.ok) {
          this.state.accountId = resolved.accountId;
          this.state.accNum = resolved.accNum;
          persistState(this.state);
        }
      } catch {
        // ignore auto-account selection errors
      }

      const verifyRes = await this.verifyActiveAccountContext({ allowRepair: true });
      if (!verifyRes?.ok) {
        const verifyError = verifyRes?.error ? String(verifyRes.error) : 'TradeLocker account context verification failed.';
        this.lastError = verifyError;
        return {
          ok: false,
          error: verifyError,
          code: verifyRes?.code || 'account_auth_invalid',
          stage: 'verify'
        };
      }

      try {
        await this.ensureConfig();
      } catch {
        // ignore config fetch errors
      }

      try {
        this.startStream();
      } catch {
        // ignore stream start errors
      }

      return warnings.length > 0 ? { ok: true, warnings } : { ok: true };
    } catch (e) {
      const msg = redactErrorMessage(e?.message || String(e));
      this.lastError = msg;
      return { ok: false, error: msg };
    }
  }

  disconnect() {
    try { this.stopStream(); } catch {}
    this.tokens = null;
    this.lastError = null;
    this.resetAccountRouteHealth('account_not_ready');
    this.config = null;
    this.rateLimitConfig = null;
    this.rateLimitBuckets = new Map();
    this.routeRateLimitedUntilMs = new Map();
    this.resetRateLimitTelemetryState();
    this.instruments = null;
    this.instrumentsByTradableId = new Map();
    this.instrumentsByNameLower = new Map();
    this.accountsCache = { accounts: [], fetchedAtMs: 0 };
    this.refreshInFlight = null;
    this.rateLimitedUntilMs = 0;
    this.snapshotCache = null;
    this.snapshotCacheAtMs = 0;
    this.snapshotInFlight = null;
    this.snapshotCacheWithOrders = null;
    this.snapshotCacheWithOrdersAtMs = 0;
    this.snapshotInFlightWithOrders = null;
    this.accountMetricsCache = null;
    this.accountMetricsCacheAtMs = 0;
    this.accountMetricsInFlight = null;
    this.quoteCache = new Map();
    this.dailyBarCache = new Map();
    this.historyCache = new Map();
    this.instrumentDetailsCache = new Map();
    this.sessionStatusCache = new Map();
    this.infoRouteCache = new Map();
    this.sessionDeveloperApiKey = null;
    return { ok: true };
  }

  setActiveAccount({ accountId, accNum }) {
    const accounts = Array.isArray(this.accountsCache?.accounts) ? this.accountsCache.accounts : [];
    const resolved = resolveTradeLockerAccountPair(accounts, {
      accountId,
      accNum,
      allowSingleAccountFallback: false
    });
    if (!resolved?.ok) {
      const msg = resolved?.error || 'TradeLocker account could not be resolved.';
      this.lastError = msg;
      this.noteAccountRouteFailure('account_context_mismatch', msg);
      return {
        ok: false,
        error: msg,
        code: 'ACCOUNT_UNRESOLVED',
        accountId: parseAccountIdentifier(accountId) ?? null,
        accNum: parseAccountIdentifier(accNum) ?? null
      };
    }
    this.state.accountId = resolved.accountId;
    this.state.accNum = resolved.accNum;
    persistState(this.state);
    this.instruments = null;
    this.instrumentsByTradableId = new Map();
    this.instrumentsByNameLower = new Map();
    this.quoteCache = new Map();
    this.dailyBarCache = new Map();
    this.historyCache = new Map();
    this.infoRouteCache = new Map();
    this.resetRateLimitTelemetryState();
    this.resetAccountRouteHealth('account_not_ready');
    return { ok: true, accountId: this.state.accountId, accNum: this.state.accNum, resolvedBy: resolved.resolvedBy || 'exact' };
  }

  setTradingOptions({ tradingEnabled, autoPilotEnabled, defaultOrderQty, defaultOrderType }) {
    const patch = {};
    if (typeof tradingEnabled === 'boolean') patch.tradingEnabled = tradingEnabled;
    if (typeof autoPilotEnabled === 'boolean') patch.autoPilotEnabled = autoPilotEnabled;
    if (defaultOrderQty != null) {
      const qty = parseNumberLoose(defaultOrderQty);
      if (qty != null && qty > 0) patch.defaultOrderQty = qty;
    }
    if (defaultOrderType != null) {
      const raw = String(defaultOrderType).toLowerCase();
      patch.defaultOrderType = raw === 'limit' ? 'limit' : raw === 'stop' ? 'stop' : 'market';
    }
    return this.updateSavedConfig(patch);
  }

  async ensureAccessTokenValid() {
    if (!this.tokens?.accessToken) throw new Error('Not connected to TradeLocker.');

    const now = nowMs();
    const expireAt = this.tokens.expireAtMs;
    if (expireAt && now < expireAt - 30_000) return;

    if (this.refreshInFlight) {
      await this.refreshInFlight;
      return;
    }

    const url = `${this.getAuthBaseUrl()}/auth/jwt/refresh`;
    this.refreshInFlight = (async () => {
      const doRequest = async (bodyObj) => {
        let res = null;
        try {
          res = await fetch(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...this.buildDeveloperHeaders()
            },
            body: JSON.stringify(bodyObj)
          });
        } catch (e) {
          const msg = redactErrorMessage(e?.message || String(e));
          return {
            res: { ok: false, status: 0, statusText: 'Network Error', headers: { get: () => null } },
            text: '',
            json: null,
            contentType: null,
            err: msg,
            error: e
          };
        }
        const { text, json, contentType } = await readResponseBody(res);
        const err = res.ok
          ? null
          : formatHttpError({ status: res.status, statusText: res.statusText, bodyText: text, bodyJson: json });
        return { res, text, json, contentType, err };
      };

      const throwUpstream = (entry, label) => {
        const status = Number(entry?.res?.status) || 503;
        const retryAfterMs = parseRetryAfterMs(entry?.res?.headers?.get?.('retry-after'));
        const msg = label || `TradeLocker auth unavailable (${this.getAuthBaseUrl()}).`;
        this.noteUpstreamFailure(status, msg);
        throw new HttpError(msg, { status, retryAfterMs, code: 'UPSTREAM_UNAVAILABLE' });
      };

      const first = await doRequest({ refreshToken: this.tokens.refreshToken });
      const firstHtml = looksLikeHtmlResponse(first.text, first.contentType);
      if (first.res.ok) {
        const tokenInfo = extractTokenInfo(first.json);
        const accessToken = tokenInfo.accessToken;
        const refreshToken = tokenInfo.refreshToken;
        if (!accessToken || !refreshToken) {
          if (firstHtml || !first.json) {
            throwUpstream(first, `TradeLocker auth endpoint returned invalid HTML/JSON (${this.getAuthBaseUrl()}).`);
          }
          const detail = extractErrorDetail(first.json);
          const keys = tokenInfo.payloadKeys.length ? tokenInfo.payloadKeys : tokenInfo.rootKeys;
          const keyList = keys.length ? ` (keys: ${keys.join(', ')})` : '';
          const msg = detail ? detail : `Invalid refresh token response from TradeLocker${keyList}.`;
          throw new HttpError(msg, { status: first.res.status || 400, code: 'AUTH_REFRESH_FAILED' });
        }
        this.tokens = {
          accessToken,
          refreshToken,
          expireAtMs: tokenInfo.expireAtMs,
          obtainedAtMs: nowMs()
        };
        return;
      }

      const firstErr = first.err || 'Failed to refresh TradeLocker token.';
      const firstStatus = Number(first.res?.status) || 0;
      if (firstHtml || isUpstreamStatus(firstStatus) || firstStatus === 0 || isTransientNetworkError(first.error)) {
        throwUpstream(first, firstErr);
      }
      if (firstStatus === 401 || firstStatus === 403) {
        throw new HttpError(firstErr, { status: firstStatus, code: 'AUTH_REFRESH_FAILED' });
      }
      if (firstStatus !== 400) {
        throw new HttpError(firstErr, { status: firstStatus, code: classifyTradeLockerError({ status: firstStatus, message: firstErr }) || undefined });
      }

      const firstTextLower = `${firstErr}\n${first.text || ''}`.toLowerCase();
      const looksLikeMissingAccessToken =
        firstTextLower.includes('accesstoken') ||
        firstTextLower.includes('access token');
      if (!looksLikeMissingAccessToken) {
        throw new HttpError(firstErr, { status: firstStatus || 400, code: 'AUTH_REFRESH_FAILED' });
      }

      const second = await doRequest({ accessToken: this.tokens.accessToken, refreshToken: this.tokens.refreshToken });
      const secondHtml = looksLikeHtmlResponse(second.text, second.contentType);
      if (second.res.ok) {
        const tokenInfo = extractTokenInfo(second.json);
        const accessToken = tokenInfo.accessToken;
        const refreshToken = tokenInfo.refreshToken;
        if (!accessToken || !refreshToken) {
          if (secondHtml || !second.json) {
            throwUpstream(second, `TradeLocker auth endpoint returned invalid HTML/JSON (${this.getAuthBaseUrl()}).`);
          }
          const detail = extractErrorDetail(second.json);
          const keys = tokenInfo.payloadKeys.length ? tokenInfo.payloadKeys : tokenInfo.rootKeys;
          const keyList = keys.length ? ` (keys: ${keys.join(', ')})` : '';
          const msg = detail ? detail : `Invalid refresh token response from TradeLocker${keyList}.`;
          throw new HttpError(msg, { status: second.res.status || 400, code: 'AUTH_REFRESH_FAILED' });
        }
        this.tokens = {
          accessToken,
          refreshToken,
          expireAtMs: tokenInfo.expireAtMs,
          obtainedAtMs: nowMs()
        };
        return;
      }

      const secondStatus = Number(second.res?.status) || 0;
      if (secondHtml || isUpstreamStatus(secondStatus) || secondStatus === 0 || isTransientNetworkError(second.error)) {
        throwUpstream(second, second.err || firstErr);
      }
      throw new HttpError(second.err || firstErr, {
        status: secondStatus,
        code: classifyTradeLockerError({ status: secondStatus, message: second.err || firstErr }) || undefined
      });
    })().finally(() => {
      this.refreshInFlight = null;
    });

    await this.refreshInFlight;
  }

  buildDeveloperHeaders() {
    const headers = {};
    const developerApiKey =
      this.sessionDeveloperApiKey || decryptSecret(this.state.secrets?.developerApiKey);
    if (developerApiKey) {
      headers['tl-developer-api-key'] = developerApiKey;
      headers['developer-api-key'] = developerApiKey;
    }
    return headers;
  }

  requiresAccNum(pathname) {
    const path = String(pathname || '').trim();
    if (!path) return false;
    return path.startsWith('/trade/') || path.startsWith('trade/');
  }

  buildAuthHeaders({ includeAccNum = false, includeDeveloper = true } = {}) {
    const headers = {};
    if (this.tokens?.accessToken) headers.Authorization = `Bearer ${this.tokens.accessToken}`;
    if (includeAccNum) {
      if (!this.state.accNum) throw new Error('TradeLocker accNum not set. Select an account first.');
      headers.accNum = String(this.state.accNum);
    }
    if (includeDeveloper) Object.assign(headers, this.buildDeveloperHeaders());
    return headers;
  }

  async apiJson(pathname, { method = 'GET', body, headers = {}, includeAccNum = false, includeDeveloper = true } = {}) {
    return this.withRequestThrottle(async () => {
      const upstreamBackoff = this.getUpstreamBackoff();
      if (upstreamBackoff) {
        throw new HttpError(`TradeLocker upstream unavailable. Retry in ${Math.ceil(upstreamBackoff.retryAfterMs / 1000)}s.`, {
          status: 503,
          retryAfterMs: upstreamBackoff.retryAfterMs,
          code: 'UPSTREAM_UNAVAILABLE'
        });
      }

      await this.ensureAccessTokenValid();
      const includeAccNumFinal = includeAccNum || this.requiresAccNum(pathname);
      const accountScopedRequest = includeAccNumFinal;
      if (includeAccNumFinal && parseAccountIdentifier(this.state.accNum) == null) {
        await this.ensureAccountContext();
      }
      const url = `${this.getBaseUrl()}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
      const finalHeaders = {
        ...this.buildAuthHeaders({ includeAccNum: includeAccNumFinal, includeDeveloper }),
        ...headers
      };
      const hasBody = body !== undefined;
      if (hasBody) finalHeaders['content-type'] = 'application/json';

      const requestStartedAtMs = nowMs();
      this.noteRateLimitTelemetry({ method, pathname, event: 'request' });
      let res = null;
      try {
        res = await fetch(url, {
          method,
          headers: finalHeaders,
          body: hasBody ? JSON.stringify(body) : undefined
        });
      } catch (e) {
        const msg = redactErrorMessage(e?.message || String(e));
        this.lastError = msg;
        this.noteUpstreamFailure(0, msg);
        this.noteRateLimitTelemetry({
          method,
          pathname,
          event: 'error',
          status: 0,
          latencyMs: nowMs() - requestStartedAtMs,
          error: msg
        });
        throw new HttpError(msg, { status: 0, code: 'UPSTREAM_UNAVAILABLE' });
      }

      const { text, json } = await readResponseBody(res);
      const isQuotesEndpoint = String(pathname || '').includes('/trade/quotes');
      if (isQuotesEndpoint) {
        const debugSettings = normalizeDebugSettings(this.state?.debug);
        appendQuoteDebugLine({
          at: new Date().toISOString(),
          atMs: nowMs(),
          env: this.state.env,
          server: this.state.server || null,
          accountId: this.state.accountId ?? null,
          accNum: this.state.accNum ?? null,
          request: { method, path: pathname },
          response: {
            ok: res.ok,
            status: res.status,
            statusText: res.statusText,
            headers: collectResponseHeaders(res),
            text,
            json
          }
        }, debugSettings);
      }
      if (!res.ok) {
        const err = formatHttpError({ status: res.status, statusText: res.statusText, bodyText: text, bodyJson: json });
        const endpoint = `${method} ${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
        const errWithEndpoint = `${err} [${endpoint}]`;
        const retryAfterMs = (() => {
          const headerMs = parseNumberLoose(res.headers?.get?.('retry-after-ms'));
          if (headerMs != null && headerMs >= 0) return Math.floor(headerMs);
          return parseRetryAfterMs(res.headers?.get?.('retry-after'));
        })();
        if (res.status === 429) {
          this.noteRateLimitHit({ method, pathname, retryAfterMs });
        } else {
          this.noteRateLimitTelemetry({
            method,
            pathname,
            event: 'error',
            status: res.status,
            retryAfterMs,
            latencyMs: nowMs() - requestStartedAtMs,
            error: errWithEndpoint
          });
        }
        if (isUpstreamStatus(res.status)) {
          this.noteUpstreamFailure(res.status, errWithEndpoint);
        }
        if (accountScopedRequest && isAccountRouteFailure({ status: res.status, message: errWithEndpoint, code: null })) {
          const reason = classifyAccountRouteFailureReason({ status: res.status, message: errWithEndpoint, code: null }) || 'account_auth_invalid';
          this.noteAccountRouteFailure(reason, errWithEndpoint);
        }
        throw new HttpError(errWithEndpoint, {
          status: res.status,
          retryAfterMs,
          code: classifyTradeLockerError({ status: res.status, message: errWithEndpoint }) || undefined
        });
      }
      this.noteUpstreamSuccess();
      if (accountScopedRequest) this.noteAccountRouteHealthy();
      this.noteRateLimitTelemetry({
        method,
        pathname,
        event: 'success',
        status: res.status,
        latencyMs: nowMs() - requestStartedAtMs
      });
      return json;
    }, { method, pathname });
  }

  async apiRequestMeta(pathname, { method = 'GET', body, headers = {}, includeAccNum = false } = {}) {
    try {
      return await this.withRequestThrottle(async () => {
        const upstreamBackoff = this.getUpstreamBackoff();
        if (upstreamBackoff) {
          return {
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            error: `TradeLocker upstream unavailable. Retry in ${Math.ceil(upstreamBackoff.retryAfterMs / 1000)}s.`,
            rateLimited: false,
            retryAtMs: upstreamBackoff.until,
            retryAfterMs: upstreamBackoff.retryAfterMs,
            code: 'UPSTREAM_UNAVAILABLE',
            url: `${this.getBaseUrl()}${pathname.startsWith('/') ? '' : '/'}${pathname}`,
            headers: {},
            text: '',
            json: null
          };
        }

        try {
          await this.ensureAccessTokenValid();
          const includeAccNumFinal = includeAccNum || this.requiresAccNum(pathname);
          const accountScopedRequest = includeAccNumFinal;
          if (includeAccNumFinal && parseAccountIdentifier(this.state.accNum) == null) {
            await this.ensureAccountContext();
          }
          if (accountScopedRequest && parseAccountIdentifier(this.state.accNum) == null) {
            this.noteAccountRouteFailure('account_not_ready', 'TradeLocker accNum not set. Select an account first.');
          }
        } catch (e) {
          const msg = redactErrorMessage(e?.message || String(e));
          const status = typeof e?.status === 'number' ? e.status : 0;
          const code = e?.code || classifyTradeLockerError({ status, message: msg }) || undefined;
          this.lastError = msg;
          if ((includeAccNum || this.requiresAccNum(pathname)) && isAccountRouteFailure({ status, message: msg, code })) {
            const reason = classifyAccountRouteFailureReason({ status, message: msg, code }) || 'account_auth_invalid';
            this.noteAccountRouteFailure(reason, msg);
          }
          return {
            ok: false,
            status,
            statusText: 'Auth Error',
            error: msg,
            code,
            url: `${this.getBaseUrl()}${pathname.startsWith('/') ? '' : '/'}${pathname}`,
            headers: {},
            text: '',
            json: null
          };
        }

        const url = `${this.getBaseUrl()}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
        const includeAccNumFinal = includeAccNum || this.requiresAccNum(pathname);
        const accountScopedRequest = includeAccNumFinal;
        const finalHeaders = {
          ...this.buildAuthHeaders({ includeAccNum: includeAccNumFinal }),
          ...headers
        };
        const hasBody = body !== undefined;
        if (hasBody) finalHeaders['content-type'] = 'application/json';

        const requestStartedAtMs = nowMs();
        this.noteRateLimitTelemetry({ method, pathname, event: 'request' });
        let res = null;
        try {
          res = await fetch(url, {
            method,
            headers: finalHeaders,
            body: hasBody ? JSON.stringify(body) : undefined
          });
        } catch (e) {
          const msg = redactErrorMessage(e?.message || String(e));
          this.lastError = msg;
          this.noteUpstreamFailure(0, msg);
          this.noteRateLimitTelemetry({
            method,
            pathname,
            event: 'error',
            status: 0,
            latencyMs: nowMs() - requestStartedAtMs,
            error: msg
          });
          return { ok: false, status: 0, statusText: 'Network Error', error: msg, code: 'UPSTREAM_UNAVAILABLE', url, headers: {}, text: '', json: null };
        }

        const { text, json } = await readResponseBody(res);

        const responseHeaders = {};
        try {
          for (const [k, v] of res.headers.entries()) responseHeaders[k] = v;
        } catch {
          // ignore
        }

        const retryAfterMs = (() => {
          const headerMs = parseNumberLoose(res.headers?.get?.('retry-after-ms'));
          if (headerMs != null && headerMs >= 0) return Math.floor(headerMs);
          return parseRetryAfterMs(res.headers?.get?.('retry-after'));
        })();
        if (res.status === 429) {
          this.noteRateLimitHit({ method, pathname, retryAfterMs });
        }

        const out = {
          ok: !!res.ok,
          status: res.status,
          statusText: res.statusText,
          error: null,
          rateLimited: res.status === 429,
          retryAtMs: this.getRateLimitBlockUntilMs({ method, pathname }) || 0,
          retryAfterMs,
          code: res.status === 429 ? 'RATE_LIMITED' : null,
          url,
          headers: responseHeaders,
          text,
          json
        };

        if (!res.ok) {
          const err = formatHttpError({ status: res.status, statusText: res.statusText, bodyText: text, bodyJson: json });
          const endpoint = `${method} ${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
          out.error = `${err} [${endpoint}]`;
          this.lastError = out.error;
          if (res.status !== 429) {
            this.noteRateLimitTelemetry({
              method,
              pathname,
              event: 'error',
              status: res.status,
              retryAfterMs,
              latencyMs: nowMs() - requestStartedAtMs,
              error: out.error
            });
          }
          if (isUpstreamStatus(res.status)) {
            this.noteUpstreamFailure(res.status, out.error);
            out.code = 'UPSTREAM_UNAVAILABLE';
          } else if (out.code == null) {
            out.code = classifyTradeLockerError({ status: res.status, message: out.error }) || null;
          }
          if (accountScopedRequest && isAccountRouteFailure({ status: res.status, message: out.error, code: out.code })) {
            const reason = classifyAccountRouteFailureReason({ status: res.status, message: out.error, code: out.code }) || 'account_auth_invalid';
            this.noteAccountRouteFailure(reason, out.error);
          }
        }

        if (res.ok) {
          this.noteUpstreamSuccess();
          if (accountScopedRequest) this.noteAccountRouteHealthy();
          this.noteRateLimitTelemetry({
            method,
            pathname,
            event: 'success',
            status: res.status,
            latencyMs: nowMs() - requestStartedAtMs
          });
        }
        return out;
      }, { method, pathname });
    } catch (e) {
      const status = typeof e?.status === 'number' ? e.status : null;
      if (status === 429) {
        const retryAtMs = this.getRateLimitBlockUntilMs({ method, pathname }) || 0;
        const retryAfterMs = typeof e?.retryAfterMs === 'number' ? e.retryAfterMs : (retryAtMs ? Math.max(0, retryAtMs - nowMs()) : null);
        return {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          error: e?.message ? String(e.message) : 'TradeLocker rate limited.',
          rateLimited: true,
          retryAtMs,
          retryAfterMs,
          code: 'RATE_LIMITED',
          url: `${this.getBaseUrl()}${pathname.startsWith('/') ? '' : '/'}${pathname}`,
          headers: {},
          text: '',
          json: null
        };
      }
      throw e;
    }
  }

  async getAllAccounts() {
    try {
      const json = await this.apiJson('/auth/jwt/all-accounts');
      const accounts = normalizeAccountsList(Array.isArray(json?.accounts) ? json.accounts : []);
      this.accountsCache = { accounts, fetchedAtMs: nowMs() };
      return { ok: true, accounts };
    } catch (e) {
      const msg = redactErrorMessage(e?.message || String(e));
      this.lastError = msg;
      return { ok: false, error: msg, accounts: [] };
    }
  }

  async ensureAllAccountsCache(maxAgeMs = 60_000) {
    const age = nowMs() - (this.accountsCache?.fetchedAtMs || 0);
    if (Array.isArray(this.accountsCache?.accounts) && this.accountsCache.accounts.length > 0 && age < maxAgeMs) {
      return this.accountsCache.accounts;
    }
    try {
      const json = await this.apiJson('/auth/jwt/all-accounts');
      const accounts = normalizeAccountsList(Array.isArray(json?.accounts) ? json.accounts : []);
      if (accounts.length > 0) {
        this.accountsCache = { accounts, fetchedAtMs: nowMs() };
        return accounts;
      }
      const fallback = normalizeAccountsList(Array.isArray(this.accountsCache?.accounts) ? this.accountsCache.accounts : []);
      if (fallback.length > 0) {
        this.accountsCache = { accounts: fallback, fetchedAtMs: this.accountsCache?.fetchedAtMs || nowMs() };
      }
      if (fallback.length > 0) return fallback;
      return accounts;
    } catch (e) {
      const msg = redactErrorMessage(e?.message || String(e));
      this.lastError = msg;
      const fallback = normalizeAccountsList(Array.isArray(this.accountsCache?.accounts) ? this.accountsCache.accounts : []);
      if (fallback.length > 0) {
        this.accountsCache = { accounts: fallback, fetchedAtMs: this.accountsCache?.fetchedAtMs || nowMs() };
      }
      if (fallback.length > 0) return fallback;
      return [];
    }
  }

  async ensureAccountContext() {
    const accountId = parseAccountIdentifier(this.state.accountId);
    const accNum = parseAccountIdentifier(this.state.accNum);
    const accounts = await this.ensureAllAccountsCache(60_000);
    if (!Array.isArray(accounts) || accounts.length === 0) {
      if (accountId != null && accNum != null) {
        return { ok: true, accountId, accNum, stale: true };
      }
      const upstreamBlocked = this.getUpstreamBackoff();
      this.noteAccountRouteFailure('account_not_ready', upstreamBlocked ? 'TradeLocker upstream unavailable.' : 'TradeLocker account not selected.');
      return {
        ok: false,
        error: upstreamBlocked ? 'TradeLocker upstream unavailable.' : 'TradeLocker account not selected.',
        code: upstreamBlocked ? 'UPSTREAM_UNAVAILABLE' : 'ACCOUNT_NOT_READY'
      };
    }

    const resolved = resolveTradeLockerAccountPair(accounts, {
      accountId,
      accNum,
      allowSingleAccountFallback: true
    });
    if (resolved?.ok) {
      this.state.accountId = resolved.accountId;
      this.state.accNum = resolved.accNum;
      persistState(this.state);
      return { ok: true, accountId: this.state.accountId, accNum: this.state.accNum };
    }

    const reason = resolved?.code === 'account_not_ready' ? 'account_not_ready' : 'account_context_mismatch';
    this.noteAccountRouteFailure(reason, resolved?.error || 'TradeLocker account not selected.');
    return {
      ok: false,
      error: resolved?.error || 'TradeLocker account not selected.',
      code: resolved?.code || 'ACCOUNT_NOT_READY'
    };
  }

  findSelectedAccount(accounts) {
    const safeAccounts = Array.isArray(accounts) ? accounts : [];
    const resolved = resolveTradeLockerAccountPair(safeAccounts, {
      accountId: this.state.accountId,
      accNum: this.state.accNum,
      allowSingleAccountFallback: true
    });
    if (!resolved?.ok) return null;
    return safeAccounts.find((entry) => {
      const entryAccountId = readAccountIdFromEntry(entry);
      const entryAccNum = readAccNumFromEntry(entry);
      return entryAccountId === resolved.accountId && entryAccNum === resolved.accNum;
    }) || null;
  }

  async verifyActiveAccountContext({ allowRepair = true } = {}) {
    const context = await this.ensureAccountContext();
    if (!context?.ok) {
      const reason = context?.code === 'ACCOUNT_NOT_READY' || context?.code === 'account_not_ready'
        ? 'account_not_ready'
        : 'account_context_mismatch';
      this.noteAccountRouteFailure(reason, context?.error || 'TradeLocker account not selected.');
      return {
        ok: false,
        error: context?.error || 'TradeLocker account not selected.',
        code: context?.code || 'ACCOUNT_NOT_READY',
        stage: 'verify'
      };
    }

    const probe = await this.apiRequestMeta('/trade/config', { includeAccNum: true });
    if (probe?.ok) {
      this.noteAccountRouteHealthy();
      return { ok: true, accountId: context.accountId, accNum: context.accNum, stage: 'verify' };
    }

    if (allowRepair) {
      const accounts = await this.ensureAllAccountsCache(0);
      const repaired = resolveTradeLockerAccountPair(accounts, {
        accountId: this.state.accountId,
        accNum: this.state.accNum,
        allowSingleAccountFallback: true
      });
      if (repaired?.ok) {
        this.state.accountId = repaired.accountId;
        this.state.accNum = repaired.accNum;
        persistState(this.state);
        const retryProbe = await this.apiRequestMeta('/trade/config', { includeAccNum: true });
        if (retryProbe?.ok) {
          this.noteAccountRouteHealthy();
          return { ok: true, accountId: repaired.accountId, accNum: repaired.accNum, stage: 'verify', resolvedBy: 'reconnect_retry' };
        }
        const retryReason = classifyAccountRouteFailureReason({
          status: retryProbe?.status,
          message: retryProbe?.error,
          code: retryProbe?.code
        }) || 'account_auth_invalid';
        this.noteAccountRouteFailure(retryReason, retryProbe?.error || 'TradeLocker account verification failed.');
        return {
          ok: false,
          error: retryProbe?.error || 'TradeLocker account verification failed.',
          code: retryReason,
          stage: 'verify'
        };
      }
    }

    const reason = classifyAccountRouteFailureReason({
      status: probe?.status,
      message: probe?.error,
      code: probe?.code
    }) || 'account_auth_invalid';
    this.noteAccountRouteFailure(reason, probe?.error || 'TradeLocker account verification failed.');
    return {
      ok: false,
      error: probe?.error || 'TradeLocker account verification failed.',
      code: reason,
      stage: 'verify'
    };
  }

  async getBalanceFromAllAccounts(maxAgeMs = 30_000) {
    const accounts = await this.ensureAllAccountsCache(maxAgeMs);
    const selected = this.findSelectedAccount(accounts);
    const balance = parseNumberLoose(selected?.aaccountBalance ?? selected?.accountBalance ?? selected?.balance) ?? 0;
    return { balance, selectedAccount: selected };
  }

  findBestNumericField(mapped, columns, kind) {
    const safeColumns = Array.isArray(columns) ? columns : [];
    let best = { score: -Infinity, value: null, id: null };

    for (const col of safeColumns) {
      const id = String(col?.id || '').trim();
      if (!id) continue;
      const raw = mapped?.[id];
      const value = parseNumberLoose(raw);
      if (value == null) continue;

      const idLower = id.toLowerCase();
      const textLower = columnTextLower(col);

      let score = 0;
      if (kind === 'balance') {
        if (idLower === 'balance') score += 100;
        if (idLower.includes('account') && idLower.includes('balance')) score += 90;
        if (idLower.includes('balance')) score += 80;
        if (textLower.includes('balance')) score += 75;
        if (idLower.includes('cash')) score += 70;
        if (textLower.includes('cash')) score += 65;
        if (idLower.includes('equity') || textLower.includes('equity')) score -= 200;
        if (idLower.includes('available') || textLower.includes('available')) score -= 10;
      } else {
        // equity
        if (idLower === 'equity') score += 100;
        if (idLower.includes('equity')) score += 90;
        if (textLower.includes('equity')) score += 85;
        if (idLower === 'nav' || idLower.includes('netasset')) score += 80;
        if (textLower.includes('net asset') || textLower.includes('nav')) score += 80;
        if (idLower.includes('balance') || textLower.includes('balance')) score -= 40;
      }

      if (score > best.score) best = { score, value, id };
    }

    return best.value != null && best.score > 0 ? { value: best.value, id: best.id, score: best.score } : null;
  }

  findNumericByKeywords(mapped, columns, { include = [], exclude = [], prefer = [] } = {}) {
    const safeColumns = Array.isArray(columns) ? columns : [];
    const includeWords = include.map((w) => String(w).toLowerCase()).filter(Boolean);
    const excludeWords = exclude.map((w) => String(w).toLowerCase()).filter(Boolean);
    const preferWords = prefer.map((w) => String(w).toLowerCase()).filter(Boolean);

    let best = { score: -Infinity, value: null, id: null };

    for (const col of safeColumns) {
      const id = String(col?.id || '').trim();
      if (!id) continue;
      const raw = mapped?.[id];
      const value = parseNumberLoose(raw);
      if (value == null) continue;

      const idLower = id.toLowerCase();
      const hay = columnTextLower(col);

      if (includeWords.length > 0 && !includeWords.every((w) => hay.includes(w))) continue;
      if (
        excludeWords.length > 0 &&
        excludeWords.some((w) => {
          if (w === 'realized' && hay.includes('unrealized')) return false;
          return hay.includes(w);
        })
      ) {
        continue;
      }

      let score = 0;
      for (const w of includeWords) score += hay.includes(w) ? 10 : 0;
      for (const w of preferWords) score += hay.includes(w) ? 15 : 0;

      // Prefer exact-ish matches.
      if (preferWords.length > 0) {
        for (const w of preferWords) {
          if (idLower === w) score += 50;
          if (idLower === `${w}value`) score += 20;
        }
      }

      if (score > best.score) best = { score, value, id };
    }

    return best.value != null && best.score > 0 ? { value: best.value, id: best.id, score: best.score } : null;
  }

  async ensureConfig() {
    if (this.config) return this.config;
    const json = await this.apiJson('/trade/config', { includeAccNum: true });
    this.config = json;
    this.applyRateLimitConfig(json);
    return this.config;
  }

  async ensureInstruments(force = false) {
    if (force) {
      this.instruments = null;
      this.instrumentsByTradableId = new Map();
      this.instrumentsByNameLower = new Map();
      this.infoRouteCache = new Map();
    }
    if (Array.isArray(this.instruments) && this.instruments.length > 0) return this.instruments;
    if (!this.state.accountId) throw new Error('TradeLocker accountId not set. Select an account first.');
    const json = await this.withTransientRetry(
      () => this.apiJson(`/trade/accounts/${this.state.accountId}/instruments`, { includeAccNum: true }),
      { attempts: 3, baseDelayMs: 300, maxDelayMs: 2000 }
    );
    const list = Array.isArray(json?.d?.instruments) ? json.d.instruments : [];
    if (list.length === 0) {
      const fallback = Array.isArray(this.instruments) ? this.instruments : [];
      if (fallback.length > 0) return fallback;
      throw new Error('TradeLocker instruments unavailable.');
    }
    this.instruments = list;
    this.instrumentsByTradableId = new Map();
    this.instrumentsByNameLower = new Map();
    for (const inst of list) {
      const tid = inst?.tradableInstrumentId;
      if (Number.isFinite(Number(tid))) this.instrumentsByTradableId.set(Number(tid), inst);
      const names = [
        inst?.name,
        inst?.localizedName,
        inst?.symbol,
        inst?.ticker,
        inst?.instrument,
        inst?.displayName,
        inst?.tradingSymbol,
        inst?.tradableInstrumentName
      ];
      for (const raw of names) {
        const name = String(raw || '').trim();
        if (name) this.instrumentsByNameLower.set(name.toLowerCase(), inst);
      }
    }
    if (!this.instrumentDebugLogged) {
      const debugSettings = normalizeDebugSettings(this.state?.debug);
      if (debugSettings.enabled) {
        const matches = [];
        const seen = new Set();
        for (const inst of list) {
          const names = [
            inst?.name,
            inst?.localizedName,
            inst?.symbol,
            inst?.ticker,
            inst?.instrument,
            inst?.displayName,
            inst?.tradingSymbol,
            inst?.tradableInstrumentName
          ]
            .map((v) => String(v || '').trim())
            .filter(Boolean);
          const hay = names.join(' ').toLowerCase();
          if (!hay.includes('xau')) continue;
          const tid = Number(inst?.tradableInstrumentId);
          const key = Number.isFinite(tid) ? `id:${tid}` : `name:${names[0] || ''}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const summary = summarizeInstrument(inst);
          if (summary && Array.isArray(summary.routes)) {
            summary.routes = summary.routes.map((route) => `${route?.id ?? ''}:${route?.type ?? ''}`);
          }
          matches.push(summary);
        }
        appendQuoteDebugLine({
          at: new Date().toISOString(),
          atMs: nowMs(),
          type: 'instrument_match',
          env: this.state.env,
          server: this.state.server || null,
          accountId: this.state.accountId ?? null,
          accNum: this.state.accNum ?? null,
          query: 'xau',
          matchCount: matches.length,
          matches: matches.slice(0, 50)
        }, debugSettings);
      }
      this.instrumentDebugLogged = true;
    }
    return this.instruments;
  }

  async searchInstruments(opts) {
    const query = String(opts?.query || '').trim();
    const limitRaw = opts?.limit == null ? 12 : Number(opts.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 12;

    if (!query) return { ok: true, results: [] };

    try {
      await this.ensureInstruments();
    } catch (e) {
      const msg = redactErrorMessage(e?.message || String(e));
      return { ok: false, error: msg, results: [] };
    }

    const list = Array.isArray(this.instruments) ? this.instruments : [];
    const candidates = [];
    const seen = new Set();

    for (const inst of list) {
      const score = scoreInstrumentMatch(inst, query);
      if (score <= 0) continue;
      const tradableInstrumentId = Number(inst?.tradableInstrumentId);
      const symbol = String(inst?.name || '').trim();
      if (!symbol) continue;

      const key = Number.isFinite(tradableInstrumentId) ? `id:${tradableInstrumentId}` : `sym:${symbol.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      candidates.push({
        score,
        tradableInstrumentId: Number.isFinite(tradableInstrumentId) ? tradableInstrumentId : null,
        symbol,
        displayName: String(inst?.localizedName || '').trim() || null
      });
    }

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.symbol).localeCompare(String(b.symbol));
    });

    return { ok: true, results: candidates.slice(0, limit) };
  }

  async getAccountState() {
    if (!this.state.accountId) throw new Error('TradeLocker accountId not set. Select an account first.');
    const [config, json] = await Promise.all([
      this.ensureConfig(),
      this.apiJson(`/trade/accounts/${this.state.accountId}/state`, { includeAccNum: true })
    ]);
    const columns = config?.d?.accountDetailsConfig?.columns || [];
    const row = Array.isArray(json?.d?.accountDetailsData) ? json.d.accountDetailsData : [];
    const mapped = mapRowToObject(row, columns);

    const mappedBalanceCandidate =
      this.findBestNumericField(mapped, columns, 'balance')?.value ??
      parseNumberLoose(pickFirst(mapped, ['balance', 'accountBalance', 'aaccountBalance', 'cash', 'cashBalance']));

    const mappedEquityCandidate =
      this.findBestNumericField(mapped, columns, 'equity')?.value ??
      parseNumberLoose(pickFirst(mapped, ['equity', 'accountEquity', 'netAssetValue', 'nav']));

    let balance = mappedBalanceCandidate ?? null;
    let equity = mappedEquityCandidate ?? null;

    // Fallback: /auth/jwt/all-accounts sometimes contains the most reliable account balance.
    try {
      const accounts = await this.ensureAllAccountsCache(60_000);
      const activeAccountId = parseAccountIdentifier(this.state.accountId);
      const activeAccNum = parseAccountIdentifier(this.state.accNum);
      const selected = accounts.find((a) => {
        const aId = readAccountIdFromEntry(a);
        const aAccNum = readAccNumFromEntry(a);
        if (activeAccountId != null && aId != null && aId === activeAccountId) return true;
        if (activeAccNum != null && aAccNum != null && aAccNum === activeAccNum) return true;
        return false;
      });
      const fallbackBalance = parseNumberLoose(selected?.aaccountBalance ?? selected?.accountBalance ?? selected?.balance);
      if (fallbackBalance != null && fallbackBalance > 0) {
        if (balance == null || balance <= 0) {
          balance = fallbackBalance;
        } else {
          const diff = Math.abs(balance - fallbackBalance);
          if (diff > Math.max(1, fallbackBalance * 0.001)) {
            balance = fallbackBalance;
          }
        }
      }
    } catch {
      // ignore fallback errors
    }

    if (equity == null || equity <= 0) equity = balance;

    return { ok: true, mapped, balance: balance ?? 0, equity: equity ?? balance ?? 0 };
  }

  async getPositions() {
    if (!this.state.accountId) throw new Error('TradeLocker accountId not set. Select an account first.');
    const [config, _instrumentsLoaded, json] = await Promise.all([
      this.ensureConfig(),
      this.ensureInstruments().catch(() => null),
      this.apiJson(`/trade/accounts/${this.state.accountId}/positions`, { includeAccNum: true })
    ]);
    const columns = config?.d?.positionsConfig?.columns || [];
    const rows = Array.isArray(json?.d?.positions) ? json.d.positions : [];

    const positions = rows.map((row) => {
      const mapped = mapRowToObject(row, columns);

      const rawPositionId = pickFirst(mapped, ['positionId', 'id']);
      const positionId = rawPositionId != null ? String(rawPositionId) : String(Math.random());

      const tradableInstrumentId =
        parseNumberLoose(
          pickFirst(mapped, [
            'tradableInstrumentId',
            'tradableInstrumentID',
            'tradableId',
            'tradableID',
            'instrumentId',
            'instrumentID'
          ])
        ) ?? null;
      const instrument = tradableInstrumentId != null ? this.instrumentsByTradableId.get(Number(tradableInstrumentId)) : null;

      const symbol =
        String(
          pickFirst(mapped, ['symbol', 'instrument', 'instrumentName', 'tradableInstrumentName', 'name', 'localizedName']) ||
            instrument?.name ||
            instrument?.localizedName ||
            'UNKNOWN'
        );

      const side = toUpperSide(pickFirst(mapped, ['side', 'type', 'direction']) || 'BUY');
      const entryPrice = parseNumberLoose(pickFirst(mapped, ['openPrice', 'entryPrice', 'price', 'avgPrice'])) ?? 0;
      const size = parseNumberLoose(pickFirst(mapped, ['qty', 'quantity', 'volume', 'lots'])) ?? 0;
      const stopLoss =
        parseNumberLoose(pickFirst(mapped, ['stopLoss', 'sl', 'stop', 'stopPrice', 'slPrice', 'stopLossPrice'])) ?? null;
      const takeProfit =
        parseNumberLoose(pickFirst(mapped, ['takeProfit', 'tp', 'take', 'takePrice', 'tpPrice', 'takeProfitPrice'])) ?? null;
      const currentPriceCandidate =
        parseNumberLoose(
          pickFirst(mapped, [
            'currentPrice',
            'marketPrice',
            'closePrice',
            'lastPrice',
            'markPrice',
            'bid',
            'ask',
            'priceCurrent',
            'priceNow'
          ])
        ) ??
        this.findNumericByKeywords(mapped, columns, {
          include: ['price'],
          exclude: ['open', 'entry', 'avg', 'limit', 'stop', 'take', 'tp', 'sl'],
          prefer: ['current', 'market', 'close', 'last', 'mark']
        })?.value ??
        null;
      const currentPrice = currentPriceCandidate != null ? Number(currentPriceCandidate) : 0;
      const pnlCandidate =
        parseNumberLoose(
          pickFirst(mapped, [
            'pnl',
            'pAndL',
            'pl',
            'p/l',
            'profit',
            'profitLoss',
            'profitloss',
            'floatingPnl',
            'floatingProfit',
            'unrealizedPl',
            'unrealizedPL',
            'unrealizedPnl',
            'unrealizedProfit',
            'pnlUnrealized'
          ])
        ) ??
        this.findNumericByKeywords(mapped, columns, {
          include: ['pnl'],
          exclude: ['realized', 'closed', 'swap', 'commission', 'fee'],
          prefer: ['floating', 'unrealized', 'profit', 'pnl']
        })?.value ??
        this.findNumericByKeywords(mapped, columns, {
          include: ['p&l'],
          exclude: ['realized', 'closed', 'swap', 'commission', 'fee'],
          prefer: ['floating', 'unrealized', 'profit']
        })?.value ??
        this.findNumericByKeywords(mapped, columns, {
          include: ['p/l'],
          exclude: ['realized', 'closed', 'swap', 'commission', 'fee'],
          prefer: ['floating', 'unrealized', 'profit']
        })?.value ??
        this.findNumericByKeywords(mapped, columns, {
          include: ['profit'],
          exclude: ['realized', 'closed', 'swap', 'commission', 'fee'],
          prefer: ['floating', 'unrealized', 'pnl']
        })?.value ??
        this.findNumericByKeywords(mapped, columns, {
          include: ['unrealized'],
          exclude: ['realized', 'closed'],
          prefer: ['pnl', 'profit']
        })?.value ??
        null;

      let pnl = pnlCandidate != null && Number.isFinite(Number(pnlCandidate)) ? Number(pnlCandidate) : null;
      if ((pnl == null || Math.abs(pnl) < 1e-9) && currentPrice > 0 && entryPrice > 0 && size !== 0) {
        const dir = side === 'SELL' ? -1 : 1;
        const computed = (currentPrice - entryPrice) * size * dir;
        pnl = Number.isFinite(computed) ? computed : pnl;
      }
      if (pnl == null || !Number.isFinite(Number(pnl))) pnl = 0;
      const openTime =
        parseDateLoose(pickFirst(mapped, ['openTime', 'openDate', 'createdAt', 'created'])) || new Date();

      const strategyIdRaw = pickFirst(mapped, ['strategyId', 'strategyID', 'strategy', 'tag', 'clientTag']);
      const strategyId = strategyIdRaw != null ? String(strategyIdRaw).slice(0, 64) : null;

      return {
        id: positionId,
        symbol,
        type: side,
        entryPrice,
        size,
        stopLoss,
        takeProfit,
        openTime: openTime.toISOString(),
        strategyId,
        pnl,
        status: 'OPEN'
      };
    });

    const instrumentsCount = Array.isArray(this.instruments) ? this.instruments.length : 0;
    return { ok: true, positions, instrumentsCount };
  }

  async getOrders() {
    if (!this.state.accountId) throw new Error('TradeLocker accountId not set. Select an account first.');
    try {
      const [config, _instrumentsLoaded, json] = await Promise.all([
        this.ensureConfig(),
        this.ensureInstruments().catch(() => null),
        this.apiJson(`/trade/accounts/${this.state.accountId}/orders`, { includeAccNum: true })
      ]);
      const columns = config?.d?.ordersConfig?.columns || [];
      const rows = Array.isArray(json?.d?.orders) ? json.d.orders : [];

      const orders = rows.map((row) => {
        const mapped = mapRowToObject(row, columns);

        const rawOrderId = pickFirst(mapped, ['orderId', 'id', 'orderID', 'clientOrderId', 'clientOrderID']);
        const orderId = rawOrderId != null ? String(rawOrderId) : String(Math.random());

        const tradableInstrumentId =
          parseNumberLoose(
            pickFirst(mapped, [
              'tradableInstrumentId',
              'tradableInstrumentID',
              'tradableId',
              'tradableID',
              'instrumentId',
              'instrumentID'
            ])
          ) ?? null;
        const instrument = tradableInstrumentId != null ? this.instrumentsByTradableId.get(Number(tradableInstrumentId)) : null;

        const symbol =
          String(
            pickFirst(mapped, ['symbol', 'instrument', 'instrumentName', 'tradableInstrumentName', 'name', 'localizedName']) ||
              instrument?.name ||
              instrument?.localizedName ||
              'UNKNOWN'
          );

        const side = toUpperSide(pickFirst(mapped, ['side', 'direction', 'action', 'buySell']) || 'BUY');
        const orderTypeRaw = String(pickFirst(mapped, ['type', 'orderType', 'kind', 'orderKind']) || '').trim().toLowerCase();
        let orderType = 'market';
        if (orderTypeRaw.includes('limit')) orderType = 'limit';
        else if (orderTypeRaw.includes('stop')) orderType = 'stop';

        const qty = parseNumberLoose(pickFirst(mapped, ['qty', 'quantity', 'volume', 'lots'])) ?? 0;
        const price =
          parseNumberLoose(
            pickFirst(mapped, [
              'price',
              'limitPrice',
              'orderPrice',
              'stopPrice',
              'stopLevel',
              'triggerPrice',
              'triggerLevel',
              'activationPrice'
            ])
          ) ?? 0;
        const stopLoss = parseNumberLoose(pickFirst(mapped, ['stopLoss', 'sl', 'slPrice'])) ?? 0;
        const takeProfit = parseNumberLoose(pickFirst(mapped, ['takeProfit', 'tp', 'tpPrice'])) ?? 0;
        const status = String(pickFirst(mapped, ['status', 'state', 'orderStatus']) || 'OPEN');
        const createdAt =
          parseDateLoose(pickFirst(mapped, ['createdAt', 'created', 'createTime', 'time', 'openTime'])) || new Date();

        const filledQty = parseNumberLoose(pickFirst(mapped, ['filledQty', 'filledQuantity', 'filled'])) ?? null;
        const remainingQty = parseNumberLoose(pickFirst(mapped, ['remainingQty', 'remainingQuantity', 'remaining'])) ?? null;

        const strategyIdRaw = pickFirst(mapped, ['strategyId', 'strategyID', 'strategy', 'tag', 'clientTag']);
        const strategyId = strategyIdRaw != null ? String(strategyIdRaw).slice(0, 64) : null;

        return {
          id: orderId,
          symbol,
          side,
          type: orderType,
          qty,
          price,
          stopLoss,
          takeProfit,
          status,
          createdAt: createdAt.toISOString(),
          strategyId,
          filledQty,
          remainingQty,
          raw: mapped
        };
      });

      return { ok: true, orders };
    } catch (e) {
      const status = typeof e?.status === 'number' ? e.status : null;
      const msg = redactErrorMessage(e?.message || String(e));
      this.lastError = msg;
      if (status === 429) {
        return { ok: false, error: msg, orders: [], rateLimited: true, retryAtMs: this.rateLimitedUntilMs || 0 };
      }
      return { ok: false, error: msg, orders: [] };
    }
  }

  async getOrdersHistory() {
    if (!this.state.accountId) throw new Error('TradeLocker accountId not set. Select an account first.');
    try {
      const [config, _instrumentsLoaded, json] = await Promise.all([
        this.ensureConfig(),
        this.ensureInstruments().catch(() => null),
        this.apiJson(`/trade/accounts/${this.state.accountId}/ordersHistory`, { includeAccNum: true })
      ]);
      const columns = config?.d?.ordersHistoryConfig?.columns || config?.d?.ordersConfig?.columns || [];
      const rows = Array.isArray(json?.d?.ordersHistory)
        ? json.d.ordersHistory
        : Array.isArray(json?.d?.orders)
          ? json.d.orders
          : Array.isArray(json?.d)
            ? json.d
            : [];

      const orders = rows.map((row) => {
        const mapped = mapRowToObject(row, columns);

        const rawOrderId = pickFirst(mapped, ['orderId', 'id', 'orderID', 'clientOrderId', 'clientOrderID']);
        const orderId = rawOrderId != null ? String(rawOrderId) : String(Math.random());

        const tradableInstrumentId =
          parseNumberLoose(
            pickFirst(mapped, [
              'tradableInstrumentId',
              'tradableInstrumentID',
              'tradableId',
              'tradableID',
              'instrumentId',
              'instrumentID'
            ])
          ) ?? null;
        const instrument = tradableInstrumentId != null ? this.instrumentsByTradableId.get(Number(tradableInstrumentId)) : null;

        const symbol =
          String(
            pickFirst(mapped, ['symbol', 'instrument', 'instrumentName', 'tradableInstrumentName', 'name', 'localizedName']) ||
              instrument?.name ||
              instrument?.localizedName ||
              'UNKNOWN'
          );

        const side = toUpperSide(pickFirst(mapped, ['side', 'direction', 'action', 'buySell']) || 'BUY');
        const orderTypeRaw = String(pickFirst(mapped, ['type', 'orderType', 'kind', 'orderKind']) || '').trim().toLowerCase();
        let orderType = 'market';
        if (orderTypeRaw.includes('limit')) orderType = 'limit';
        else if (orderTypeRaw.includes('stop')) orderType = 'stop';

        const qty = parseNumberLoose(pickFirst(mapped, ['qty', 'quantity', 'volume', 'lots'])) ?? 0;
        const price =
          parseNumberLoose(
            pickFirst(mapped, [
              'price',
              'limitPrice',
              'orderPrice',
              'avgPrice',
              'averagePrice',
              'fillPrice',
              'filledPrice'
            ])
          ) ?? 0;
        const stopPrice =
          parseNumberLoose(
            pickFirst(mapped, [
              'stopPrice',
              'stopLevel',
              'triggerPrice',
              'triggerLevel',
              'activationPrice'
            ])
          ) ?? null;
        const stopLoss = parseNumberLoose(pickFirst(mapped, ['stopLoss', 'sl', 'slPrice'])) ?? 0;
        const takeProfit = parseNumberLoose(pickFirst(mapped, ['takeProfit', 'tp', 'tpPrice'])) ?? 0;
        const status = String(pickFirst(mapped, ['status', 'state', 'orderStatus']) || 'OPEN');
        const createdAt =
          parseDateLoose(pickFirst(mapped, ['createdAt', 'created', 'createTime', 'time', 'openTime'])) || new Date();
        const filledAt =
          parseDateLoose(pickFirst(mapped, ['filledAt', 'filledTime', 'executionTime', 'fillTime', 'closeTime'])) || null;
        const closedAt =
          parseDateLoose(pickFirst(mapped, ['closedAt', 'closeTime', 'closedTime', 'timeClosed'])) || null;

        const filledQty = parseNumberLoose(pickFirst(mapped, ['filledQty', 'filledQuantity', 'filled'])) ?? null;
        const remainingQty = parseNumberLoose(pickFirst(mapped, ['remainingQty', 'remainingQuantity', 'remaining'])) ?? null;

        const strategyIdRaw = pickFirst(mapped, ['strategyId', 'strategyID', 'strategy', 'tag', 'clientTag']);
        const strategyId = strategyIdRaw != null ? String(strategyIdRaw).slice(0, 64) : null;

        return {
          id: orderId,
          symbol,
          side,
          type: orderType,
          qty,
          price,
          stopPrice,
          stopLoss,
          takeProfit,
          status,
          createdAt: createdAt.toISOString(),
          filledAt: filledAt ? filledAt.toISOString() : null,
          closedAt: closedAt ? closedAt.toISOString() : null,
          strategyId,
          filledQty,
          remainingQty,
          raw: mapped
        };
      });

      return { ok: true, orders };
    } catch (e) {
      const status = typeof e?.status === 'number' ? e.status : null;
      const msg = redactErrorMessage(e?.message || String(e));
      this.lastError = msg;
      if (status === 429) {
        return { ok: false, error: msg, orders: [], rateLimited: true, retryAtMs: this.rateLimitedUntilMs || 0 };
      }
      return { ok: false, error: msg, orders: [] };
    }
  }

  async getOrderDetails({ orderId }) {
    if (!this.state.accountId) throw new Error('TradeLocker accountId not set. Select an account first.');
    const idNum = parseNumberLoose(orderId);
    const id = idNum != null ? String(idNum) : String(orderId || '').trim();
    if (!id) return { ok: false, error: 'orderId is required.' };

    try {
      const ordersRes = await this.getOrders().catch((e) => ({
        ok: false,
        error: redactErrorMessage(e?.message || String(e)),
        orders: []
      }));

      if (!ordersRes?.ok) {
        const err = ordersRes?.error ? String(ordersRes.error) : 'Failed to fetch orders.';
        if (ordersRes?.rateLimited) {
          return { ok: false, error: err, rateLimited: true, retryAtMs: ordersRes?.retryAtMs || 0 };
        }
        return { ok: false, error: err };
      }

      const orders = Array.isArray(ordersRes.orders) ? ordersRes.orders : [];
      const match = orders.find((ord) => String(ord?.id || '') === id);
      if (!match) {
        return { ok: false, error: 'Order not found in non-final orders.' };
      }

      return {
        ok: true,
        orderId: String(match.id || id),
        symbol: String(match.symbol || 'UNKNOWN'),
        side: toUpperSide(match.type || match.side || 'BUY'),
        type: String(match.orderType || '').trim() || 'market',
        qty: Number(match.qty) || 0,
        price: Number(match.price) || 0,
        stopLoss: Number(match.stopLoss) || 0,
        takeProfit: Number(match.takeProfit) || 0,
        status: String(match.status || 'OPEN'),
        createdAt: match.createdAt || new Date().toISOString(),
        strategyId: match.strategyId != null ? String(match.strategyId).slice(0, 64) : null,
        filledQty: match.filledQty != null && Number.isFinite(Number(match.filledQty)) ? Number(match.filledQty) : null,
        remainingQty: match.remainingQty != null && Number.isFinite(Number(match.remainingQty)) ? Number(match.remainingQty) : null,
        rejectReason: match.rejectReason != null ? String(match.rejectReason) : null,
        raw: match.raw ?? match
      };
    } catch (e) {
      const status = typeof e?.status === 'number' ? e.status : null;
      const msg = redactErrorMessage(e?.message || String(e));
      this.lastError = msg;
      if (status === 429) {
        return { ok: false, error: msg, rateLimited: true, retryAtMs: this.rateLimitedUntilMs || 0 };
      }
      return { ok: false, error: msg };
    }
  }

  async getPositionDetails({ positionId }) {
    if (!this.state.accountId) throw new Error('TradeLocker accountId not set. Select an account first.');
    const id = String(positionId || '').trim();
    if (!id) return { ok: false, error: 'positionId is required.' };

    try {
      const res = await this.getPositions();
      const list = Array.isArray(res?.positions) ? res.positions : [];
      const match = list.find((p) => String(p?.id || '').trim() === id) || null;
      if (!match) {
        return { ok: false, error: 'Position not found.' };
      }
      return {
        ok: true,
        positionId: id,
        symbol: String(match?.symbol || 'UNKNOWN'),
        side: String(match?.type || 'BUY'),
        entryPrice: Number(match?.entryPrice) || 0,
        size: Number(match?.size) || 0,
        stopLoss: parseNumberLoose(match?.stopLoss) ?? null,
        takeProfit: parseNumberLoose(match?.takeProfit) ?? null,
        openTime: match?.openTime ?? null,
        raw: match
      };
    } catch (e) {
      const status = typeof e?.status === 'number' ? e.status : null;
      const msg = redactErrorMessage(e?.message || String(e));
      this.lastError = msg;
      if (status === 429) {
        return { ok: false, error: msg, rateLimited: true, retryAtMs: this.rateLimitedUntilMs || 0 };
      }
      return { ok: false, error: msg };
    }
  }

  async cancelOrder({ orderId }) {
    if (!this.state.tradingEnabled) return { ok: false, error: 'Trading is disabled in Settings.' };
    const id = parseNumberLoose(orderId);
    if (id == null || id <= 0) return { ok: false, error: 'orderId is required.' };

    try {
      const json = await this.apiJson(`/trade/orders/${encodeURIComponent(String(id))}`, {
        method: 'DELETE',
        includeAccNum: true
      });
      return { ok: true, response: json };
    } catch (e) {
      const msg = redactErrorMessage(e?.message || String(e));
      this.lastError = msg;
      return { ok: false, error: msg };
    }
  }

  async modifyOrder({ orderId, price, qty, stopLoss, takeProfit, strategyId } = {}) {
    if (!this.state.tradingEnabled) return { ok: false, error: 'Trading is disabled in Settings.' };
    if (!this.state.accountId) return { ok: false, error: 'TradeLocker accountId not set. Select an account first.' };
    const idNum = parseNumberLoose(orderId);
    const id = idNum != null ? String(idNum) : String(orderId || '').trim();
    if (!id) return { ok: false, error: 'orderId is required.' };

    let orderInfo = null;
    try {
      orderInfo = await this.getOrderDetails({ orderId: id });
    } catch {
      orderInfo = null;
    }

    const patch = {};
    const normalizeOptionalPositive = (value, label) => {
      if (value === undefined || value === null || value === '') return { ok: true, set: false };
      const num = parseNumberLoose(value);
      if (num == null || !Number.isFinite(num) || num <= 0) {
        return { ok: false, error: `${label} must be a positive number.` };
      }
      return { ok: true, value: num, set: true };
    };

    const normalizePatchNumber = (value, label) => {
      if (value === null) return { ok: true, value: null, set: true };
      if (value === undefined) return { ok: true, set: false };
      const num = parseNumberLoose(value);
      if (num == null || !Number.isFinite(num) || num <= 0) {
        return { ok: false, error: `${label} must be a positive number or null.` };
      }
      return { ok: true, value: num, set: true };
    };

    const priceRes = normalizeOptionalPositive(price, 'price');
    if (!priceRes.ok) return { ok: false, error: priceRes.error };
    const qtyRes = normalizeOptionalPositive(qty, 'qty');
    if (!qtyRes.ok) return { ok: false, error: qtyRes.error };
    const sl = normalizePatchNumber(stopLoss, 'stopLoss');
    if (!sl.ok) return { ok: false, error: sl.error };
    const tp = normalizePatchNumber(takeProfit, 'takeProfit');
    if (!tp.ok) return { ok: false, error: tp.error };

    if (priceRes.set) patch.price = priceRes.value;
    if (qtyRes.set) patch.qty = qtyRes.value;
    if (sl.set) patch.stopLoss = sl.value;
    if (tp.set) patch.takeProfit = tp.value;

    if (orderInfo?.ok) {
      const existingStopLoss = parseNumberLoose(orderInfo?.stopLoss);
      const existingTakeProfit = parseNumberLoose(orderInfo?.takeProfit);
      if (!sl.set && tp.set && existingStopLoss != null && existingStopLoss > 0) {
        patch.stopLoss = existingStopLoss;
      }
      if (!tp.set && sl.set && existingTakeProfit != null && existingTakeProfit > 0) {
        patch.takeProfit = existingTakeProfit;
      }
    }

    if (Object.keys(patch).length === 0) {
      return { ok: false, error: 'No modifications provided.' };
    }

    if (orderInfo?.ok && orderInfo?.symbol) {
      const orderSymbol = String(orderInfo.symbol || '').trim();
      const inst = orderSymbol ? this.resolveInstrumentForSymbol(orderSymbol) : null;
      if (inst) {
        const constraints = await this.resolveInstrumentConstraints(inst);
        const stopLossValue = sl.set ? sl.value : undefined;
        const takeProfitValue = tp.set ? tp.value : undefined;
        if ((stopLossValue != null || takeProfitValue != null) && constraints?.minStopDistance != null) {
          const quoteRes = await this.getQuote({ symbol: orderSymbol, tradableInstrumentId: inst?.tradableInstrumentId, maxAgeMs: 1500 });
          const q = quoteRes?.quote || {};
          const refPrice = priceRes.set
            ? priceRes.value
            : (parseNumberLoose(orderInfo?.price) || q.mid || q.last || q.bid || q.ask || null);
          const stopErr = validateStopDistances({
            stopLoss: stopLossValue,
            takeProfit: takeProfitValue,
            refPrice,
            minStopDistance: constraints.minStopDistance
          });
          if (stopErr) {
            return {
              ok: false,
              error: stopErr,
              minStopDistance: constraints.minStopDistance,
              refPrice
            };
          }
        }
      }
    }

    const qs = strategyId ? `?strategyId=${encodeURIComponent(String(strategyId))}` : '';

    try {
      const json = await this.apiJson(`/trade/orders/${encodeURIComponent(String(id))}${qs}`, {
        method: 'PATCH',
        includeAccNum: true,
        body: patch
      });
      return { ok: true, response: json };
    } catch (e) {
      const msg = redactErrorMessage(e?.message || String(e));
      this.lastError = msg;
      return { ok: false, error: msg };
    }
  }

  async modifyPosition({ positionId, stopLoss, takeProfit, trailingOffset, strategyId } = {}) {
    if (!this.state.tradingEnabled) return { ok: false, error: 'Trading is disabled in Settings.' };
    if (!this.state.accountId) return { ok: false, error: 'TradeLocker accountId not set. Select an account first.' };
    const id = String(positionId || '').trim();
    if (!id) return { ok: false, error: 'positionId is required.' };

    let positionInfo = null;
    try {
      positionInfo = await this.getPositionDetails({ positionId: id });
    } catch {
      positionInfo = null;
    }

    const patch = {};
    const normalizePatchNumber = (value, label) => {
      if (value === null) return { ok: true, value: null, set: true };
      if (value === undefined) return { ok: true, set: false };
      const num = parseNumberLoose(value);
      if (num == null || !Number.isFinite(num) || num <= 0) {
        return { ok: false, error: `${label} must be a positive number or null.` };
      }
      return { ok: true, value: num, set: true };
    };

    const sl = normalizePatchNumber(stopLoss, 'stopLoss');
    if (!sl.ok) return { ok: false, error: sl.error };
    const tp = normalizePatchNumber(takeProfit, 'takeProfit');
    if (!tp.ok) return { ok: false, error: tp.error };
    const trail = normalizePatchNumber(trailingOffset, 'trailingOffset');
    if (!trail.ok) return { ok: false, error: trail.error };

    if (sl.set) patch.stopLoss = sl.value;
    if (tp.set) patch.takeProfit = tp.value;
    if (trail.set) patch.trailingOffset = trail.value;

    if (positionInfo?.ok) {
      const existingStopLoss = parseNumberLoose(positionInfo?.stopLoss);
      const existingTakeProfit = parseNumberLoose(positionInfo?.takeProfit);
      if (!sl.set && (tp.set || trail.set) && existingStopLoss != null && existingStopLoss > 0) {
        patch.stopLoss = existingStopLoss;
      }
      if (!tp.set && (sl.set || trail.set) && existingTakeProfit != null && existingTakeProfit > 0) {
        patch.takeProfit = existingTakeProfit;
      }
    }

    if (Object.keys(patch).length === 0) {
      return { ok: false, error: 'No modifications provided.' };
    }

    if (positionInfo?.ok && positionInfo?.symbol) {
      const posSymbol = String(positionInfo.symbol || '').trim();
      const inst = posSymbol ? this.resolveInstrumentForSymbol(posSymbol) : null;
      if (inst) {
        const constraints = await this.resolveInstrumentConstraints(inst);
        if (constraints?.sessionOpen === false) {
          return { ok: false, error: 'Market session is closed for this instrument.' };
        }

        const stopLossValue = sl.set ? sl.value : undefined;
        const takeProfitValue = tp.set ? tp.value : undefined;
        if ((stopLossValue != null || takeProfitValue != null) && constraints?.minStopDistance != null) {
          const quoteRes = await this.getQuote({ symbol: posSymbol, tradableInstrumentId: inst?.tradableInstrumentId, maxAgeMs: 1500 });
          const q = quoteRes?.quote || {};
          const refPrice = q.mid ?? q.last ?? q.bid ?? q.ask ?? positionInfo?.entryPrice ?? null;
          const stopErr = validateStopDistances({
            stopLoss: stopLossValue,
            takeProfit: takeProfitValue,
            refPrice,
            minStopDistance: constraints.minStopDistance
          });
          if (stopErr) {
            return {
              ok: false,
              error: stopErr,
              minStopDistance: constraints.minStopDistance,
              refPrice
            };
          }
        }
      }
    }

    const qs = strategyId ? `?strategyId=${encodeURIComponent(String(strategyId))}` : '';

    try {
      const json = await this.apiJson(`/trade/positions/${encodeURIComponent(id)}${qs}`, {
        method: 'PATCH',
        includeAccNum: true,
        body: patch
      });
      return { ok: true, response: json };
    } catch (e) {
      const msg = redactErrorMessage(e?.message || String(e));
      this.lastError = msg;
      return { ok: false, error: msg };
    }
  }

  async closePosition({ positionId, qty = 0 }) {
    if (!this.state.tradingEnabled) return { ok: false, error: 'Trading is disabled in Settings.' };
    if (!positionId) return { ok: false, error: 'positionId is required.' };

    const q = parseNumberLoose(qty);
    const qtyParam = q != null ? q : 0;

    try {
      const qs = `?qty=${encodeURIComponent(String(qtyParam))}`;
      const json = await this.apiJson(`/trade/positions/${encodeURIComponent(String(positionId))}${qs}`, {
        method: 'DELETE',
        includeAccNum: true
      });
      return { ok: true, response: json };
    } catch (e) {
      const msg = redactErrorMessage(e?.message || String(e));
      this.lastError = msg;
      return { ok: false, error: msg };
    }
  }

  resolveInstrumentForSymbol(symbol) {
    const candidates = extractSymbolCandidates(symbol);
    if (candidates.length === 0) return null;

    for (const cand of candidates) {
      const direct = this.instrumentsByNameLower.get(String(cand).toLowerCase());
      if (direct) return direct;
    }

    // Collapsed matching + suffix matching for broker/exchange prefixes (e.g., OANDA:XAUUSD).
    for (const cand of candidates) {
      const collapsed = collapseSearchKey(cand);
      if (!collapsed) continue;

      let best = null;
      let bestLen = 0;
      for (const [nameLower, inst] of this.instrumentsByNameLower.entries()) {
        const collapsedName = collapseSearchKey(nameLower);
        if (!collapsedName) continue;
        if (collapsedName === collapsed) return inst;
        if (collapsed.endsWith(collapsedName) && collapsedName.length >= 4 && collapsedName.length > bestLen) {
          best = inst;
          bestLen = collapsedName.length;
        }
        // Also handle broker suffixes (e.g., XAUUSD -> XAUUSD.R).
        if (collapsedName.startsWith(collapsed) && collapsed.length >= 4 && collapsedName.length > bestLen) {
          best = inst;
          bestLen = collapsedName.length;
        }
      }
      if (best) return best;
    }

    // Fuzzy fallback: pick the highest-scoring instrument (only if clearly unambiguous).
    const list = Array.isArray(this.instruments) ? this.instruments : [];
    let best = null;
    let second = null;

    for (const q of candidates) {
      const qCollapsed = collapseSearchKey(q);
      if (qCollapsed.length < 4) continue;
      for (const inst of list) {
        const score = scoreInstrumentMatch(inst, q);
        if (score <= 0) continue;
        if (!best || score > best.score) {
          second = best;
          best = { inst, score, q };
        } else if ((!second || score > second.score) && (!best || inst !== best.inst)) {
          second = { inst, score, q };
        }
      }
    }

    if (best && best.inst) {
      const bestScore = Number(best.score) || 0;
      const secondScore = second ? (Number(second.score) || 0) : 0;
      const gap = bestScore - secondScore;
      // Require a strong match and a clear separation from the runner-up.
      if (bestScore >= 900 && (gap >= 120 || !second)) {
        return best.inst;
      }
    }

    return null;
  }

  getRouteIdsByType(inst, routeType) {
    const routes = Array.isArray(inst?.routes) ? inst.routes : [];
    const target = String(routeType || '').toUpperCase();
    const ids = [];
    for (const route of routes) {
      const type = String(route?.type || '').toUpperCase();
      if (type !== target) continue;
      const id = parseNumberLoose(route?.id);
      if (id == null) continue;
      ids.push(Number(id));
    }
    return ids;
  }

  getInfoRouteCandidates(inst, fallbackRouteId) {
    const routes = Array.isArray(inst?.routes) ? inst.routes : [];
    const infoTypes = new Set(['INFO', 'QUOTE', 'PRICE', 'PRICES', 'DATA', 'MARKET']);
    const tradeTypes = new Set(['TRADE']);
    const infoRoutes = [];
    const tradeRoutes = [];
    const pushRoute = (list, id) => {
      const num = parseNumberLoose(id);
      if (num == null) return;
      list.push(Number(num));
    };

    for (const route of routes) {
      const type = String(route?.type || '').toUpperCase();
      const id = parseNumberLoose(route?.id);
      if (id == null) continue;
      if (infoTypes.has(type)) infoRoutes.push(Number(id));
      if (tradeTypes.has(type)) tradeRoutes.push(Number(id));
    }

    const candidates = [];
    const seen = new Set();
    const push = (id) => {
      if (id == null) return;
      const num = Number(id);
      if (!Number.isFinite(num)) return;
      const key = String(num);
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(num);
    };

    if (fallbackRouteId != null) push(fallbackRouteId);
    if (inst && typeof inst === 'object') {
      const routeFields = [
        'infoRouteId', 'infoRouteID', 'quoteRouteId', 'quoteRouteID', 'priceRouteId', 'priceRouteID',
        'marketRouteId', 'marketRouteID', 'marketDataRouteId', 'marketDataRouteID', 'dataRouteId', 'dataRouteID'
      ];
      for (const key of routeFields) {
        if (inst[key] != null) push(inst[key]);
      }
      const tradeFields = ['routeId', 'routeID', 'tradeRouteId', 'tradeRouteID', 'executionRouteId', 'executionRouteID'];
      for (const key of tradeFields) {
        if (inst[key] != null) push(inst[key]);
      }
      const routeMap = inst?.routesByType || inst?.routeByType || inst?.routeMap || inst?.routeIds || null;
      if (routeMap && typeof routeMap === 'object') {
        for (const [key, value] of Object.entries(routeMap)) {
          const type = String(key || '').toUpperCase();
          if (!value) continue;
          if (infoTypes.has(type) || type.includes('INFO') || type.includes('QUOTE') || type.includes('PRICE') || type.includes('DATA') || type.includes('MARKET')) {
            pushRoute(infoRoutes, value?.id ?? value);
            continue;
          }
          if (tradeTypes.has(type) || type.includes('TRADE')) {
            pushRoute(tradeRoutes, value?.id ?? value);
          }
        }
      }
      if (inst.routes && !Array.isArray(inst.routes) && typeof inst.routes === 'object') {
        for (const [key, value] of Object.entries(inst.routes)) {
          const type = String(key || '').toUpperCase();
          if (!value) continue;
          if (infoTypes.has(type) || type.includes('INFO') || type.includes('QUOTE') || type.includes('PRICE') || type.includes('DATA') || type.includes('MARKET')) {
            pushRoute(infoRoutes, value?.id ?? value);
            continue;
          }
          if (tradeTypes.has(type) || type.includes('TRADE')) {
            pushRoute(tradeRoutes, value?.id ?? value);
          }
        }
      }
    }
    if (infoRoutes.length > 0) infoRoutes.forEach(push);
    if (tradeRoutes.length > 0) tradeRoutes.forEach(push);
    return candidates;
  }

  async getQuote({ symbol, tradableInstrumentId, routeId, maxAgeMs = 1500, allowRefresh = true } = {}) {
    try {
      await this.ensureInstruments();
    } catch (e) {
      const msg = redactErrorMessage(e?.message || String(e));
      return { ok: false, error: msg };
    }

    const instId = parseNumberLoose(tradableInstrumentId);
    let inst = instId != null ? this.instrumentsByTradableId.get(Number(instId)) : null;
    if (!inst && symbol) inst = this.resolveInstrumentForSymbol(symbol);
    if (!inst) {
      return {
        ok: false,
        error: `Unknown instrument: ${String(symbol || tradableInstrumentId || '').trim() || 'N/A'}.`,
        code: 'INSTRUMENT_NOT_READY'
      };
    }

    const instrumentId = Number(inst?.tradableInstrumentId);
    if (!Number.isFinite(instrumentId)) {
      return { ok: false, error: 'Invalid tradableInstrumentId.', code: 'INSTRUMENT_NOT_READY' };
    }

    const resolvedSymbol = String(inst?.name || inst?.localizedName || symbol || '').trim() || null;
    const cachedRoute = this.infoRouteCache.get(instrumentId);
    const candidates = this.getInfoRouteCandidates(inst, routeId ?? cachedRoute);
    if (candidates.length === 0) {
      return { ok: false, error: 'Could not determine INFO routeId for instrument.', code: 'INSTRUMENT_NOT_READY' };
    }
    const quoteDebugSettings = normalizeDebugSettings(this.state?.debug);
    if (quoteDebugSettings.enabled) {
      appendQuoteDebugLine({
        at: new Date().toISOString(),
        atMs: nowMs(),
        type: 'quote_context',
        env: this.state.env,
        server: this.state.server || null,
        accountId: this.state.accountId ?? null,
        accNum: this.state.accNum ?? null,
        symbolInput: symbol ?? null,
        resolvedSymbol,
        tradableInstrumentId: instrumentId,
        requestedRouteId: routeId ?? null,
        cachedRouteId: cachedRoute ?? null,
        candidateRouteIds: candidates,
        instrument: summarizeInstrument(inst)
      }, quoteDebugSettings);
    }

    const now = nowMs();
    const maxAge = Number.isFinite(Number(maxAgeMs)) ? Math.max(0, Number(maxAgeMs)) : 0;
    let lastError = null;

    for (const candidateRouteId of candidates) {
      const cacheKey = `${instrumentId}:${candidateRouteId}`;
      if (maxAge > 0) {
        const cached = this.quoteCache.get(cacheKey);
        if (cached && now - cached.fetchedAtMs <= maxAge) {
          return { ok: true, ...cached, cached: true };
        }
      }

      try {
        const qs = new URLSearchParams({
          routeId: String(candidateRouteId),
          tradableInstrumentId: String(instrumentId)
        });
        const json = await this.withTransientRetry(
          () => this.apiJson(`/trade/quotes?${qs.toString()}`, { includeAccNum: true }),
          { attempts: 3, baseDelayMs: 250, maxDelayMs: 1500 }
        );
        const status = String(json?.s || '').toLowerCase();
        if (status === 'error') {
          const errMsg = String(json?.errmsg || json?.error || json?.message || 'TradeLocker quote error.');
          lastError = errMsg;
          continue;
        }
        if (status === 'no_data') {
          lastError = 'No quote data returned for this instrument.';
          continue;
        }
        const payload = json?.d ?? json?.data ?? json;
        const quote = extractQuotePayload(payload);
        if (!quote) {
          lastError = 'Invalid quote payload.';
          continue;
        }

        const entry = {
          quote,
          symbol: resolvedSymbol,
          tradableInstrumentId: instrumentId,
          routeId: candidateRouteId,
          fetchedAtMs: nowMs()
        };
        setCacheValue(this.quoteCache, cacheKey, entry, 200);
        this.infoRouteCache.set(instrumentId, candidateRouteId);
        return { ok: true, ...entry, cached: false };
      } catch (e) {
        const status = typeof e?.status === 'number' ? e.status : null;
        const msg = redactErrorMessage(e?.message || String(e));
        const code = e?.code || classifyTradeLockerError({ status, message: msg }) || undefined;
        this.lastError = msg;
        lastError = msg;
        if (status === 429) {
          return { ok: false, error: msg, code, rateLimited: true, retryAtMs: this.rateLimitedUntilMs || 0 };
        }
        if (code) {
          return { ok: false, error: msg, code };
        }
      }
    }

    if (allowRefresh && lastError) {
      const err = String(lastError || '').toLowerCase();
      const shouldRefresh =
        err.includes('symbol does not exist') ||
        err.includes('unknown instrument') ||
        err.includes('no quote data') ||
        err.includes('invalid quote payload');
      if (shouldRefresh) {
        try {
          await this.ensureInstruments(true);
        } catch {
          // ignore refresh errors
        }
        return this.getQuote({ symbol, tradableInstrumentId, routeId, maxAgeMs, allowRefresh: false });
      }
    }

    return { ok: false, error: lastError || 'Failed to fetch quote.', code: classifyTradeLockerError({ status: null, message: lastError }) || undefined };
  }

  async getQuotes({ symbols, tradableInstrumentIds, maxAgeMs = 1500 } = {}) {
    const symbolList = Array.isArray(symbols) ? symbols : (symbols ? [symbols] : []);
    const idList = Array.isArray(tradableInstrumentIds) ? tradableInstrumentIds : (tradableInstrumentIds ? [tradableInstrumentIds] : []);
    const tasks = [];
    for (const symbol of symbolList) tasks.push({ symbol });
    for (const id of idList) tasks.push({ tradableInstrumentId: id });

    if (tasks.length === 0) return { ok: false, error: 'No symbols or tradableInstrumentIds provided.', quotes: [] };

    const quotes = [];
    const errors = [];
    const codes = [];
    let rateLimited = false;
    let retryAtMs = 0;

    for (const task of tasks) {
      const res = await this.getQuote({ ...task, maxAgeMs });
      if (res?.ok) {
        quotes.push(res);
      } else {
        errors.push(res?.error || 'Quote request failed.');
        if (res?.code) codes.push(String(res.code));
        if (res?.rateLimited) {
          rateLimited = true;
          retryAtMs = Math.max(retryAtMs, Number(res?.retryAtMs || 0));
        }
      }
    }

    if (quotes.length === 0) {
      return {
        ok: false,
        error: errors[0] || 'Failed to fetch quotes.',
        code: codes.length > 0 ? codes[0] : (rateLimited ? 'RATE_LIMITED' : undefined),
        quotes: [],
        errors,
        rateLimited,
        retryAtMs
      };
    }

    return { ok: true, quotes, errors, rateLimited, retryAtMs, code: codes.length > 0 ? codes[0] : undefined };
  }

  async getDailyBar({ symbol, tradableInstrumentId, routeId, barType = 'TRADE', maxAgeMs = 30_000 } = {}) {
    try {
      await this.ensureInstruments();
    } catch (e) {
      const msg = redactErrorMessage(e?.message || String(e));
      return { ok: false, error: msg };
    }

    const instId = parseNumberLoose(tradableInstrumentId);
    let inst = instId != null ? this.instrumentsByTradableId.get(Number(instId)) : null;
    if (!inst && symbol) inst = this.resolveInstrumentForSymbol(symbol);
    if (!inst) {
      return {
        ok: false,
        error: `Unknown instrument: ${String(symbol || tradableInstrumentId || '').trim() || 'N/A'}.`,
        code: 'INSTRUMENT_NOT_READY'
      };
    }

    const instrumentId = Number(inst?.tradableInstrumentId);
    if (!Number.isFinite(instrumentId)) {
      return { ok: false, error: 'Invalid tradableInstrumentId.', code: 'INSTRUMENT_NOT_READY' };
    }

    const resolvedSymbol = String(inst?.name || inst?.localizedName || symbol || '').trim() || null;
    const cachedRoute = this.infoRouteCache.get(instrumentId);
    const candidates = this.getInfoRouteCandidates(inst, routeId ?? cachedRoute);
    if (candidates.length === 0) {
      return { ok: false, error: 'Could not determine INFO routeId for instrument.', code: 'INSTRUMENT_NOT_READY' };
    }

    const barTypeUpper = String(barType || 'TRADE').trim().toUpperCase();
    const cacheKey = `${instrumentId}:${barTypeUpper}`;
    const now = nowMs();
    const maxAge = Number.isFinite(Number(maxAgeMs)) ? Math.max(0, Number(maxAgeMs)) : 0;
    if (maxAge > 0) {
      const cached = this.dailyBarCache.get(cacheKey);
      if (cached && now - cached.fetchedAtMs <= maxAge) {
        return { ok: true, ...cached, cached: true };
      }
    }

    let lastError = null;
    for (const candidateRouteId of candidates) {
      try {
        const qs = new URLSearchParams({
          routeId: String(candidateRouteId),
          tradableInstrumentId: String(instrumentId),
          barType: barTypeUpper
        });
        const json = await this.withTransientRetry(
          () => this.apiJson(`/trade/dailyBar?${qs.toString()}`, { includeAccNum: true }),
          { attempts: 3, baseDelayMs: 250, maxDelayMs: 1500 }
        );
        const payload = json?.d ?? json?.data ?? json;
        const bar = payload && typeof payload === 'object'
          ? {
              open: parseNumberLoose(pickFirst(payload, ['o', 'open'])),
              high: parseNumberLoose(pickFirst(payload, ['h', 'high'])),
              low: parseNumberLoose(pickFirst(payload, ['l', 'low'])),
              close: parseNumberLoose(pickFirst(payload, ['c', 'close'])),
              volume: parseNumberLoose(pickFirst(payload, ['v', 'volume']))
            }
          : null;

        if (!bar || (bar.open == null && bar.high == null && bar.low == null && bar.close == null)) {
          lastError = 'Invalid daily bar payload.';
          continue;
        }

        const entry = {
          bar,
          symbol: resolvedSymbol,
          tradableInstrumentId: instrumentId,
          routeId: candidateRouteId,
          barType: barTypeUpper,
          fetchedAtMs: nowMs()
        };
        setCacheValue(this.dailyBarCache, cacheKey, entry, 120);
        this.infoRouteCache.set(instrumentId, candidateRouteId);
        return { ok: true, ...entry, cached: false };
      } catch (e) {
        const status = typeof e?.status === 'number' ? e.status : null;
        const msg = redactErrorMessage(e?.message || String(e));
        const code = e?.code || classifyTradeLockerError({ status, message: msg }) || undefined;
        this.lastError = msg;
        lastError = msg;
        if (status === 429) {
          return { ok: false, error: msg, code, rateLimited: true, retryAtMs: this.rateLimitedUntilMs || 0 };
        }
        if (code) {
          return { ok: false, error: msg, code };
        }
      }
    }

    return { ok: false, error: lastError || 'Failed to fetch daily bar.', code: classifyTradeLockerError({ status: null, message: lastError }) || undefined };
  }

  async getHistory({
    symbol,
    tradableInstrumentId,
    routeId,
    resolution = '1m',
    from,
    to,
    lookback,
    maxBarsPerRequest,
    maxAgeMs = 0
  } = {}) {
    try {
      await this.ensureInstruments();
    } catch (e) {
      const msg = redactErrorMessage(e?.message || String(e));
      return { ok: false, error: msg };
    }

    const instId = parseNumberLoose(tradableInstrumentId);
    let inst = instId != null ? this.instrumentsByTradableId.get(Number(instId)) : null;
    if (!inst && symbol) inst = this.resolveInstrumentForSymbol(symbol);
    if (!inst) {
      return {
        ok: false,
        error: `Unknown instrument: ${String(symbol || tradableInstrumentId || '').trim() || 'N/A'}.`,
        code: 'INSTRUMENT_NOT_READY'
      };
    }

    const instrumentId = Number(inst?.tradableInstrumentId);
    if (!Number.isFinite(instrumentId)) {
      return { ok: false, error: 'Invalid tradableInstrumentId.', code: 'INSTRUMENT_NOT_READY' };
    }

    const resolvedSymbol = String(inst?.name || inst?.localizedName || symbol || '').trim() || null;
    const normalizedResolution = normalizeResolution(resolution);
    const resolutionMs = resolutionToMs(normalizedResolution);
    if (!resolutionMs) return { ok: false, error: `Unsupported resolution: ${String(resolution)}` };

    const lookbackMs = parseLookbackMs(lookback);
    let fromMs = normalizeEpochMs(from);
    let toMs = normalizeEpochMs(to);
    if (fromMs == null && toMs == null && lookbackMs != null) {
      toMs = nowMs();
      fromMs = toMs - lookbackMs;
    }
    if (fromMs != null && toMs == null) {
      toMs = nowMs();
    }
    if (toMs != null && fromMs == null && lookbackMs != null) {
      fromMs = toMs - lookbackMs;
    }
    if (fromMs == null || toMs == null) {
      return { ok: false, error: 'from/to or lookback is required for history.' };
    }
    if (fromMs > toMs) {
      const tmp = fromMs;
      fromMs = toMs;
      toMs = tmp;
    }

    const cachedRoute = this.infoRouteCache.get(instrumentId);
    const candidates = this.getInfoRouteCandidates(inst, routeId ?? cachedRoute);
    if (candidates.length === 0) {
      return { ok: false, error: 'Could not determine INFO routeId for instrument.', code: 'INSTRUMENT_NOT_READY' };
    }

    let maxBars = Number.isFinite(Number(maxBarsPerRequest)) ? Math.max(1, Math.floor(Number(maxBarsPerRequest))) : null;
    if (!maxBars) {
      try {
        const config = await this.ensureConfig();
        const limits = Array.isArray(config?.d?.limits) ? config.d.limits : [];
        const found = limits.find((limit) => String(limit?.limitType || '').toUpperCase() === 'QUOTES_HISTORY_BARS');
        const val = parseNumberLoose(found?.limit);
        if (val != null && val > 0) maxBars = Math.floor(val);
      } catch {
        // ignore
      }
    }
    if (!maxBars) maxBars = 20_000;

    const cacheKey = `${instrumentId}:${normalizedResolution}:${fromMs}:${toMs}`;
    const now = nowMs();
    const maxAge = Number.isFinite(Number(maxAgeMs)) ? Math.max(0, Number(maxAgeMs)) : 0;
    if (maxAge > 0) {
      const cached = this.historyCache.get(cacheKey);
      if (cached && now - cached.fetchedAtMs <= maxAge) {
        return { ok: true, ...cached, cached: true };
      }
    }

    let lastError = null;
    for (const candidateRouteId of candidates) {
      try {
        const chunkSpanMs = resolutionMs * maxBars;
        const barsByTs = new Map();
        let cursor = fromMs;
        while (cursor <= toMs) {
          const chunkStart = cursor;
          const chunkEnd = Math.min(cursor + chunkSpanMs, toMs);
          if (chunkEnd <= chunkStart) break;
          const qs = new URLSearchParams({
            routeId: String(candidateRouteId),
            tradableInstrumentId: String(instrumentId),
            resolution: String(normalizedResolution),
            from: String(Math.floor(chunkStart)),
            to: String(Math.floor(chunkEnd))
          });
          const json = await this.withTransientRetry(
            () => this.apiJson(`/trade/history?${qs.toString()}`, { includeAccNum: true }),
            { attempts: 3, baseDelayMs: 300, maxDelayMs: 2000 }
          );
          const status = String(json?.s || '').toLowerCase();
          const details = Array.isArray(json?.d?.barDetails) ? json.d.barDetails : [];
          if (status !== 'no_data') {
            for (const bar of details) {
              const ts = normalizeEpochMs(bar?.t ?? bar?.time ?? bar?.timestamp);
              if (ts == null) continue;
              barsByTs.set(ts, {
                t: ts,
                o: parseNumberLoose(bar?.o ?? bar?.open),
                h: parseNumberLoose(bar?.h ?? bar?.high),
                l: parseNumberLoose(bar?.l ?? bar?.low),
                c: parseNumberLoose(bar?.c ?? bar?.close),
                v: parseNumberLoose(bar?.v ?? bar?.volume)
              });
            }
          }
          cursor = chunkEnd + 1;
        }

        const bars = Array.from(barsByTs.values()).sort((a, b) => a.t - b.t);
        const entry = {
          bars,
          symbol: resolvedSymbol,
          tradableInstrumentId: instrumentId,
          routeId: candidateRouteId,
          resolution: normalizedResolution,
          from: fromMs,
          to: toMs,
          fetchedAtMs: nowMs()
        };
        setCacheValue(this.historyCache, cacheKey, entry, 30);
        this.infoRouteCache.set(instrumentId, candidateRouteId);
        return { ok: true, ...entry, cached: false };
      } catch (e) {
        const status = typeof e?.status === 'number' ? e.status : null;
        const msg = redactErrorMessage(e?.message || String(e));
        const code = e?.code || classifyTradeLockerError({ status, message: msg }) || undefined;
        this.lastError = msg;
        lastError = msg;
        if (status === 429) {
          return { ok: false, error: msg, code, rateLimited: true, retryAtMs: this.rateLimitedUntilMs || 0 };
        }
        if (code) {
          return { ok: false, error: msg, code };
        }
      }
    }

    return { ok: false, error: lastError || 'Failed to fetch history.', code: classifyTradeLockerError({ status: null, message: lastError }) || undefined };
  }

  async getHistorySeries({
    symbol,
    tradableInstrumentId,
    resolution = '1m',
    from,
    to,
    lookback,
    maxBarsPerRequest,
    maxAgeMs = 0,
    aggregate
  } = {}) {
    try {
      await this.ensureInstruments();
    } catch (e) {
      const msg = redactErrorMessage(e?.message || String(e));
      return { ok: false, error: msg };
    }

    const instId = parseNumberLoose(tradableInstrumentId);
    let inst = instId != null ? this.instrumentsByTradableId.get(Number(instId)) : null;
    if (!inst && symbol) inst = this.resolveInstrumentForSymbol(symbol);
    if (!inst) {
      return {
        ok: false,
        error: `Unknown instrument: ${String(symbol || tradableInstrumentId || '').trim() || 'N/A'}.`,
        code: 'INSTRUMENT_NOT_READY'
      };
    }

    const instrumentId = Number(inst?.tradableInstrumentId);
    if (!Number.isFinite(instrumentId)) {
      return { ok: false, error: 'Invalid tradableInstrumentId.', code: 'INSTRUMENT_NOT_READY' };
    }

    const resolvedSymbol = String(inst?.name || inst?.localizedName || symbol || '').trim() || null;
    const normalizedResolution = normalizeResolution(resolution);
    const resolutionMs = resolutionToMs(normalizedResolution);
    if (!resolutionMs) return { ok: false, error: `Unsupported resolution: ${String(resolution)}` };

    const lookbackMs = parseLookbackMs(lookback);
    let fromMs = normalizeEpochMs(from);
    let toMs = normalizeEpochMs(to);
    if (fromMs == null && toMs == null && lookbackMs != null) {
      toMs = nowMs();
      fromMs = toMs - lookbackMs;
    }
    if (fromMs != null && toMs == null) {
      toMs = nowMs();
    }
    if (toMs != null && fromMs == null && lookbackMs != null) {
      fromMs = toMs - lookbackMs;
    }
    if (fromMs == null || toMs == null) {
      return { ok: false, error: 'from/to or lookback is required for history.' };
    }
    if (fromMs > toMs) {
      const tmp = fromMs;
      fromMs = toMs;
      toMs = tmp;
    }

    const wantsAggregate = typeof aggregate === 'boolean' ? aggregate : normalizedResolution !== '1m';
    const baseResolution = wantsAggregate ? '1m' : normalizedResolution;

    const maxAge = Number.isFinite(Number(maxAgeMs)) ? Math.max(0, Number(maxAgeMs)) : 0;
    const now = nowMs();
    const hasAgeConstraint = maxAge > 0;

    const ensureCoverage = async (res) => {
      if (!this.historyStore) return { ok: false, error: 'History store unavailable.' };
      const meta = await this.historyStore.getSeriesMeta(instrumentId, res);
      const minTs = Number(meta?.minTs);
      const maxTs = Number(meta?.maxTs);
      const lastFetched = Number(meta?.lastFetchedAtMs);
      const coverageOk =
        meta?.count > 0 &&
        Number.isFinite(minTs) &&
        Number.isFinite(maxTs) &&
        minTs <= fromMs &&
        maxTs >= toMs;
      const freshOk = !hasAgeConstraint || (Number.isFinite(lastFetched) && now - lastFetched <= maxAge);

      if (coverageOk && freshOk) return { ok: true, usedStore: true, meta };

      const fetched = await this.getHistory({
        symbol: resolvedSymbol || symbol,
        tradableInstrumentId: instrumentId,
        resolution: res,
        from: fromMs,
        to: toMs,
        maxBarsPerRequest,
        maxAgeMs: 0
      });
      if (!fetched?.ok) {
        return {
          ok: false,
          error: fetched?.error ? String(fetched.error) : 'Failed to fetch history.',
          rateLimited: fetched?.rateLimited,
          retryAtMs: fetched?.retryAtMs
        };
      }

      await this.historyStore.upsertBars(instrumentId, res, fetched.bars || [], {
        fetchedAtMs: fetched.fetchedAtMs || nowMs()
      });
      return { ok: true, fetched };
    };

    const baseEnsure = await ensureCoverage(baseResolution);
    if (!baseEnsure?.ok) {
      if (this.historyStore) {
        try {
          const fallbackRes = await this.historyStore.getBars(instrumentId, baseResolution, { from: fromMs, to: toMs });
          const fallbackBars = Array.isArray(fallbackRes?.bars) ? fallbackRes.bars : [];
          if (fallbackBars.length > 0) {
            const warning = baseEnsure?.error ? String(baseEnsure.error) : 'History fetch failed; using cached bars.';
            if (!wantsAggregate || normalizedResolution === baseResolution) {
              const coverage = computeHistoryCoverage(fallbackBars, resolutionMs, fromMs, toMs);
              return {
                ok: true,
                bars: fallbackBars,
                symbol: resolvedSymbol,
                tradableInstrumentId: instrumentId,
                resolution: baseResolution,
                from: fromMs,
                to: toMs,
                fetchedAtMs: nowMs(),
                source: 'store_partial',
                coverage,
                warning,
                partial: true
              };
            }
            const aggregatedFallback = aggregateBars(fallbackBars, resolutionMs);
            const coverage = computeHistoryCoverage(aggregatedFallback, resolutionMs, fromMs, toMs);
            return {
              ok: true,
              bars: aggregatedFallback,
              symbol: resolvedSymbol,
              tradableInstrumentId: instrumentId,
              resolution: normalizedResolution,
              from: fromMs,
              to: toMs,
              fetchedAtMs: nowMs(),
              source: 'store_partial_aggregate',
              coverage,
              warning,
              partial: true
            };
          }
        } catch {
          // ignore fallback failures
        }
      }
      return baseEnsure;
    }

    const baseRes = await this.historyStore.getBars(instrumentId, baseResolution, { from: fromMs, to: toMs });
    if (!baseRes?.ok) return { ok: false, error: baseRes?.error || 'Failed to load cached history.' };
    const baseBars = Array.isArray(baseRes?.bars) ? baseRes.bars : [];

    if (!wantsAggregate || normalizedResolution === baseResolution) {
      const coverage = computeHistoryCoverage(baseBars, resolutionMs, fromMs, toMs);
      return {
        ok: true,
        bars: baseBars,
        symbol: resolvedSymbol,
        tradableInstrumentId: instrumentId,
        resolution: baseResolution,
        from: fromMs,
        to: toMs,
        fetchedAtMs: nowMs(),
        source: baseEnsure?.usedStore ? 'store' : 'broker',
        coverage
      };
    }

    const aggregated = aggregateBars(baseBars, resolutionMs);
    await this.historyStore.upsertBars(instrumentId, normalizedResolution, aggregated, {
      fetchedAtMs: nowMs()
    });

    const coverage = computeHistoryCoverage(aggregated, resolutionMs, fromMs, toMs);
    return {
      ok: true,
      bars: aggregated,
      symbol: resolvedSymbol,
      tradableInstrumentId: instrumentId,
      resolution: normalizedResolution,
      from: fromMs,
      to: toMs,
      fetchedAtMs: nowMs(),
      source: 'aggregate',
      coverage
    };
  }

  async getInstrumentDetailsCached(instrumentId, maxAgeMs = 60_000) {
    const id = parseNumberLoose(instrumentId);
    if (id == null) return null;
    const key = String(id);
    const cached = this.instrumentDetailsCache?.get?.(key);
    const now = nowMs();
    if (cached && now - (cached.fetchedAtMs || 0) <= maxAgeMs) return cached.instrument;
    const res = await this.getInstrumentDetails({ tradableInstrumentId: id });
    if (!res?.ok) return null;
    const entry = { instrument: res.instrument, fetchedAtMs: now };
    setCacheValue(this.instrumentDetailsCache, key, entry, 60);
    return res.instrument;
  }

  async getSessionStatusCached(sessionStatusId, maxAgeMs = 60_000) {
    const id = parseNumberLoose(sessionStatusId);
    if (id == null) return null;
    const key = String(id);
    const cached = this.sessionStatusCache?.get?.(key);
    const now = nowMs();
    if (cached && now - (cached.fetchedAtMs || 0) <= maxAgeMs) return cached.status;
    const res = await this.getSessionStatus({ sessionStatusId: id });
    if (!res?.ok) return null;
    const entry = { status: res.status, fetchedAtMs: now };
    setCacheValue(this.sessionStatusCache, key, entry, 80);
    return res.status;
  }

  async resolveInstrumentConstraints(inst) {
    if (!inst || typeof inst !== 'object') {
      return { minStopDistance: null, priceStep: null, sessionOpen: null, sessionStatus: null };
    }
    const instrumentId = parseNumberLoose(inst?.tradableInstrumentId);
    const instConstraints = extractInstrumentConstraints(inst);

    let details = null;
    if (instrumentId != null) {
      try {
        details = await this.getInstrumentDetailsCached(instrumentId);
      } catch {
        details = null;
      }
    }

    const detailsConstraints = details ? extractInstrumentConstraints(details) : { minStopDistance: null, priceStep: null, sessionId: null, sessionStatusId: null };

    const minStopDistance = detailsConstraints.minStopDistance ?? instConstraints.minStopDistance ?? null;
    const priceStep = detailsConstraints.priceStep ?? instConstraints.priceStep ?? null;
    const sessionStatusId = detailsConstraints.sessionStatusId ?? instConstraints.sessionStatusId ?? null;
    const sessionId = detailsConstraints.sessionId ?? instConstraints.sessionId ?? null;

    let sessionStatus = null;
    if (sessionStatusId != null) {
      sessionStatus = await this.getSessionStatusCached(sessionStatusId, 60_000);
    } else if (sessionId != null) {
      const sessionDetails = await this.getSessionDetails({ sessionId });
      const statusId =
        parseNumberLoose(sessionDetails?.session?.sessionStatusId) ??
        parseNumberLoose(sessionDetails?.session?.statusId) ??
        parseNumberLoose(sessionDetails?.session?.sessionStatus);
      if (statusId != null) {
        sessionStatus = await this.getSessionStatusCached(statusId, 60_000);
      }
    }

    const sessionOpen = parseSessionOpen(sessionStatus);

    return {
      minStopDistance,
      priceStep,
      sessionOpen,
      sessionStatus
    };
  }

  async getInstrumentConstraints({ tradableInstrumentId, symbol } = {}) {
    try {
      await this.ensureInstruments();
    } catch (e) {
      const msg = redactErrorMessage(e?.message || String(e));
      const status = typeof e?.status === 'number' ? e.status : null;
      const code = e?.code || classifyTradeLockerError({ status, message: msg }) || undefined;
      return { ok: false, error: msg, code };
    }

    const instId = parseNumberLoose(tradableInstrumentId);
    let inst = instId != null ? this.instrumentsByTradableId.get(Number(instId)) : null;
    if (!inst && symbol) inst = this.resolveInstrumentForSymbol(symbol);
    if (!inst) {
      const raw = String(symbol || tradableInstrumentId || '').trim();
      return { ok: false, error: `Unknown instrument: ${raw || 'N/A'}.`, code: 'INSTRUMENT_NOT_READY' };
    }

    const resolvedSymbol = String(inst?.name || inst?.localizedName || symbol || '').trim() || null;
    const constraints = await this.resolveInstrumentConstraints(inst);
    return {
      ok: true,
      symbol: resolvedSymbol,
      tradableInstrumentId: Number(inst?.tradableInstrumentId) || null,
      constraints,
      fetchedAtMs: nowMs()
    };
  }

  async getInstrumentDetails({ tradableInstrumentId, symbol } = {}) {
    let inst = null;
    try {
      await this.ensureInstruments();
    } catch (e) {
      const msg = redactErrorMessage(e?.message || String(e));
      const status = typeof e?.status === 'number' ? e.status : null;
      const code = e?.code || classifyTradeLockerError({ status, message: msg }) || undefined;
      return { ok: false, error: msg, code };
    }

    const instId = parseNumberLoose(tradableInstrumentId);
    if (instId != null) inst = this.instrumentsByTradableId.get(Number(instId)) || null;
    if (!inst && symbol) inst = this.resolveInstrumentForSymbol(symbol);
    if (!inst) {
      if (instId != null) return { ok: false, error: `Unknown tradableInstrumentId: ${instId}.`, code: 'INSTRUMENT_NOT_READY' };
      const raw = String(symbol || '').trim();
      return { ok: false, error: `Unknown instrument: ${raw || 'N/A'}.`, code: 'INSTRUMENT_NOT_READY' };
    }

    const instrumentId = Number(inst.tradableInstrumentId);
    if (!Number.isFinite(Number(instrumentId))) return { ok: false, error: 'tradableInstrumentId is required.' };

    const cachedInstrument = inst || null;
    let query = '';
    if (inst && Array.isArray(inst.routes)) {
      const tradeRoute = inst.routes.find((r) => String(r?.type || '').toUpperCase() === 'TRADE');
      const routeId = tradeRoute?.id;
      if (Number.isFinite(Number(routeId))) {
        query = `?routeId=${encodeURIComponent(String(routeId))}`;
      }
    }

    try {
      const json = await this.apiJson(`/trade/instruments/${encodeURIComponent(String(instrumentId))}${query}`, { includeAccNum: true });
      return { ok: true, instrument: json?.d ?? json };
    } catch (e) {
      const status = typeof e?.status === 'number' ? e.status : null;
      const msg = redactErrorMessage(e?.message || String(e));
      const accNumMissing = status === 400 && /accnum|header missing/i.test(msg);
      if (accNumMissing || status === 400 || status === 404) {
        if (cachedInstrument) {
          return { ok: true, instrument: cachedInstrument, fallback: true };
        }
        return { ok: false, error: msg };
      }
      this.lastError = msg;
      return { ok: false, error: msg };
    }
  }

  async getSessionDetails({ sessionId } = {}) {
    const id = parseNumberLoose(sessionId);
    if (id == null) return { ok: false, error: 'sessionId is required.' };
    try {
      const json = await this.apiJson(`/trade/sessions/${encodeURIComponent(String(id))}`, { includeAccNum: true });
      return { ok: true, session: json?.d ?? json };
    } catch (e) {
      const msg = redactErrorMessage(e?.message || String(e));
      this.lastError = msg;
      return { ok: false, error: msg };
    }
  }

  async getSessionStatus({ sessionStatusId } = {}) {
    const id = parseNumberLoose(sessionStatusId);
    if (id == null) return { ok: false, error: 'sessionStatusId is required.' };
    try {
      const json = await this.apiJson(`/trade/sessionStatuses/${encodeURIComponent(String(id))}`, { includeAccNum: true });
      return { ok: true, status: json?.d ?? json };
    } catch (e) {
      const msg = redactErrorMessage(e?.message || String(e));
      this.lastError = msg;
      return { ok: false, error: msg };
    }
  }

  async placeOrder({ symbol, side, qty, type, price, stopPrice, stopLoss, takeProfit, strategyId }) {
    if (!this.state.tradingEnabled) return { ok: false, error: 'Trading is disabled in Settings.' };
    if (!this.state.accountId) return { ok: false, error: 'TradeLocker accountId not set. Select an account first.' };
    const upstreamBackoff = this.getUpstreamBackoff();
    if (upstreamBackoff) {
      return {
        ok: false,
        error: `TradeLocker upstream unavailable. Retry in ${Math.ceil(upstreamBackoff.retryAfterMs / 1000)}s.`,
        code: 'UPSTREAM_UNAVAILABLE',
        retryAfterMs: upstreamBackoff.retryAfterMs
      };
    }

    try {
      await this.ensureInstruments();
      const inst = this.resolveInstrumentForSymbol(symbol);
      if (!inst) {
        const raw = String(symbol || '').trim();
        const candidates = extractSymbolCandidates(raw);
        const list = Array.isArray(this.instruments) ? this.instruments : [];
        const scored = [];
        for (const q of candidates) {
          for (const it of list) {
            const score = scoreInstrumentMatch(it, q);
            if (score <= 0) continue;
            scored.push({ score, symbol: String(it?.name || '').trim() });
          }
        }
        scored.sort((a, b) => b.score - a.score);
        const suggestions = Array.from(new Set(scored.map((s) => s.symbol).filter(Boolean))).slice(0, 5);
        const hint = suggestions.length > 0 ? ` Try: ${suggestions.join(', ')}` : '';
        return { ok: false, error: `Unknown instrument: ${raw}.${hint}`, code: 'INSTRUMENT_NOT_READY' };
      }

      const tradeRoute = Array.isArray(inst.routes)
        ? inst.routes.find((r) => String(r?.type || '').toUpperCase() === 'TRADE')
        : null;
      const routeId = tradeRoute?.id;
      if (!Number.isFinite(Number(routeId))) {
        return { ok: false, error: 'Could not determine TRADE routeId for instrument.', code: 'INSTRUMENT_NOT_READY' };
      }

      const orderTypeRaw = String(type || this.state.defaultOrderType || 'market').toLowerCase();
      const orderType = orderTypeRaw === 'limit' ? 'limit' : orderTypeRaw === 'stop' ? 'stop' : 'market';
      const isLimit = orderType === 'limit';
      const isStop = orderType === 'stop';
      const isMarket = orderType === 'market';
      const orderSide = String(side || '').toLowerCase() === 'sell' || String(side || '').toUpperCase() === 'SELL' ? 'sell' : 'buy';

      const constraints = await this.resolveInstrumentConstraints(inst);
      if (constraints?.sessionOpen === false && isMarket) {
        return { ok: false, error: 'Market session is closed for this instrument.' };
      }

      const quantityRequested = parseNumberLoose(qty) ?? this.state.defaultOrderQty;
      if (!quantityRequested || quantityRequested <= 0) return { ok: false, error: 'Order qty must be > 0.' };

      const normalizedRes = normalizeOrderQuantity(inst, quantityRequested);
      if (!normalizedRes?.ok) {
        return {
          ok: false,
          error: normalizedRes?.error ? String(normalizedRes.error) : 'Invalid order qty for instrument.',
          requestedQty: quantityRequested,
          normalizedQty: normalizedRes?.normalizedQty ?? null,
          minQty: normalizedRes?.minQty ?? null,
          maxQty: normalizedRes?.maxQty ?? null,
          qtyStep: normalizedRes?.qtyStep ?? null,
          qtyPrecision: normalizedRes?.qtyPrecision ?? null
        };
      }

      const quantity = normalizedRes.qty;

      const body = {
        qty: quantity,
        side: orderSide,
        tradableInstrumentId: Number(inst.tradableInstrumentId),
        type: orderType,
        routeId: Number(routeId),
        validity: isMarket ? 'IOC' : 'GTC'
      };

      if (strategyId) body.strategyId = String(strategyId).slice(0, 31);

      if (isLimit) {
        const p = parseNumberLoose(price);
        if (p == null || p <= 0) return { ok: false, error: 'Limit orders require a valid price.' };
        body.price = p;
      } else if (isStop) {
        const sp = parseNumberLoose(stopPrice ?? price);
        if (sp == null || sp <= 0) return { ok: false, error: 'Stop orders require a valid stop price.' };
        body.stopPrice = sp;
        body.price = 0;
      } else {
        // docs: price can be 0 for market orders
        body.price = 0;
      }

      const refPrice = (() => {
        if (isLimit) return parseNumberLoose(price);
        if (isStop) return parseNumberLoose(stopPrice ?? price);
        return null;
      })();

      if (constraints?.minStopDistance != null) {
        let stopRef = refPrice;
        if (stopRef == null) {
          const quoteRes = await this.getQuote({ symbol: inst?.name || symbol, tradableInstrumentId: inst?.tradableInstrumentId, maxAgeMs: 1500 });
          const q = quoteRes?.quote || {};
          stopRef =
            orderSide === 'buy'
              ? (q.ask ?? q.mid ?? q.last ?? q.bid)
              : (q.bid ?? q.mid ?? q.last ?? q.ask);
        }

        const stopErr = validateStopDistances({
          stopLoss,
          takeProfit,
          refPrice: stopRef,
          minStopDistance: constraints.minStopDistance
        });
        if (stopErr) {
          return {
            ok: false,
            error: stopErr,
            minStopDistance: constraints.minStopDistance,
            refPrice: stopRef
          };
        }
      }

      const sl = parseNumberLoose(stopLoss);
      if (sl != null && sl > 0) {
        body.stopLoss = sl;
        body.stopLossType = 'absolute';
      }

      const tp = parseNumberLoose(takeProfit);
      if (tp != null && tp > 0) {
        body.takeProfit = tp;
        body.takeProfitType = 'absolute';
      }

      const resolvedSymbol = String(inst?.name || inst?.localizedName || '').trim() || null;

      const post = await this.apiRequestMeta(`/trade/accounts/${this.state.accountId}/orders`, {
        method: 'POST',
        includeAccNum: true,
        body
      });

      const json = post?.json;
      const debugSettings = normalizeDebugSettings(this.state.debug);

      const debugEntry = {
        at: new Date().toISOString(),
        atMs: nowMs(),
        env: this.state.env,
        server: this.state.server || null,
        accountId: this.state.accountId,
        accNum: this.state.accNum,
        symbolRequested: String(symbol || '').trim() || null,
        symbolResolved: resolvedSymbol,
        side: orderSide,
        type: orderType,
        strategyId: strategyId ? String(strategyId).slice(0, 64) : null,
        request: {
          path: `/trade/accounts/${this.state.accountId}/orders`,
          body
        },
        response: {
          ok: !!post?.ok,
          status: post?.status ?? null,
          statusText: post?.statusText ?? null,
          retryAfterMs: post?.retryAfterMs ?? null,
          rateLimited: !!post?.rateLimited,
          retryAtMs: post?.retryAtMs ?? null,
          headers: post?.headers || {},
          text: typeof post?.text === 'string' ? post.text.slice(0, Math.max(500, debugSettings.textLimit)) : '',
          json
        }
      };
      const sanitizedDebug = sanitizeDebugEntry(debugEntry, debugSettings);
      this.lastOrderDebug = sanitizedDebug;
      appendOrderDebugLine(sanitizedDebug, debugSettings);

      if (!post?.ok) {
        const msg = post?.error ? String(post.error) : `HTTP ${post?.status ?? 0} ${post?.statusText ?? ''}`.trim();
        const code = post?.code || classifyTradeLockerError({ status: post?.status, message: msg }) || undefined;
        this.lastError = msg;
        return { ok: false, error: msg, code, requestedQty: quantityRequested, qty: quantity, resolvedSymbol, response: json };
      }

      const extractMessageFromResponse = (payload) => {
        if (!payload || typeof payload !== 'object') return null;
        const candidates = [];
        const push = (v) => {
          if (v == null) return;
          const s = String(v).trim();
          if (!s) return;
          candidates.push(s);
        };

        push(payload.errmsg);
        push(payload.errMsg);
        push(payload.message);
        push(payload.error);
        push(payload.errorMessage);
        push(payload.title);
        push(payload.detail);
        push(payload.reason);
        push(payload.code);
        push(payload?.d?.message);
        push(payload?.d?.error);
        push(payload?.d?.title);
        push(payload?.d?.detail);
        push(payload?.d?.reason);
        push(payload?.d?.errmsg);
        push(payload?.d?.errMsg);

        const arr = candidates.filter(Boolean);
        if (arr.length === 0) return null;
        return arr[0];
      };

      // TradeLocker sometimes returns HTTP 200 with an error payload shape:
      // { s: "error", errmsg: "..." } (no orderId). Treat this as a rejection.
      const tlStatus = typeof json?.s === 'string' ? String(json.s).trim().toLowerCase() : null;
      if (tlStatus && !['ok', 'success'].includes(tlStatus)) {
        const msg =
          extractMessageFromResponse(json) ||
          `TradeLocker returned status "${String(json.s).trim()}" without an orderId.`;
        const debugPath = getOrderDebugPath();
        this.lastError = msg;
        return {
          ok: false,
          error: `${msg} Debug: ${debugPath}`,
          code: classifyTradeLockerError({ status: post?.status, message: msg }) || undefined,
          requestedQty: quantityRequested,
          qty: quantity,
          resolvedSymbol,
          response: json
        };
      }

      const extractOrderIdFromResponse = (payload) => {
        if (!payload || typeof payload !== 'object') return null;
        const direct = pickFirst(payload, ['orderId', 'orderID', 'order_id', 'clientOrderId', 'clientOrderID']);
        if (direct != null) return direct;
        const fromD = payload?.d && typeof payload.d === 'object' ? pickFirst(payload.d, ['orderId', 'orderID', 'order_id']) : null;
        if (fromD != null) return fromD;
        const orderObj =
          payload?.order && typeof payload.order === 'object'
            ? payload.order
            : payload?.d?.order && typeof payload.d.order === 'object'
              ? payload.d.order
              : payload?.data && typeof payload.data === 'object'
                ? payload.data
                : null;
        if (orderObj) {
          const nested = pickFirst(orderObj, ['orderId', 'orderID', 'id', 'order_id', 'clientOrderId', 'clientOrderID']);
          if (nested != null) return nested;
        }
        const loose =
          payload?.d && typeof payload.d === 'object'
            ? pickFirst(payload.d, ['id'])
            : null;
        return loose;
      };

      const rawOrderId = extractOrderIdFromResponse(json);
      let orderIdStr = null;
      const parsedOrderId = parseNumberLoose(rawOrderId);
      if (parsedOrderId != null) orderIdStr = String(parsedOrderId);
      else if (rawOrderId != null) {
        const s = String(rawOrderId).trim();
        orderIdStr = s ? s : null;
      }

      const postCreatedAtMs = nowMs();
      const discoverOrderIdByTag = async () => {
        const tag = strategyId ? String(strategyId).slice(0, 64) : null;
        const normalizeSym = (v) => String(v || '').trim().toUpperCase();
        const symNeedle = normalizeSym(resolvedSymbol || symbol);
        const sideNeedle = orderSide === 'sell' ? 'SELL' : 'BUY';
        const typeNeedle = isLimit ? 'limit' : isStop ? 'stop' : 'market';
        const qtyNeedle = Number(quantity);
        const priceNeedle = isLimit
          ? (parseNumberLoose(body?.price) ?? parseNumberLoose(price) ?? null)
          : isStop
            ? (parseNumberLoose(body?.stopPrice) ?? parseNumberLoose(stopPrice ?? price) ?? null)
            : null;
        const slNeedle = sl != null && sl > 0 ? Number(sl) : null;
        const tpNeedle = tp != null && tp > 0 ? Number(tp) : null;

        const approxEq = (a, b) => {
          if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) return false;
          const aa = Number(a);
          const bb = Number(b);
          const tol = Math.max(1e-9, Math.abs(bb) * 0.0005);
          return Math.abs(aa - bb) <= tol;
        };

        const timeOk = (tMs) => {
          if (!Number.isFinite(Number(tMs))) return false;
          const dt = Math.abs(Number(tMs) - postCreatedAtMs);
          return dt <= 120_000;
        };

        const scoreOrder = (o) => {
          if (!o || typeof o !== 'object') return 0;
          const sym = normalizeSym(o.symbol);
          const side = String(o.side || '').trim().toUpperCase();
          const typeRaw = String(o.type || '').trim().toLowerCase();
          const type = typeRaw === 'limit' ? 'limit' : typeRaw === 'stop' ? 'stop' : 'market';
          const createdAtMs = o.createdAt ? Date.parse(String(o.createdAt)) : NaN;
          if (!timeOk(createdAtMs)) return 0;
          if (sym && symNeedle && sym !== symNeedle) return 0;
          if (side && side !== sideNeedle) return 0;
          if (type && type !== typeNeedle) return 0;

          let score = 0;
          if (tag && o.strategyId && String(o.strategyId) === tag) score += 2000;
          if (sym && sym === symNeedle) score += 200;
          if (side && side === sideNeedle) score += 120;
          if (type && type === typeNeedle) score += 60;

          if (Number.isFinite(qtyNeedle) && qtyNeedle > 0 && o.qty != null && approxEq(o.qty, qtyNeedle)) score += 80;
          if (priceNeedle != null && o.price != null && approxEq(o.price, priceNeedle)) score += 70;
          if (slNeedle != null && o.stopLoss != null && approxEq(o.stopLoss, slNeedle)) score += 40;
          if (tpNeedle != null && o.takeProfit != null && approxEq(o.takeProfit, tpNeedle)) score += 40;

          const dt = Math.abs(Number(createdAtMs) - postCreatedAtMs);
          if (Number.isFinite(dt)) score += Math.max(0, 60 - Math.floor(dt / 1000));

          return score;
        };

        const scorePosition = (p) => {
          if (!p || typeof p !== 'object') return 0;
          const sym = normalizeSym(p.symbol);
          const side = String(p.type || p.side || '').trim().toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
          const openTimeMs = p.openTime ? Date.parse(String(p.openTime)) : NaN;
          if (!timeOk(openTimeMs)) return 0;
          if (sym && symNeedle && sym !== symNeedle) return 0;
          if (side && side !== sideNeedle) return 0;

          let score = 0;
          if (tag && p.strategyId && String(p.strategyId) === tag) score += 2000;
          if (sym && sym === symNeedle) score += 200;
          if (side && side === sideNeedle) score += 120;

          if (Number.isFinite(qtyNeedle) && qtyNeedle > 0 && p.size != null && approxEq(Math.abs(Number(p.size)), qtyNeedle)) score += 60;
          if (slNeedle != null && p.stopLoss != null && approxEq(p.stopLoss, slNeedle)) score += 30;
          if (tpNeedle != null && p.takeProfit != null && approxEq(p.takeProfit, tpNeedle)) score += 30;

          const dt = Math.abs(Number(openTimeMs) - postCreatedAtMs);
          if (Number.isFinite(dt)) score += Math.max(0, 60 - Math.floor(dt / 1000));

          return score;
        };

        const found = { orderId: null, orderStatus: null, filledQty: null, remainingQty: null, positionId: null };
        const deadline = nowMs() + (isMarket ? 4500 : 3500);
        let attempt = 0;
        while (nowMs() < deadline && !found.orderId && !(found.filledQty != null && found.filledQty > 0)) {
          attempt += 1;
          try {
            await sleepMs(attempt === 1 ? 250 : 650);
          } catch { /* ignore */ }

          // For market orders, positions tend to appear faster than open-orders.
          if (isMarket) {
            try {
              const posRes = await this.getPositions();
              if (posRes?.ok && Array.isArray(posRes.positions)) {
                let best = null;
                let bestScore = 0;
                for (const p of posRes.positions) {
                  const sc = scorePosition(p);
                  if (sc > bestScore) {
                    bestScore = sc;
                    best = p;
                  }
                }
                if (best && bestScore >= 400) {
                  found.orderStatus = found.orderStatus || 'FILLED';
                  if (!found.positionId && best.id != null) found.positionId = String(best.id);
                  if (found.filledQty == null && best.size != null && Number.isFinite(Number(best.size))) {
                    const v = Math.abs(Number(best.size));
                    found.filledQty = v > 0 ? v : found.filledQty;
                  }
                  if (found.remainingQty == null) found.remainingQty = 0;
                }
              }
            } catch {
              // ignore
            }
          }

          try {
            const ordersRes = await this.getOrders();
            if (ordersRes?.ok && Array.isArray(ordersRes.orders)) {
              let best = null;
              let bestScore = 0;
              let secondScore = 0;
              for (const o of ordersRes.orders) {
                const sc = scoreOrder(o);
                if (sc > bestScore) {
                  secondScore = bestScore;
                  bestScore = sc;
                  best = o;
                } else if (sc > secondScore) {
                  secondScore = sc;
                }
              }

              const gap = bestScore - secondScore;
              if (best && bestScore >= 500 && (gap >= 120 || !secondScore)) {
                const id = best?.id != null ? String(best.id).trim() : '';
                if (id) {
                  found.orderId = id;
                  found.orderStatus = best?.status != null ? String(best.status) : found.orderStatus;
                  if (best?.filledQty != null && Number.isFinite(Number(best.filledQty))) found.filledQty = Number(best.filledQty);
                  if (best?.remainingQty != null && Number.isFinite(Number(best.remainingQty))) found.remainingQty = Number(best.remainingQty);
                  break;
                }
              }
            }
          } catch {
            // ignore
          }
        }
        return found;
      };

      // Best-effort: probe order details briefly to catch instant cancels/rejections and surface status.
      let orderStatus = null;
      let filledQty = null;
      let remainingQty = null;
      let positionId = null;
      let rejectReason = null;

      const normalizeStatus = (value) => String(value || '').trim().toUpperCase();
      const looksRejected = (s) =>
        s.includes('REJECT') || s.includes('DENIED') || s.includes('DENY') || s.includes('FAIL') || s.includes('ERROR');
      const looksCanceled = (s) =>
        s.includes('CANCEL') || s.includes('CANCELED') || s.includes('CANCELLED') || s.includes('EXPIRE') || s.includes('EXPIRED');
      const looksFilled = (s) => s.includes('FILL') || s.includes('EXECUT') || s.includes('DONE') || s.includes('COMPLETE');
      const looksClosed = (s) => s.includes('CLOSE') || s.includes('CLOSED');

      // If the initial response doesn't include an orderId, try to discover it by strategyId (and/or detect a filled position).
      if (!orderIdStr) {
        try {
          const discovered = await discoverOrderIdByTag();
          if (discovered?.orderId) orderIdStr = String(discovered.orderId);
          if (discovered?.orderStatus) orderStatus = String(discovered.orderStatus);
          if (discovered?.filledQty != null && Number.isFinite(Number(discovered.filledQty))) filledQty = Number(discovered.filledQty);
          if (discovered?.remainingQty != null && Number.isFinite(Number(discovered.remainingQty))) remainingQty = Number(discovered.remainingQty);
          if (discovered?.positionId != null) positionId = String(discovered.positionId);
        } catch {
          // ignore
        }
      }

      // If we still have no orderId, we can't query the order details endpoint; treat as a likely rejection/cancel for IOC market orders.
      if (!orderIdStr) {
        const s = normalizeStatus(orderStatus);
        const hasFillEvidence = (filledQty != null && filledQty > 0) || looksFilled(s);
        if (hasFillEvidence) {
          return {
            ok: true,
            orderId: null,
            orderStatus: orderStatus || 'FILLED',
            filledQty,
            remainingQty,
            positionId,
            requestedQty: quantityRequested,
            qty: quantity,
            resolvedSymbol,
            response: json
          };
        }
        const msg = extractMessageFromResponse(json);
        const hint = msg ? ` (${msg})` : (json ? '' : ' (empty response body)');
        const debugPath = getOrderDebugPath();
        return {
          ok: false,
          error: `TradeLocker order response did not include an orderId${hint}, and no matching order/position was detected. Debug: ${debugPath}`,
          code: classifyTradeLockerError({ status: post?.status, message: msg || hint }) || undefined,
          requestedQty: quantityRequested,
          qty: quantity,
          resolvedSymbol,
          response: json
        };
      }

      const probeDeadline = nowMs() + (isMarket ? 4500 : 2500);
      let probeAttempt = 0;
      while (nowMs() < probeDeadline) {
        const delayMs = probeAttempt === 0 ? 250 : 650;
        probeAttempt += 1;
        try {
          await sleepMs(delayMs);
        } catch {
          // ignore
        }

        try {
          const detail = await this.getOrderDetails({ orderId: orderIdStr });
          if (!detail?.ok) {
            if (detail?.rateLimited) break;
            continue;
          }

          orderStatus = detail.status != null ? String(detail.status) : orderStatus;
          if (detail.filledQty != null && Number.isFinite(Number(detail.filledQty))) filledQty = Number(detail.filledQty);
          if (detail.remainingQty != null && Number.isFinite(Number(detail.remainingQty))) remainingQty = Number(detail.remainingQty);
          rejectReason = detail.rejectReason != null ? String(detail.rejectReason) : rejectReason;

          // Best-effort: capture the resulting positionId quickly for market orders (helps downstream history/reconciliation).
          if (!positionId && isMarket && strategyId && probeAttempt <= 2) {
            try {
              const posRes = await this.getPositions().catch(() => null);
              if (posRes?.ok && Array.isArray(posRes.positions)) {
                const needle = String(strategyId).slice(0, 64);
                const matched = posRes.positions.find((p) => p?.strategyId && String(p.strategyId) === needle);
                if (matched?.id != null) positionId = String(matched.id);
              }
            } catch {
              // ignore
            }
          }

          const s = normalizeStatus(orderStatus);
          const filledSome = filledQty != null && filledQty > 0;
          const filledByStatus = looksFilled(s);
          const noFillConfirmed = (filledQty != null && filledQty <= 0) && (remainingQty != null && remainingQty > 0);
          const noFillEvidence =
            noFillConfirmed ||
            (filledQty != null && filledQty <= 0) ||
            (remainingQty != null && remainingQty > 0) ||
            (rejectReason != null && String(rejectReason).trim().length > 0);
          const cancelOrReject = looksRejected(s) || looksCanceled(s);
          const closed = looksClosed(s);
          const hasFillEvidence = filledSome || filledByStatus;
          const terminalNoFill = (cancelOrReject && !hasFillEvidence) || (closed && !hasFillEvidence && noFillEvidence);

          if (terminalNoFill) {
            const hint = rejectReason ? ` (${rejectReason})` : '';
            return {
              ok: false,
              error: `Order ${orderIdStr} was ${String(orderStatus || 'CANCELLED')}.${hint}`,
              orderId: orderIdStr,
              orderStatus,
              requestedQty: quantityRequested,
              qty: quantity,
              resolvedSymbol,
              response: json
            };
          }

          if (hasFillEvidence || closed) break;
        } catch {
          // ignore probe errors
        }
      }

      // If order details were unavailable (or ambiguous), try a single open orders/positions lookup.
      const statusAfterProbe = normalizeStatus(orderStatus);
      const filledAfterProbe = filledQty != null && filledQty > 0;
      const filledByStatusAfterProbe = looksFilled(statusAfterProbe);
      const hasFillEvidenceAfterProbe = filledAfterProbe || filledByStatusAfterProbe;
      const isClosedAfterProbe = looksClosed(statusAfterProbe);

      if ((!statusAfterProbe || statusAfterProbe === 'UNKNOWN') || (isClosedAfterProbe && !hasFillEvidenceAfterProbe)) {
        try {
          const ordersRes = await this.getOrders().catch(() => null);
          if (ordersRes?.ok && Array.isArray(ordersRes.orders)) {
            const found = ordersRes.orders.find((o) => String(o?.id || '') === orderIdStr);
            if (found) {
              if (found.status != null) orderStatus = String(found.status);
              if (found.filledQty != null && Number.isFinite(Number(found.filledQty))) filledQty = Number(found.filledQty);
              if (found.remainingQty != null && Number.isFinite(Number(found.remainingQty))) remainingQty = Number(found.remainingQty);
            }
          }
        } catch {
          // ignore
        }

        if (strategyId) {
          try {
            const posRes = await this.getPositions().catch(() => null);
            if (posRes?.ok && Array.isArray(posRes.positions)) {
              const needle = String(strategyId).slice(0, 64);
              const found = posRes.positions.find((p) => p?.strategyId && String(p.strategyId) === needle);
                if (found) {
                  if (!orderStatus) orderStatus = 'FILLED';
                  if (filledQty == null && found.size != null && Number.isFinite(Number(found.size))) {
                    const v = Math.abs(Number(found.size));
                    filledQty = v > 0 ? v : filledQty;
                  }
                  if (remainingQty == null) remainingQty = 0;
                  if (!positionId && found.id != null) positionId = String(found.id);
                }
              }
            } catch {
              // ignore
            }
          }
      }

      // If the broker reports a closed/cancelled terminal status and we can't detect any fill, surface it as an error.
      const finalStatus = normalizeStatus(orderStatus);
      const finalHasFill = (filledQty != null && filledQty > 0) || looksFilled(finalStatus);
      if (looksClosed(finalStatus) && !finalHasFill) {
        const hint = rejectReason ? ` (${rejectReason})` : '';
        return {
          ok: false,
          error: `Order ${orderIdStr} was ${String(orderStatus || 'CLOSED')}; no fill detected.${hint}`,
          code: classifyTradeLockerError({ status: post?.status, message: rejectReason || orderStatus }) || undefined,
          orderId: orderIdStr,
          orderStatus,
          requestedQty: quantityRequested,
          qty: quantity,
          resolvedSymbol,
          response: json
        };
      }

      return {
        ok: true,
        orderId: orderIdStr,
        orderStatus,
        filledQty,
        remainingQty,
        positionId,
        requestedQty: quantityRequested,
        qty: quantity,
        resolvedSymbol,
        response: json
      };
    } catch (e) {
      const msg = redactErrorMessage(e?.message || String(e));
      const status = typeof e?.status === 'number' ? e.status : null;
      const code = e?.code || classifyTradeLockerError({ status, message: msg }) || undefined;
      this.lastError = msg;
      return { ok: false, error: msg, code };
    }
  }

  async getSnapshot({ includeOrders = false } = {}) {
    const wantOrders = includeOrders === true;
    const cache = wantOrders ? this.snapshotCacheWithOrders : this.snapshotCache;
    const cacheAtMs = wantOrders ? this.snapshotCacheWithOrdersAtMs : this.snapshotCacheAtMs;

    const now = nowMs();
    const rateLimitedUntilMs = this.rateLimitedUntilMs || 0;
    if (rateLimitedUntilMs && now < rateLimitedUntilMs) {
      if (cache) {
        this.lastError = null;
        return { ok: true, ...cache, rateLimited: true, retryAtMs: rateLimitedUntilMs };
      }
      const retryInMs = rateLimitedUntilMs - now;
      return { ok: false, error: `TradeLocker rate limited. Retry in ${Math.ceil(retryInMs / 1000)}s.` };
    }

    if (cache && cacheAtMs && now - cacheAtMs < 1500) {
      return { ok: true, ...cache, cached: true };
    }

    const inFlight = wantOrders ? this.snapshotInFlightWithOrders : this.snapshotInFlight;
    if (inFlight) return inFlight;

    const promise = (async () => {
      try {
        const ordersPromise = wantOrders
          ? this.getOrders().catch((e) => ({ ok: false, error: redactErrorMessage(e?.message || String(e)), orders: [] }))
          : Promise.resolve(null);

        const [balanceRes, positionsRes, ordersRes] = await Promise.all([
          this.getBalanceFromAllAccounts(30_000),
          this.getPositions(),
          ordersPromise
        ]);

        const balance = parseNumberLoose(balanceRes?.balance) ?? 0;
        const rawPositions = Array.isArray(positionsRes?.positions) ? positionsRes.positions : [];
        const floatingPnl = rawPositions.reduce((acc, p) => acc + (parseNumberLoose(p?.pnl) ?? 0), 0);
        const equity = balance + floatingPnl;

        const snapshot = {
          balance,
          equity,
          positions: rawPositions,
          orders: ordersRes?.ok ? (ordersRes.orders || null) : null,
          ordersError: ordersRes && ordersRes.ok === false ? (ordersRes.error || 'Failed to load orders') : null
        };

        if (wantOrders) {
          this.snapshotCacheWithOrders = snapshot;
          this.snapshotCacheWithOrdersAtMs = nowMs();
        } else {
          this.snapshotCache = snapshot;
          this.snapshotCacheAtMs = nowMs();
        }

        this.lastError = null;
        this.rateLimitedUntilMs = 0;
        return { ok: true, ...snapshot };
      } catch (e) {
        const status = typeof e?.status === 'number' ? e.status : null;
        if (status === 429) {
          const retryAfterMs = typeof e?.retryAfterMs === 'number' ? e.retryAfterMs : null;
          const cooldownMs = retryAfterMs != null ? retryAfterMs : 15_000;
          this.rateLimitedUntilMs = Math.max(this.rateLimitedUntilMs || 0, nowMs() + cooldownMs);

          const fallback = wantOrders ? this.snapshotCacheWithOrders : this.snapshotCache;
          if (fallback) {
            this.lastError = null;
            return { ok: true, ...fallback, rateLimited: true, retryAtMs: this.rateLimitedUntilMs };
          }
          const msg = redactErrorMessage(e?.message || String(e));
          return { ok: false, error: msg, rateLimited: true, retryAtMs: this.rateLimitedUntilMs };
        }

        const msg = redactErrorMessage(e?.message || String(e));
        this.lastError = msg;
        return { ok: false, error: msg };
      } finally {
        if (wantOrders) this.snapshotInFlightWithOrders = null;
        else this.snapshotInFlight = null;
      }
    })();

    if (wantOrders) this.snapshotInFlightWithOrders = promise;
    else this.snapshotInFlight = promise;
    return promise;
  }

  async getAccountMetrics({ maxAgeMs = 5_000 } = {}) {
    if (!this.state.accountId) return { ok: false, error: 'TradeLocker accountId not set. Select an account first.' };

    const now = nowMs();
    const rateLimitedUntilMs = this.rateLimitedUntilMs || 0;
    if (rateLimitedUntilMs && now < rateLimitedUntilMs) {
      if (this.accountMetricsCache) {
        return { ok: true, ...this.accountMetricsCache, cached: true, rateLimited: true, retryAtMs: rateLimitedUntilMs };
      }
      const retryInMs = rateLimitedUntilMs - now;
      return { ok: false, error: `TradeLocker rate limited. Retry in ${Math.ceil(retryInMs / 1000)}s.` };
    }

    const cacheAge = now - (this.accountMetricsCacheAtMs || 0);
    if (this.accountMetricsCache && cacheAge >= 0 && cacheAge < Math.max(250, Number(maxAgeMs) || 0)) {
      return { ok: true, ...this.accountMetricsCache, cached: true };
    }

    if (this.accountMetricsInFlight) return this.accountMetricsInFlight;

    this.accountMetricsInFlight = (async () => {
      try {
        const [config, json] = await Promise.all([
          this.ensureConfig(),
          this.apiJson(`/trade/accounts/${this.state.accountId}/state`, { includeAccNum: true })
        ]);

        const columns = config?.d?.accountDetailsConfig?.columns || [];
        const row = Array.isArray(json?.d?.accountDetailsData) ? json.d.accountDetailsData : [];
        const mapped = mapRowToObject(row, columns);

        const balanceCandidate =
          this.findBestNumericField(mapped, columns, 'balance')?.value ??
          parseNumberLoose(pickFirst(mapped, ['balance', 'accountBalance', 'aaccountBalance', 'cash', 'cashBalance']));

        const equityCandidate =
          this.findBestNumericField(mapped, columns, 'equity')?.value ??
          parseNumberLoose(pickFirst(mapped, ['equity', 'accountEquity', 'netAssetValue', 'nav']));

        let balance = balanceCandidate ?? null;
        let equity = equityCandidate ?? null;

        const openGrossPnlCandidate =
          parseNumberLoose(
            pickFirst(mapped, [
              'openGrossPnL',
              'openGrossPnl',
              'openGrossPL',
              'openGrossPl',
              'openGrossPnlValue',
              'openPnL',
              'openPnl',
              'openPL',
              'openPl',
              'floatingPnl',
              'floatingProfit'
            ])
          ) ?? null;

        const openNetPnlCandidate =
          parseNumberLoose(
            pickFirst(mapped, [
              'openNetPnL',
              'openNetPnl',
              'openNetPL',
              'openNetPl',
              'openNetPnlValue'
            ])
          ) ?? null;

        // Fallback: /auth/jwt/all-accounts sometimes contains the most reliable account balance.
        let currency = null;
        try {
          const accounts = await this.ensureAllAccountsCache(60_000);
          const selected = this.findSelectedAccount(accounts);
          currency =
            selected?.currency ||
            selected?.accountCurrency ||
            selected?.baseCurrency ||
            null;
          const fallbackBalance = parseNumberLoose(selected?.aaccountBalance ?? selected?.accountBalance ?? selected?.balance);
          if (fallbackBalance != null && fallbackBalance > 0) {
            if (balance == null || balance <= 0) {
              balance = fallbackBalance;
            } else {
              const diff = Math.abs(balance - fallbackBalance);
              if (diff > Math.max(1, fallbackBalance * 0.001)) {
                balance = fallbackBalance;
              }
            }
          }
        } catch {
          // ignore fallback errors
        }

        const marginUsedCandidate =
          this.findNumericByKeywords(mapped, columns, {
            include: ['margin'],
            exclude: ['free', 'available', 'level', 'ratio', 'percent', 'pct'],
            prefer: ['used', 'margin', 'utilized']
          })?.value ?? null;

        const marginFreeCandidate =
          this.findNumericByKeywords(mapped, columns, {
            include: ['margin'],
            exclude: ['level', 'ratio', 'percent', 'pct'],
            prefer: ['free', 'available', 'remaining']
          })?.value ?? null;

        const equityFromOpenPnl =
          balance != null &&
          Number.isFinite(Number(balance)) &&
          (openNetPnlCandidate != null || openGrossPnlCandidate != null) &&
          Number.isFinite(Number(openNetPnlCandidate != null ? openNetPnlCandidate : openGrossPnlCandidate))
            ? Number(balance) + Number(openNetPnlCandidate != null ? openNetPnlCandidate : openGrossPnlCandidate)
            : null;

        const equityFromMargin =
          marginUsedCandidate != null &&
          marginFreeCandidate != null &&
          Number.isFinite(Number(marginUsedCandidate)) &&
          Number.isFinite(Number(marginFreeCandidate))
            ? Number(marginUsedCandidate) + Number(marginFreeCandidate)
            : null;

        if (equity == null || equity <= 0) {
          equity =
            equityFromMargin != null && equityFromMargin > 0
              ? equityFromMargin
              : equityFromOpenPnl != null && equityFromOpenPnl > 0
                ? equityFromOpenPnl
                : balance;
        } else if (equityFromMargin != null && equityFromMargin > 0 && Number.isFinite(Number(equity))) {
          const diff = Math.abs(Number(equity) - equityFromMargin);
          if (diff > Math.max(1, equityFromMargin * 0.001)) {
            equity = equityFromMargin;
          }
        }

        const marginLevelCandidate =
          this.findNumericByKeywords(mapped, columns, {
            include: ['margin'],
            exclude: ['free', 'available', 'used'],
            prefer: ['level', 'ratio', 'percent', 'pct']
          })?.value ?? null;

        const computedMarginLevel =
          marginLevelCandidate == null &&
          equity != null &&
          Number.isFinite(Number(equity)) &&
          marginUsedCandidate != null &&
          Number.isFinite(Number(marginUsedCandidate)) &&
          Number(marginUsedCandidate) > 0;

        const marginLevel = computedMarginLevel
          ? (Number(equity) / Number(marginUsedCandidate)) * 100
          : marginLevelCandidate;

        const payload = {
          accountId: this.state.accountId,
          accNum: this.state.accNum,
          currency,
          balance: balance ?? 0,
          equity: equity ?? balance ?? 0,
          openGrossPnl: openGrossPnlCandidate,
          openNetPnl: openNetPnlCandidate,
          marginUsed: marginUsedCandidate,
          marginFree: marginFreeCandidate,
          marginLevel,
          computedMarginLevel: !!computedMarginLevel,
          updatedAtMs: nowMs()
        };

        this.accountMetricsCache = payload;
        this.accountMetricsCacheAtMs = nowMs();
        this.lastError = null;
        this.rateLimitedUntilMs = 0;
        return { ok: true, ...payload };
      } catch (e) {
        const status = typeof e?.status === 'number' ? e.status : null;
        if (status === 429) {
          const retryAfterMs = typeof e?.retryAfterMs === 'number' ? e.retryAfterMs : null;
          const cooldownMs = retryAfterMs != null ? retryAfterMs : 15_000;
          this.rateLimitedUntilMs = Math.max(this.rateLimitedUntilMs || 0, nowMs() + cooldownMs);

          if (this.accountMetricsCache) {
            return { ok: true, ...this.accountMetricsCache, cached: true, rateLimited: true, retryAtMs: this.rateLimitedUntilMs };
          }
          const msg = redactErrorMessage(e?.message || String(e));
          return { ok: false, error: msg, rateLimited: true, retryAtMs: this.rateLimitedUntilMs };
        }

        const msg = redactErrorMessage(e?.message || String(e));
        this.lastError = msg;
        return { ok: false, error: msg };
      } finally {
        this.accountMetricsInFlight = null;
      }
    })();

    return this.accountMetricsInFlight;
  }
}

module.exports = {
  TradeLockerClient
};
