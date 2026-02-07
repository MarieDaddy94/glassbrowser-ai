const electron = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { TradeLockerClient } = require('./tradelocker.cjs');
const { BrokerRegistry, createTradeLockerAdapter, createSimAdapter } = require('./brokerRegistry.cjs');
const { NewsService } = require('./newsService.cjs');
const { CalendarService } = require('./calendarService.cjs');
const { runOneTimeProfileMigration: runOneTimeProfileMigrationRuntime } = require('./profileMigration.cjs');
const { loadKeychainSecretsWithFallback } = require('./keychainFallback.cjs');
let keytar = null;
try {
  keytar = require('keytar');
} catch {
  keytar = null;
}
let TradeLedgerCtor = null;
try {
  TradeLedgerCtor = require('./tradeLedgerSqlite.cjs').TradeLedgerSqlite;
} catch {
  TradeLedgerCtor = require('./tradeLedger.cjs').TradeLedger;
}

// If Electron is forced to run as Node (ELECTRON_RUN_AS_NODE),
// the package exports a binary path instead of the app API.
if (typeof electron === 'string' || !electron.app) {
  const { spawn } = require('child_process');
  const electronPath = typeof electron === 'string' ? electron : process.execPath;
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  spawn(electronPath, [path.join(__dirname, 'main.cjs')], { env, stdio: 'inherit' });
  process.exit(0);
}

const { app, BrowserWindow, ipcMain, shell, safeStorage, session } = electron;
let tradeLedger = null;

const MAIN_LOG_FILE = 'main.log';

function getMainLogPath() {
  try {
    const envBase = process.env.APPDATA || process.env.LOCALAPPDATA || process.cwd();
    const base = app?.getPath ? app.getPath('userData') : envBase;
    return path.join(base || envBase, MAIN_LOG_FILE);
  } catch {
    const envBase = process.env.APPDATA || process.env.LOCALAPPDATA || process.cwd();
    return path.join(envBase, MAIN_LOG_FILE);
  }
}

function appendMainLog(line) {
  try {
    fs.appendFileSync(getMainLogPath(), line);
  } catch {
    // ignore logging failures
  }
}

function recordCrash(kind, err) {
  const message = err?.stack || String(err);
  appendMainLog(`[${new Date().toISOString()}] ${kind}: ${message}\n`);
  try {
    if (tradeLedger?.append) {
      tradeLedger.append({
        kind: 'app_crash',
        schemaVersion: 'app_crash_v1',
        ts: Date.now(),
        source: 'main',
        status: 'error',
        payload: {
          kind,
          message: err?.message || String(err),
          stack: err?.stack || null
        }
      }).catch(() => {});
    }
  } catch {
    // ignore ledger failures
  }
}

process.on('uncaughtException', (err) => {
  recordCrash('uncaughtException', err);
});

process.on('unhandledRejection', (err) => {
  recordCrash('unhandledRejection', err);
});

function readMainLogTail(opts) {
  const maxLines = Number.isFinite(Number(opts?.maxLines)) ? Math.max(20, Math.floor(Number(opts.maxLines))) : 200;
  const maxBytes = Number.isFinite(Number(opts?.maxBytes)) ? Math.max(2000, Math.floor(Number(opts.maxBytes))) : 40000;
  const logPath = getMainLogPath();
  try {
    if (!fs.existsSync(logPath)) return { ok: false, error: 'Main log not found.' };
    const stats = fs.statSync(logPath);
    const size = Number(stats?.size || 0);
    if (!Number.isFinite(size) || size <= 0) return { ok: true, text: '', logPath };
    const readBytes = Math.min(size, maxBytes);
    const start = Math.max(0, size - readBytes);
    const buffer = Buffer.alloc(readBytes);
    const fd = fs.openSync(logPath, 'r');
    fs.readSync(fd, buffer, 0, readBytes, start);
    fs.closeSync(fd);
    const raw = buffer.toString('utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const tail = lines.length > maxLines ? lines.slice(-maxLines).join('\n') : raw;
    return { ok: true, text: tail, logPath };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

function listReleaseArtifacts(opts) {
  const includeHashes = opts?.includeHashes === true;
  const maxFiles = Number.isFinite(Number(opts?.maxFiles)) ? Math.max(10, Math.floor(Number(opts.maxFiles))) : 60;
  const maxHashBytes = 50 * 1024 * 1024;
  const roots = new Set();
  try { roots.add(process.cwd()); } catch {}
  try { roots.add(app.getAppPath()); } catch {}
  try { roots.add(path.dirname(app.getAppPath())); } catch {}

  const releases = [];
  const seen = new Set();
  let hashedBytes = 0;

  for (const root of roots) {
    if (!root || seen.has(root)) continue;
    seen.add(root);
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (!name.startsWith('release')) continue;
      const dirPath = path.join(root, name);
      const versionMatch = name.match(/release[-_]?v?(\d+\.\d+\.\d+)/i);
      const version = versionMatch ? versionMatch[1] : null;
      let files = [];
      try {
        const fileEntries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const file of fileEntries) {
          if (!file.isFile()) continue;
          const filePath = path.join(dirPath, file.name);
          const stat = fs.statSync(filePath);
          const info = {
            name: file.name,
            size: Number(stat?.size || 0),
            updatedAtMs: Number(stat?.mtimeMs || 0)
          };
          if (includeHashes && Number.isFinite(info.size) && info.size > 0 && hashedBytes + info.size <= maxHashBytes) {
            try {
              const hash = crypto.createHash('sha256');
              const buffer = fs.readFileSync(filePath);
              hash.update(buffer);
              info.sha256 = hash.digest('hex');
              hashedBytes += info.size;
            } catch {
              info.sha256 = null;
            }
          }
          files.push(info);
          if (files.length >= maxFiles) break;
        }
      } catch {
        files = [];
      }
      const updatedAtMs = files.reduce((acc, f) => Math.max(acc, Number(f.updatedAtMs || 0)), 0);
      releases.push({ name, version, path: dirPath, updatedAtMs, files });
    }
  }

  releases.sort((a, b) => Number(b.updatedAtMs || 0) - Number(a.updatedAtMs || 0));
  return { ok: true, releases };
}

function getAppMeta() {
  const migrationFiles = Array.isArray(startupMigrationStatus?.migrationFiles)
    ? startupMigrationStatus.migrationFiles.slice()
    : [];
  return {
    ok: true,
    meta: {
      name: app.getName(),
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      appPath: app.getAppPath(),
      userDataPath: app.getPath('userData'),
      mainLogPath: getMainLogPath(),
      platform: process.platform,
      arch: process.arch,
      electron: process.versions?.electron || null,
      chrome: process.versions?.chrome || null,
      node: process.versions?.node || null,
      migrationAttempted: !!startupMigrationStatus?.migrationAttempted,
      migrationApplied: !!startupMigrationStatus?.migrationApplied,
      migrationSource: startupMigrationStatus?.migrationSource || null,
      migrationFiles,
      migrationReason: startupMigrationStatus?.migrationReason || null
    }
  };
}

function getBundleStats() {
  const candidateRoots = [];
  try { candidateRoots.push(process.cwd()); } catch {}
  try { candidateRoots.push(app.getAppPath()); } catch {}
  try { candidateRoots.push(path.dirname(app.getAppPath())); } catch {}
  const seen = new Set();
  for (const root of candidateRoots) {
    if (!root || seen.has(root)) continue;
    seen.add(root);
    const statsPath = path.join(root, 'artifacts', 'bundle-stats.json');
    try {
      if (!fs.existsSync(statsPath)) continue;
      const raw = fs.readFileSync(statsPath, 'utf8');
      const parsed = JSON.parse(raw);
      const chunks = Array.isArray(parsed?.chunks) ? parsed.chunks : [];
      const summary = {
        measuredAtMs: Number(parsed?.measuredAtMs || 0) || null,
        appVersion: parsed?.appVersion || null,
        chunkCount: Number(parsed?.chunkCount || chunks.length || 0),
        indexRawBytes: Number((chunks.find((entry) => String(entry?.file || '').includes('index-')) || {}).rawBytes || 0) || null,
        backtesterRawBytes: Number((chunks.find((entry) => String(entry?.file || '').includes('BacktesterInterface-')) || {}).rawBytes || 0) || null,
        settingsRawBytes: Number((chunks.find((entry) => String(entry?.file || '').includes('SettingsModal-')) || {}).rawBytes || 0) || null
      };
      return { ok: true, path: statsPath, stats: parsed, summary };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }
  return { ok: false, error: 'Bundle stats not found.' };
}

const isDev = !app.isPackaged;
const IPC_ENVELOPE_FLAG = '__glassEnvelope';
const IPC_DOMAIN_BY_PREFIX = Object.freeze({
  tradelocker: 'tradelocker',
  broker: 'broker',
  tradeledger: 'tradeLedger',
  mt5bridge: 'mt5',
  secrets: 'secrets',
  openai: 'openai',
  gemini: 'gemini',
  codebase: 'codebase',
  agentrunner: 'agentRunner',
  news: 'news',
  calendar: 'calendar',
  diagnostics: 'diagnostics',
  glass: 'window',
  notes: 'notes'
});
const SECRETS_FILE = 'ai-secrets.json';
const DEFAULT_SECRETS = Object.freeze({
  version: 1,
  openai: { key: null },
  gemini: { key: null }
});
const KEYCHAIN_SERVICE = 'GlassBrowser AI';
const KEYCHAIN_SERVICE_FALLBACKS = Object.freeze([
  'glassbrowser-ai',
  'GlassBrowser AI Beta',
  'glassbrowser-ai-beta'
]);
const KEYCHAIN_ACCOUNTS = Object.freeze({
  openai: 'openai_api_key',
  gemini: 'gemini_api_key'
});
const keychainCache = {
  loaded: false,
  openai: null,
  gemini: null,
  openaiSource: null,
  geminiSource: null
};
const AGENT_RUNNER_DEFAULT_MODEL = String(process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_MODEL || 'gpt-5.2').trim();
const ENABLE_SANDBOX = process.env.GLASS_DISABLE_SANDBOX !== '1';
const ALLOWED_WEBVIEW_PROTOCOLS = new Set(['http:', 'https:', 'about:', 'blob:']);
const ALLOWED_PERMISSION_TYPES = new Set(['media', 'display-capture', 'clipboard-read', 'notifications']);
let startupMigrationStatus = {
  migrationAttempted: false,
  migrationApplied: false,
  migrationSource: null,
  migrationFiles: [],
  migrationReason: null
};

function runOneTimeProfileMigration() {
  let status;
  try {
    const currentUserDataPath = app.getPath('userData');
    status = runOneTimeProfileMigrationRuntime({
      currentUserDataPath,
      appendMainLog: (line) => appendMainLog(line),
      nowMs: () => Date.now()
    });
  } catch (err) {
    status = {
      migrationAttempted: true,
      migrationApplied: false,
      migrationSource: null,
      migrationFiles: [],
      migrationReason: `userData_unavailable:${err?.message || String(err)}`
    };
  }
  startupMigrationStatus = status;
  return status;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function inferIpcDomain(channel) {
  const prefix = String(channel || '').split(':')[0].toLowerCase();
  return IPC_DOMAIN_BY_PREFIX[prefix] || 'system';
}

function normalizeErrorMessage(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value && typeof value.message === 'string') return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function classifyIpcError({ message, domain, result }) {
  const text = String(message || '').toLowerCase();
  let code = 'GLASS_E_INTERNAL';
  let retryable = false;
  let suggestedAction = 'CONTACT_SUPPORT';

  if (text.includes('rate limit') || text.includes('too many requests') || text.includes('429')) {
    code = 'GLASS_E_RATE_LIMIT';
    retryable = true;
    suggestedAction = 'RETRY';
  } else if (text.includes('timeout')) {
    code = 'GLASS_E_TIMEOUT';
    retryable = true;
    suggestedAction = 'RETRY';
  } else if (text.includes('network') || text.includes('ecconn') || text.includes('enotfound') || text.includes('offline')) {
    code = 'GLASS_E_NETWORK';
    retryable = true;
    suggestedAction = 'CHECK_NETWORK';
  } else if (text.includes('unauthorized') || text.includes('401')) {
    code = 'GLASS_E_UNAUTHORIZED';
    suggestedAction = 'REAUTH';
  } else if (text.includes('forbidden') || text.includes('403')) {
    code = 'GLASS_E_FORBIDDEN';
    suggestedAction = 'REAUTH';
  } else if (text.includes('not found') || text.includes('404')) {
    code = 'GLASS_E_NOT_FOUND';
    suggestedAction = 'FIX_INPUT';
  } else if (text.includes('validation') || text.includes('invalid')) {
    code = 'GLASS_E_VALIDATION';
    suggestedAction = 'FIX_INPUT';
  } else if (domain === 'broker' || domain === 'tradelocker') {
    if (text.includes('rejected')) {
      code = 'GLASS_E_BROKER_REJECTED';
      suggestedAction = 'FIX_INPUT';
    } else if (text.includes('market closed')) {
      code = 'GLASS_E_MARKET_CLOSED';
      suggestedAction = 'RETRY';
    } else if (text.includes('insufficient') && text.includes('margin')) {
      code = 'GLASS_E_INSUFFICIENT_MARGIN';
      suggestedAction = 'FIX_INPUT';
    }
  }

  const retryAfterMs = Number.isFinite(Number(result?.retryAfterMs))
    ? Number(result.retryAfterMs)
    : Number.isFinite(Number(result?.retryAfter))
      ? Number(result.retryAfter)
      : null;

  if (result?.retryable === true) retryable = true;

  return { code, retryable, retryAfterMs, suggestedAction };
}

function buildErrorInfo({ message, domain, result }) {
  const { code, retryable, retryAfterMs, suggestedAction } = classifyIpcError({ message, domain, result });
  const details = isPlainObject(result?.details) ? result.details : null;
  return {
    code,
    message: message || 'Unknown error',
    domain,
    retryable,
    retryAfterMs,
    suggestedAction,
    details
  };
}

function buildIpcEnvelope({ channel, requestId, startedAtMs, result, error }) {
  if (result && result[IPC_ENVELOPE_FLAG]) return result;

  const ts = Date.now();
  const timingMs = Number.isFinite(Number(startedAtMs)) ? ts - startedAtMs : null;
  const base = isPlainObject(result) ? { ...result } : { result };
  const domain = inferIpcDomain(channel);

  let ok = typeof base.ok === 'boolean' ? base.ok : true;
  let errorMessage = '';

  if (error) {
    ok = false;
    errorMessage = normalizeErrorMessage(error);
  } else if (ok === false || base.error || base.errorMessage) {
    ok = false;
    errorMessage = normalizeErrorMessage(base.error || base.errorMessage || base.message);
  }

  const errorInfo = ok ? null : buildErrorInfo({ message: errorMessage, domain, result: base });
  const legacyError = typeof base.error === 'string' ? base.error : errorMessage || undefined;

  return {
    ...base,
    ok,
    data: base.data != null ? base.data : result,
    error: legacyError,
    errorMessage: legacyError,
    errorInfo,
    errorCode: base.errorCode || errorInfo?.code,
    retryable: base.retryable ?? errorInfo?.retryable,
    retryAfterMs: base.retryAfterMs ?? errorInfo?.retryAfterMs,
    op: channel,
    requestId: base.requestId || requestId || null,
    ts,
    timingMs,
    [IPC_ENVELOPE_FLAG]: true
  };
}

function extractRequestId(args) {
  if (!isPlainObject(args)) return null;
  const meta = isPlainObject(args.__meta) ? args.__meta : null;
  const rid =
    (meta && (meta.requestId || meta.reqId)) ||
    args.requestId ||
    args.__requestId ||
    args.reqId ||
    null;
  return rid ? String(rid) : null;
}

function buildRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
}

function unwrapIpcPayload(arg) {
  if (!isPlainObject(arg)) return { payload: arg, meta: null };
  const meta = isPlainObject(arg.__meta) ? arg.__meta : null;
  if (Object.prototype.hasOwnProperty.call(arg, 'payload')) {
    return { payload: arg.payload, meta };
  }
  if (!meta) return { payload: arg, meta: null };
  const { __meta, ...rest } = arg;
  return { payload: rest, meta };
}

const originalIpcHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => {
  return originalIpcHandle(channel, async (...ipcArgs) => {
    const startedAtMs = Date.now();
    const rawArg = ipcArgs[1];
    const { payload } = unwrapIpcPayload(rawArg);
    const requestId = extractRequestId(rawArg) || buildRequestId();
    try {
      const nextArgs = ipcArgs.length > 1 ? [ipcArgs[0], payload, ...ipcArgs.slice(2)] : ipcArgs;
      const result = await handler(...nextArgs);
      return buildIpcEnvelope({ channel, requestId, startedAtMs, result, error: null });
    } catch (error) {
      return buildIpcEnvelope({ channel, requestId, startedAtMs, result: null, error });
    }
  });
};

function safeParseUrl(raw) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function isAllowedWebviewUrl(raw) {
  const url = safeParseUrl(String(raw || '').trim());
  if (!url) return false;
  const proto = url.protocol;
  if (proto === 'about:') return url.href === 'about:blank';
  return ALLOWED_WEBVIEW_PROTOCOLS.has(proto);
}

function isAllowedAppNavigation(raw) {
  const url = safeParseUrl(String(raw || '').trim());
  if (!url) return false;
  if (url.protocol === 'file:') return true;
  if (!isDev) return false;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = `${url.hostname}:${url.port || ''}`.replace(/:$/, '');
  return host === 'localhost:3000' || host === '127.0.0.1:3000';
}

function isAllowedExternalUrl(raw) {
  const url = safeParseUrl(String(raw || '').trim());
  if (!url) return false;
  return url.protocol === 'http:' || url.protocol === 'https:';
}

function isAllowedPermissionRequest(permission, details, webContents) {
  const type = webContents?.getType?.() || 'unknown';
  if (type !== 'window') return false;
  const rawUrl = details?.requestingUrl || webContents?.getURL?.() || '';
  if (!isAllowedAppNavigation(rawUrl)) return false;
  const perm = String(permission || '').trim().toLowerCase();
  if (!ALLOWED_PERMISSION_TYPES.has(perm)) return false;
  return true;
}

const CODEBASE_DEFAULT_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.cjs',
  '.mjs',
  '.py',
  '.json',
  '.md',
  '.txt',
  '.yml',
  '.yaml',
  '.toml',
  '.sql',
  '.ini',
  '.cfg',
  '.ps1',
  '.sh',
  '.bat',
  '.html',
  '.css'
];
const CODEBASE_SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'release']);
const CODEBASE_SKIP_PREFIXES = ['release-', 'tmp-'];

function normalizeCodebaseExtensions(value, opts = {}) {
  if (opts.includeAll === true) return [];
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,;\n\r]/g)
      : [];
  const normalized = list
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (normalized.some((item) => item === '*' || item.toLowerCase() === 'all')) return [];
  const extensions = normalized.map((item) => (item.startsWith('.') ? item.toLowerCase() : `.${item.toLowerCase()}`));
  return extensions.length > 0 ? extensions : CODEBASE_DEFAULT_EXTENSIONS;
}

function isCodebaseDirSkipped(name, includeAll) {
  if (includeAll) return false;
  const lower = String(name || '').toLowerCase();
  if (!lower) return true;
  if (CODEBASE_SKIP_DIRS.has(lower)) return true;
  if (CODEBASE_SKIP_PREFIXES.some((prefix) => lower.startsWith(prefix))) return true;
  return false;
}

function isSubPath(parent, child) {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function resolveCodebaseRoot(rootOverride) {
  const appRoot = path.resolve(app.getAppPath());
  const envRootRaw = process.env.GLASS_CODEBASE_ROOT ? String(process.env.GLASS_CODEBASE_ROOT).trim() : '';
  const baseRoot = envRootRaw ? path.resolve(envRootRaw) : appRoot;
  let root = rootOverride ? String(rootOverride).trim() : '';
  if (!root) root = baseRoot;
  if (!path.isAbsolute(root)) root = path.resolve(baseRoot, root);
  const resolved = path.resolve(root);
  if (resolved !== baseRoot && !isSubPath(baseRoot, resolved)) {
    return { ok: false, error: 'Codebase root must stay within the app root.' };
  }
  return { ok: true, root: resolved, baseRoot };
}

async function listCodebaseFiles(root, opts = {}) {
  const maxResultsRaw = Number(opts.maxResults);
  const maxResults = Number.isFinite(maxResultsRaw) ? Math.max(1, Math.min(200000, Math.floor(maxResultsRaw))) : 10000;
  const includeAll = opts.includeAll === true;
  const extensions = new Set(normalizeCodebaseExtensions(opts.extensions, { includeAll }));
  const files = [];
  let truncated = false;

  const walk = async (dir) => {
    if (files.length >= maxResults) {
      truncated = true;
      return;
    }
    let entries = [];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= maxResults) {
        truncated = true;
        return;
      }
      const name = entry.name;
      if (entry.isDirectory()) {
        if (isCodebaseDirSkipped(name, includeAll)) continue;
        await walk(path.join(dir, name));
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(name).toLowerCase();
      if (extensions.size > 0 && !extensions.has(ext)) continue;
      files.push(path.relative(root, path.join(dir, name)));
    }
  };

  await walk(root);
  return { ok: true, files, truncated };
}

async function searchCodebase(root, opts = {}) {
  const query = String(opts.query || '').trim();
  if (!query) return { ok: false, error: 'Search query is required.' };
  const maxResultsRaw = Number(opts.maxResults);
  const maxResults = Number.isFinite(maxResultsRaw) ? Math.max(1, Math.min(5000, Math.floor(maxResultsRaw))) : 200;
  const contextLinesRaw = Number(opts.contextLines);
  const contextLines = Number.isFinite(contextLinesRaw) ? Math.max(0, Math.min(20, Math.floor(contextLinesRaw))) : 0;
  const regex = opts.regex === true;
  const caseSensitive = opts.caseSensitive === true;
  const includeAll = opts.includeAll === true;
  const maxFileBytesRaw = Number(opts.maxFileBytes || opts.maxBytes);
  const maxFileBytes = Number.isFinite(maxFileBytesRaw)
    ? Math.max(1024, Math.min(50 * 1024 * 1024, Math.floor(maxFileBytesRaw)))
    : 10 * 1024 * 1024;
  const maxFileResultsRaw = Number(opts.maxFileResults);
  const maxFileResults = Number.isFinite(maxFileResultsRaw)
    ? Math.max(1, Math.min(200000, Math.floor(maxFileResultsRaw)))
    : (includeAll ? 200000 : 10000);
  let matcher = null;
  if (regex) {
    try {
      matcher = new RegExp(query, caseSensitive ? 'g' : 'gi');
    } catch (e) {
      return { ok: false, error: e?.message ? String(e.message) : 'Invalid regex pattern.' };
    }
  }

  const { ok, files, error } = await listCodebaseFiles(root, {
    extensions: opts.extensions,
    maxResults: maxFileResults,
    includeAll
  });
  if (!ok) return { ok: false, error: error || 'Failed to list files.' };
  const matches = [];
  let truncated = false;

  for (const relPath of files) {
    if (matches.length >= maxResults) {
      truncated = true;
      break;
    }
    const absPath = path.resolve(root, relPath);
    let stat;
    try {
      stat = await fs.promises.stat(absPath);
    } catch {
      continue;
    }
    if (!stat || stat.size > maxFileBytes) continue;
    let content = '';
    try {
      content = await fs.promises.readFile(absPath, 'utf8');
    } catch {
      continue;
    }
    if (content.includes('\u0000')) continue;
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (matches.length >= maxResults) {
        truncated = true;
        break;
      }
      const lineText = lines[i];
      let found = null;
      if (regex && matcher) {
        matcher.lastIndex = 0;
        const hit = matcher.exec(lineText);
        if (hit) found = { index: hit.index, text: hit[0] };
      } else {
        const haystack = caseSensitive ? lineText : lineText.toLowerCase();
        const needle = caseSensitive ? query : query.toLowerCase();
        const idx = haystack.indexOf(needle);
        if (idx >= 0) found = { index: idx, text: needle };
      }
      if (!found) continue;
      const start = Math.max(0, i - contextLines);
      const end = Math.min(lines.length - 1, i + contextLines);
      const context =
        contextLines > 0 ? lines.slice(start, end + 1).join('\n') : lineText;
      matches.push({
        path: relPath,
        line: i + 1,
        column: found.index + 1,
        preview: context
      });
    }
  }

  return {
    ok: true,
    matches,
    truncated,
    fileCount: files.length,
    query,
    regex,
    caseSensitive
  };
}

async function readCodebaseFile(root, opts = {}) {
  const relPath = String(opts.path || '').trim();
  if (!relPath) return { ok: false, error: 'File path is required.' };
  const absPath = path.resolve(root, relPath);
  if (!isSubPath(root, absPath) && absPath !== root) {
    return { ok: false, error: 'File path is outside the codebase root.' };
  }
  let content = '';
  try {
    content = await fs.promises.readFile(absPath, 'utf8');
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : 'Failed to read file.' };
  }
  const lines = content.split(/\r?\n/);
  const totalLines = lines.length;
  const startLineRaw = Number(opts.startLine);
  const endLineRaw = Number(opts.endLine);
  const maxLinesRaw = Number(opts.maxLines || opts.maxResults);
  const fullFile = opts.fullFile === true || maxLinesRaw === 0;
  const maxLines = fullFile
    ? totalLines
    : Number.isFinite(maxLinesRaw)
      ? Math.max(1, Math.min(20000, Math.floor(maxLinesRaw)))
      : 500;

  let startLine = Number.isFinite(startLineRaw) ? Math.max(1, Math.floor(startLineRaw)) : 1;
  let endLine = Number.isFinite(endLineRaw) ? Math.max(startLine, Math.floor(endLineRaw)) : startLine + maxLines - 1;
  if (endLine - startLine + 1 > maxLines) endLine = startLine + maxLines - 1;
  if (endLine > totalLines) endLine = totalLines;
  if (startLine > totalLines) startLine = Math.max(1, totalLines - maxLines + 1);

  const slice = lines.slice(startLine - 1, endLine);
  return {
    ok: true,
    path: relPath,
    content: slice.join('\n'),
    startLine,
    endLine,
    totalLines
  };
}

async function traceCodebaseDataflow(root, opts = {}) {
  const source = String(opts.source || '').trim();
  const sink = String(opts.sink || '').trim();
  if (!source && !sink) return { ok: false, error: 'Source or sink is required.' };
  const maxResultsRaw = Number(opts.maxResults);
  const maxResults = Number.isFinite(maxResultsRaw) ? Math.max(1, Math.min(2000, Math.floor(maxResultsRaw))) : 100;
  const includeAll = opts.includeAll === true;
  const extensions = opts.extensions;
  const sourceResults = source
    ? await searchCodebase(root, { query: source, regex: false, caseSensitive: false, maxResults, extensions, includeAll })
    : null;
  const sinkResults = sink
    ? await searchCodebase(root, { query: sink, regex: false, caseSensitive: false, maxResults, extensions, includeAll })
    : null;

  const sourceMatches = sourceResults?.ok ? sourceResults.matches : [];
  const sinkMatches = sinkResults?.ok ? sinkResults.matches : [];
  const sourceFiles = new Set(sourceMatches.map((m) => m.path));
  const sinkFiles = new Set(sinkMatches.map((m) => m.path));
  const overlap = [];
  for (const file of sourceFiles) {
    if (sinkFiles.has(file)) overlap.push(file);
    if (overlap.length >= maxResults) break;
  }

  return {
    ok: true,
    source,
    sink,
    sourceMatches,
    sinkMatches,
    overlap,
    truncated: (sourceResults && sourceResults.truncated) || (sinkResults && sinkResults.truncated) || false
  };
}

appendMainLog(`[${new Date().toISOString()}] main start pid=${process.pid}\n`);
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  appendMainLog(`[${new Date().toISOString()}] single instance lock failed; exiting.\n`);
  app.quit();
} else {
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    appendMainLog(`[${new Date().toISOString()}] second-instance: no window; creating.\n`);
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});
}

let mt5BridgeProcess = null;
let mt5BridgeLogStream = null;
let mt5BridgeEnsureTimer = null;
let mt5BridgeRestartTimer = null;
let mt5BridgeStartInFlight = null;
let mt5BridgeLastStartError = null;
let isQuitting = false;
let tradeLockerClient = null;
tradeLedger = null;
let brokerRegistry = null;
let newsService = null;
let calendarService = null;
let tradeLockerStreamUnsub = null;
let telegramPoller = {
  active: false,
  token: '',
  chatIds: new Set(),
  lastUpdateId: 0,
  timer: null,
  inFlight: false,
  backoffMs: 1000
};

function ensureNewsService() {
  if (!newsService) {
    newsService = new NewsService();
    appendMainLog(`[${new Date().toISOString()}] NewsService lazy-init.\n`);
  }
  return newsService;
}

function ensureCalendarService() {
  if (!calendarService) {
    calendarService = new CalendarService();
    appendMainLog(`[${new Date().toISOString()}] CalendarService lazy-init.\n`);
  }
  return calendarService;
}

app.on('web-contents-created', (_event, contents) => {
  const type = contents.getType();

  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      try { shell.openExternal(url); } catch {}
    }
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    if (type === 'window') {
      if (!isAllowedAppNavigation(url)) event.preventDefault();
      return;
    }
    if (type === 'webview' && !isAllowedWebviewUrl(url)) {
      event.preventDefault();
    }
  });

  if (type === 'window') {
    contents.on('will-attach-webview', (event, webPreferences, params) => {
      if (!isAllowedWebviewUrl(params?.src)) {
        event.preventDefault();
        return;
      }

      if (params?.partition && params.partition !== 'persist:glass') {
        event.preventDefault();
        return;
      }

      // Enforce safest possible guest settings.
      delete webPreferences.preload;
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      webPreferences.enableRemoteModule = false;
      webPreferences.webSecurity = true;
      webPreferences.allowRunningInsecureContent = false;
      webPreferences.safeDialogs = true;
    });
  }
});

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeTelegramChatIds(input) {
  if (Array.isArray(input)) {
    return input.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  const raw = String(input || '').trim();
  if (!raw) return [];
  return raw.split(/[,\s]+/g).map((entry) => entry.trim()).filter(Boolean);
}

function resolveTelegramChatId(update) {
  const msg = update?.message || update?.edited_message || update?.channel_post || update?.edited_channel_post;
  let chatId = msg?.chat?.id;
  if (chatId == null) {
    const callback = update?.callback_query;
    chatId = callback?.message?.chat?.id ?? callback?.from?.id ?? null;
  }
  if (chatId == null) return null;
  return String(chatId).trim();
}

function parseTelegramDataUrl(dataUrl) {
  const raw = String(dataUrl || '').trim();
  if (!raw) return null;
  const match = raw.match(/^data:(.+?);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

const AGENT_RUNNER_TOOL = {
  type: 'function',
  name: 'proposeTrade',
  description: 'Propose a trading setup. Use this only when the signal is strong.',
  parameters: {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'The ticker symbol (e.g., EURUSD, BTCUSD)' },
      action: { type: 'string', description: 'BUY or SELL' },
      entryPrice: { type: 'number', description: 'The proposed entry price' },
      stopLoss: { type: 'number', description: 'The stop loss price level' },
      takeProfit: { type: 'number', description: 'The take profit price level' },
      reason: { type: 'string', description: 'Brief reason for taking the trade.' }
    },
    required: ['symbol', 'action', 'entryPrice', 'stopLoss', 'takeProfit', 'reason']
  }
};

const agentRunnerState = {
  activeSymbols: new Map(),
  agentRate: new Map(),
  activeSessions: new Map(),
  lastRunAtMs: null
};

function normalizeAgentSymbolKey(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function clampAgentText(value, max = 1400) {
  const raw = String(value || '');
  if (raw.length <= max) return raw;
  return `${raw.slice(0, Math.max(0, max - 3))}...`;
}

function formatAgentQuote(quote) {
  if (!quote || typeof quote !== 'object') return '';
  const bid = Number(quote.bid);
  const ask = Number(quote.ask);
  const mid = Number(quote.mid);
  const spread = Number(quote.spread);
  const parts = [
    Number.isFinite(bid) ? `bid ${bid}` : '',
    Number.isFinite(ask) ? `ask ${ask}` : '',
    Number.isFinite(mid) ? `mid ${mid}` : '',
    Number.isFinite(spread) ? `spread ${spread}` : ''
  ].filter(Boolean);
  return parts.join(' | ');
}

function buildAgentRunnerPrompt(input) {
  const signal = input?.signal || {};
  const watcher = input?.watcher || null;
  const symbol = String(input?.symbol || signal.symbol || watcher?.symbol || '').trim();
  const timeframe = String(input?.timeframe || signal.timeframe || watcher?.timeframe || '').trim();
  const strategy = String(input?.strategy || signal?.payload?.strategy || watcher?.strategy || '').trim();
  const details = signal?.payload?.details && typeof signal.payload.details === 'object'
    ? signal.payload.details
    : {};
  const sideRaw = String(signal?.payload?.side || signal?.payload?.action || '').toUpperCase();
  const side = sideRaw === 'SELL' ? 'SELL' : sideRaw === 'BUY' ? 'BUY' : '';
  const entryPrice = Number(details.entryPrice);
  const stopLoss = Number(details.stopLoss);
  const takeProfit = Number(details.takeProfit);
  const signalType = signal?.payload?.signalType || null;
  const quoteLine = formatAgentQuote(input?.quote);
  const promptLines = [
    'Evaluate the setup signal and decide if it should trade.',
    'If you want to trade, call proposeTrade with symbol, action, entryPrice, stopLoss, takeProfit, and reason.',
    'If you do NOT want to trade, reply with "NO_TRADE: <reason>" only.',
    `Signal: ${signalType || 'setup_signal'} ${side || ''}`.trim(),
    symbol ? `Symbol: ${symbol}` : '',
    timeframe ? `Timeframe: ${timeframe}` : '',
    strategy ? `Strategy: ${strategy}` : '',
    Number.isFinite(entryPrice) ? `Entry: ${entryPrice}` : '',
    Number.isFinite(stopLoss) ? `Stop: ${stopLoss}` : '',
    Number.isFinite(takeProfit) ? `TP: ${takeProfit}` : '',
    watcher?.id ? `Watcher: ${watcher.id}` : '',
    quoteLine ? `Quote: ${quoteLine}` : ''
  ].filter(Boolean);
  return {
    prompt: clampAgentText(promptLines.join('\n')),
    symbol,
    timeframe,
    strategy
  };
}

function buildAgentRunnerSystemContext(agent, context) {
  const systemParts = [];
  const instruction = agent?.systemInstruction ? String(agent.systemInstruction).trim() : '';
  if (instruction) systemParts.push(instruction);
  const ctx = context ? String(context) : '';
  if (ctx) systemParts.push(ctx);
  return systemParts.join('\n\n');
}

function parseAgentRunnerResponse(data) {
  if (!data || typeof data !== 'object') return { text: '', proposal: null };
  const outputItems = Array.isArray(data.output) ? data.output : [];
  let responseText = data.output_text || '';

  if (!responseText) {
    const msgItem = outputItems.find((o) => o.type === 'message' && o.role === 'assistant');
    if (msgItem?.content) {
      if (typeof msgItem.content === 'string') {
        responseText = msgItem.content;
      } else if (Array.isArray(msgItem.content)) {
        responseText = msgItem.content
          .filter((p) => String(p?.type || '').includes('text'))
          .map((p) => p.text || p.output_text || '')
          .join('');
      }
    }
  }

  let proposal = null;
  for (const item of outputItems) {
    const type = item?.type;
    if (type !== 'function_call' && type !== 'tool_call') continue;
    const name = item?.name || item?.function?.name;
    if (name !== 'proposeTrade') continue;
    const args = safeJsonParse(item?.arguments || item?.args || item?.function?.arguments) || {};
    const actionRaw = String(args.action || '').toUpperCase();
    const action = actionRaw === 'SELL' ? 'SELL' : 'BUY';
    const entryPrice = Number(args.entryPrice);
    const stopLoss = Number(args.stopLoss);
    const takeProfit = Number(args.takeProfit);
    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(takeProfit - entryPrice);
    const rr = Number.isFinite(risk) && risk > 0 ? Number((reward / risk).toFixed(2)) : 0;
    proposal = {
      symbol: args.symbol,
      action,
      entryPrice,
      stopLoss,
      takeProfit,
      riskRewardRatio: rr,
      status: 'PENDING',
      reason: args.reason || 'Agent decision'
    };
    if (!responseText) {
      responseText = `Trade proposal: ${action} ${args.symbol}`;
    }
    break;
  }

  return { text: String(responseText || '').trim(), proposal };
}

function getSecretsPath() {
  return path.join(app.getPath('userData'), SECRETS_FILE);
}

function normalizeSecrets(raw) {
  const base = { ...DEFAULT_SECRETS, openai: { key: null }, gemini: { key: null } };
  if (!raw || typeof raw !== 'object') return base;
  const merged = {
    version: typeof raw.version === 'number' ? raw.version : base.version,
    openai: {
      key: raw?.openai?.key ? String(raw.openai.key) : null
    },
    gemini: {
      key: raw?.gemini?.key ? String(raw.gemini.key) : null
    }
  };
  return merged;
}

function loadSecrets() {
  const filePath = getSecretsPath();
  try {
    if (!fs.existsSync(filePath)) return normalizeSecrets(null);
    const text = fs.readFileSync(filePath, 'utf8');
    const parsed = safeJsonParse(text);
    return normalizeSecrets(parsed);
  } catch {
    return normalizeSecrets(null);
  }
}

function persistSecrets(next) {
  const filePath = getSecretsPath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8');
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), path: filePath };
  }
}

function isKeychainAvailable() {
  return !!keytar && typeof keytar.getPassword === 'function' && typeof keytar.setPassword === 'function';
}

async function loadKeychainSecrets() {
  keychainCache.loaded = true;
  if (!isKeychainAvailable()) {
    return { ok: false, error: 'Keychain unavailable.' };
  }
  try {
    const loaded = await loadKeychainSecretsWithFallback({
      keytar,
      primaryService: KEYCHAIN_SERVICE,
      fallbackServices: KEYCHAIN_SERVICE_FALLBACKS,
      accounts: KEYCHAIN_ACCOUNTS
    });
    if (!loaded?.ok) {
      return { ok: false, error: loaded?.error || 'Failed to load keychain secrets.' };
    }
    keychainCache.openai = loaded?.values?.openai || null;
    keychainCache.gemini = loaded?.values?.gemini || null;
    keychainCache.openaiSource = loaded?.sources?.openai || null;
    keychainCache.geminiSource = loaded?.sources?.gemini || null;
    return {
      ok: true,
      openai: !!keychainCache.openai,
      gemini: !!keychainCache.gemini,
      sources: {
        openai: keychainCache.openaiSource,
        gemini: keychainCache.geminiSource
      },
      promoted: Array.isArray(loaded?.promoted) ? loaded.promoted : []
    };
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : 'Failed to load keychain secrets.' };
  }
}

function encryptSecret(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!safeStorage?.isEncryptionAvailable?.()) return null;
  try {
    const buf = safeStorage.encryptString(raw);
    return buf.toString('base64');
  } catch {
    return null;
  }
}

function decryptSecret(base64) {
  const raw = String(base64 || '').trim();
  if (!raw) return null;
  if (!safeStorage?.isEncryptionAvailable?.()) return null;
  try {
    const buf = Buffer.from(raw, 'base64');
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

async function migrateSecretsToKeychain() {
  if (!isKeychainAvailable()) {
    return { ok: false, error: 'Keychain unavailable.' };
  }
  const next = { ...secretsState };
  let migrated = false;
  const kinds = ['openai', 'gemini'];
  for (const kind of kinds) {
    if (keychainCache[kind]) continue;
    const stored = next?.[kind]?.key;
    if (!stored) continue;
    const decrypted = decryptSecret(stored);
    if (!decrypted) continue;
    try {
      await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNTS[kind], decrypted);
      keychainCache[kind] = decrypted;
      keychainCache[`${kind}Source`] = 'keychain';
      next[kind] = { key: null };
      migrated = true;
    } catch {
      // keep existing encrypted secret as fallback
    }
  }

  if (migrated) {
    secretsState = next;
    persistSecrets(next);
  }
  return { ok: true, migrated };
}

async function setSecretValue(kind, value) {
  const trimmed = String(value || '').trim();
  const next = { ...secretsState };

  if (isKeychainAvailable()) {
    try {
      if (!trimmed) {
        await keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNTS[kind]);
        keychainCache[kind] = null;
        keychainCache[`${kind}Source`] = null;
      } else {
        await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNTS[kind], trimmed);
        keychainCache[kind] = trimmed;
        keychainCache[`${kind}Source`] = 'keychain';
      }
      keychainCache.loaded = true;
    } catch (e) {
      return { ok: false, error: e?.message ? String(e.message) : 'Keychain write failed.' };
    }

    next[kind] = { key: null };
    secretsState = next;
    const persisted = persistSecrets(next);
    return {
      ok: persisted.ok,
      saved: persisted.ok,
      cleared: !trimmed,
      storage: 'keychain',
      error: persisted.error
    };
  }

  if (!trimmed) {
    next[kind] = { key: null };
    secretsState = next;
    const persisted = persistSecrets(next);
    return { ok: persisted.ok, cleared: true, error: persisted.error, storage: 'encrypted' };
  }
  if (!safeStorage?.isEncryptionAvailable?.()) {
    return { ok: false, error: 'Secure storage is unavailable on this system.' };
  }
  const encrypted = encryptSecret(trimmed);
  if (!encrypted) return { ok: false, error: 'Failed to encrypt secret.' };
  next[kind] = { key: encrypted };
  secretsState = next;
  const persisted = persistSecrets(next);
  return { ok: persisted.ok, saved: persisted.ok, error: persisted.error, storage: 'encrypted' };
}

function getSecretValue(kind) {
  const cached = keychainCache[kind];
  if (cached) return cached;
  const stored = secretsState?.[kind]?.key;
  if (!stored) return null;
  return decryptSecret(stored);
}

function getOpenAIKey() {
  const stored = getSecretValue('openai');
  if (stored) return stored;
  const env = (process.env.OPENAI_API_KEY || process.env.API_KEY || '').trim();
  return env || null;
}

function getGeminiKey() {
  const stored = getSecretValue('gemini');
  if (stored) return stored;
  const env = (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
  return env || null;
}

let secretsState = loadSecrets();

async function readJsonOrText(res) {
  const text = await res.text();
  return { text, json: safeJsonParse(text) };
}

function generateStreamId() {
  return `s_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function* iterateSseData(readableStream) {
  if (!readableStream || typeof readableStream.getReader !== 'function') return;

  const decoder = new TextDecoder();
  const reader = readableStream.getReader();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

    while (true) {
      const sepIdx = buffer.indexOf('\n\n');
      if (sepIdx === -1) break;

      const raw = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);

      const lines = raw.split('\n');
      const dataLines = lines
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart());

      if (dataLines.length === 0) continue;
      const data = dataLines.join('\n').trim();
      if (!data) continue;
      yield data;
    }
  }

  const tail = buffer.trim();
  if (tail) yield tail;
}

function getMt5BridgePort() {
  const raw = (process.env.MT5_BRIDGE_PORT || '').trim();
  const parsed = Number.parseInt(raw || '8001', 10);
  if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) return parsed;
  return 8001;
}

function getBackendBasePath() {
  return isDev ? path.join(__dirname, '..') : process.resourcesPath;
}

function getMt5BridgeScriptPath() {
  const base = getBackendBasePath();
  return path.join(base, 'backend', 'mt5_bridge', 'app.py');
}

function appendMt5Log(line) {
  try {
    if (mt5BridgeLogStream) mt5BridgeLogStream.write(line);
  } catch {
    // ignore logging errors
  }
}

function checkHealth(url, timeoutMs = 1200) {
  return new Promise((resolve) => {
    try {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(timeoutMs, () => {
        try { req.destroy(); } catch { /* ignore */ }
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

function scheduleMt5BridgeRestart(reason = 'unknown') {
  if (isQuitting) return;
  if (mt5BridgeRestartTimer) return;
  mt5BridgeRestartTimer = setTimeout(() => {
    mt5BridgeRestartTimer = null;
    appendMt5Log(`[${new Date().toISOString()}] Restarting MT5 bridge (reason=${reason})\n`);
    startMt5Bridge().catch(() => {});
  }, 1500);
}

function startMt5BridgeWatchdog() {
  if (mt5BridgeEnsureTimer) return;
  mt5BridgeEnsureTimer = setInterval(() => {
    startMt5Bridge().catch(() => {});
  }, 15000);
}

function stopMt5BridgeWatchdog() {
  if (mt5BridgeEnsureTimer) {
    clearInterval(mt5BridgeEnsureTimer);
    mt5BridgeEnsureTimer = null;
  }
  if (mt5BridgeRestartTimer) {
    clearTimeout(mt5BridgeRestartTimer);
    mt5BridgeRestartTimer = null;
  }
}

async function spawnWithCandidates(candidates, args, options) {
  let lastError = null;
  for (const cmd of candidates) {
    try {
      const child = spawn(cmd, args, options);
      await new Promise((resolve, reject) => {
        const onError = (err) => reject(err);
        const onSpawn = () => resolve();
        child.once('error', onError);
        child.once('spawn', onSpawn);
      });
      return { child, cmd, lastError: null };
    } catch (err) {
      lastError = err;
      appendMt5Log(`[${new Date().toISOString()}] Failed to spawn ${cmd}: ${String(err)}\n`);
    }
  }
  return { child: null, cmd: null, lastError };
}

async function startMt5Bridge() {
  const port = getMt5BridgePort();
  if (process.env.GLASS_DISABLE_MT5_BRIDGE === '1') {
    return { ok: false, port, error: 'MT5 bridge disabled' };
  }
  if (mt5BridgeProcess) return { ok: true, port, healthy: null, started: false };
  if (mt5BridgeStartInFlight) return mt5BridgeStartInFlight;

  mt5BridgeStartInFlight = (async () => {
    const healthUrl = `http://127.0.0.1:${port}/health`;
    const alreadyRunning = await checkHealth(healthUrl);
    if (alreadyRunning) {
      mt5BridgeLastStartError = null;
      return { ok: true, port, healthy: true, started: false };
    }

    const scriptPath = getMt5BridgeScriptPath();
    const cwd = getBackendBasePath();

    if (!fs.existsSync(scriptPath)) {
      const msg = `MT5 bridge script not found: ${scriptPath}`;
      mt5BridgeLastStartError = msg;
      appendMt5Log(`[${new Date().toISOString()}] ${msg}\n`);
      return { ok: false, port, error: msg };
    }

    const logPath = path.join(app.getPath('userData'), 'mt5-bridge.log');
    try {
      mt5BridgeLogStream = fs.createWriteStream(logPath, { flags: 'a' });
      appendMt5Log(`\n\n[${new Date().toISOString()}] Starting MT5 bridge (port ${port})\n`);
      appendMt5Log(`[${new Date().toISOString()}] Script: ${scriptPath}\n`);
    } catch {
      mt5BridgeLogStream = null;
    }

    const env = { ...process.env };
    env.MT5_BRIDGE_PORT = String(port);

    const candidates = [
      (process.env.GLASS_MT5_PYTHON || '').trim(),
      'python',
      'py',
    ].filter(Boolean);

    const { child, cmd, lastError } = await spawnWithCandidates(
      candidates,
      [scriptPath],
      { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }
    );

    if (!child) {
      const msg = `Could not start bridge. Last error: ${String(lastError)}`;
      mt5BridgeLastStartError = msg;
      appendMt5Log(`[${new Date().toISOString()}] ${msg}\n`);
      return { ok: false, port, error: msg };
    }

    appendMt5Log(`[${new Date().toISOString()}] Spawned: ${cmd} ${scriptPath}\n`);
    mt5BridgeLastStartError = null;
    mt5BridgeProcess = child;

    child.stdout?.on('data', (buf) => {
      const text = buf.toString();
      appendMt5Log(text);
      if (isDev) process.stdout.write(text);
    });

    child.stderr?.on('data', (buf) => {
      const text = buf.toString();
      appendMt5Log(text);
      if (isDev) process.stderr.write(text);
    });

    child.on('error', (err) => {
      appendMt5Log(`[${new Date().toISOString()}] Bridge process error: ${String(err)}\n`);
      scheduleMt5BridgeRestart('process_error');
    });

    child.on('exit', (code, signal) => {
      appendMt5Log(`[${new Date().toISOString()}] Bridge exited (code=${code}, signal=${signal})\n`);
      mt5BridgeProcess = null;
      scheduleMt5BridgeRestart('process_exit');
    });

    const healthy = await checkHealth(healthUrl, 1800);
    return { ok: true, port, healthy, started: true };
  })();

  try {
    return await mt5BridgeStartInFlight;
  } finally {
    mt5BridgeStartInFlight = null;
  }
}

function stopMt5Bridge() {
  const child = mt5BridgeProcess;
  mt5BridgeProcess = null;
  if (child) {
    try {
      child.kill();
      appendMt5Log(`[${new Date().toISOString()}] Sent kill to bridge\n`);
    } catch {
      // ignore
    }
  }
  try {
    mt5BridgeLogStream?.end();
  } catch {
    // ignore
  }
  mt5BridgeLogStream = null;
}

function isTrustedSender(evt) {
  try {
    const url = evt?.senderFrame?.url || evt?.sender?.getURL?.() || '';
    return isAllowedAppNavigation(url);
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#050505',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: ENABLE_SANDBOX,
      webSecurity: true,
      allowRunningInsecureContent: false,
      enableRemoteModule: false,
      webviewTag: true
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:3000');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  try {
    runOneTimeProfileMigration();
    secretsState = loadSecrets();
  } catch (err) {
    appendMainLog(`[${new Date().toISOString()}] profile_migration_failed: ${err?.stack || String(err)}\n`);
  }
  try {
    await loadKeychainSecrets();
    await migrateSecretsToKeychain();
  } catch {
    // ignore keychain failures
  }
  if (session?.defaultSession?.setPermissionRequestHandler) {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const allowed = isAllowedPermissionRequest(permission, details, webContents);
      callback(allowed);
    });
  }
  if (session?.defaultSession?.setPermissionCheckHandler) {
    session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
      const info = { ...(details || {}), requestingUrl: requestingOrigin || details?.requestingUrl };
      return isAllowedPermissionRequest(permission, info, webContents);
    });
  }
  startMt5Bridge().catch(() => {});
  startMt5BridgeWatchdog();

  tradeLockerClient = new TradeLockerClient();
  if (tradeLockerStreamUnsub) {
    try { tradeLockerStreamUnsub(); } catch { /* ignore */ }
  }
  tradeLockerStreamUnsub = tradeLockerClient.onStreamEvent((payload) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      try {
        if (!win || win.isDestroyed()) continue;
        const wc = win.webContents;
        if (!wc || wc.isDestroyed()) continue;
        wc.send('tradelocker:stream:event', payload);
      } catch {
        // ignore send failures
      }
    }
  });
  try {
    tradeLedger = new TradeLedgerCtor();
  } catch (err) {
    appendMainLog(`[${new Date().toISOString()}] TradeLedger init failed: ${err?.stack || String(err)}\n`);
    try {
      const { TradeLedger } = require('./tradeLedger.cjs');
      tradeLedger = new TradeLedger();
      appendMainLog(`[${new Date().toISOString()}] TradeLedger fallback to JSON ledger.\n`);
    } catch (fallbackErr) {
      appendMainLog(`[${new Date().toISOString()}] TradeLedger fallback failed: ${fallbackErr?.stack || String(fallbackErr)}\n`);
      throw fallbackErr;
    }
  }
  brokerRegistry = new BrokerRegistry();
  brokerRegistry.register(createTradeLockerAdapter(tradeLockerClient));
  brokerRegistry.register(createSimAdapter());

  ipcMain.handle('mt5Bridge:start', async () => {
    const res = await startMt5Bridge();
    if (res && typeof res === 'object') return res;
    return { ok: true, port: getMt5BridgePort() };
  });

  ipcMain.handle('mt5Bridge:status', async () => {
    const port = getMt5BridgePort();
    const healthUrl = `http://127.0.0.1:${port}/health`;
    const healthy = await checkHealth(healthUrl, 800);
    return { ok: true, port, healthy, lastError: mt5BridgeLastStartError };
  });

  ipcMain.handle('mt5Bridge:openLog', async () => {
    const logPath = path.join(app.getPath('userData'), 'mt5-bridge.log');
    try { await shell.openPath(logPath); } catch {}
    return { ok: true, logPath };
  });

  ipcMain.handle('diagnostics:getAppMeta', async () => getAppMeta());
  ipcMain.handle('diagnostics:getMainLog', async (_evt, opts) => readMainLogTail(opts || {}));
  ipcMain.handle('diagnostics:listReleases', async (_evt, opts) => listReleaseArtifacts(opts || {}));
  ipcMain.handle('diagnostics:getBundleStats', async () => getBundleStats());

  // --- TradeLocker ---
  ipcMain.handle('tradelocker:getSavedConfig', async () => tradeLockerClient.getSavedConfig());
  ipcMain.handle('tradelocker:updateSavedConfig', async (_evt, patch) => tradeLockerClient.updateSavedConfig(patch));
  ipcMain.handle('tradelocker:clearSavedSecrets', async () => tradeLockerClient.clearSavedSecrets());

  ipcMain.handle('tradelocker:connect', async (evt, opts) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    return tradeLockerClient.connect(opts);
  });
  ipcMain.handle('tradelocker:disconnect', async (evt) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    return tradeLockerClient.disconnect();
  });
  ipcMain.handle('tradelocker:status', async () => tradeLockerClient.getStatus());

  ipcMain.handle('tradelocker:getAccounts', async () => tradeLockerClient.getAllAccounts());
  ipcMain.handle('tradelocker:setActiveAccount', async (evt, account) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    return tradeLockerClient.setActiveAccount(account || {});
  });
  ipcMain.handle('tradelocker:setTradingOptions', async (evt, options) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    return tradeLockerClient.setTradingOptions(options || {});
  });
  ipcMain.handle('tradelocker:searchInstruments', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    return tradeLockerClient.searchInstruments(args || {});
  });

  ipcMain.handle('tradelocker:getSnapshot', async (_evt, opts) => tradeLockerClient.getSnapshot(opts || {}));
  ipcMain.handle('tradelocker:getAccountMetrics', async (_evt, opts) => tradeLockerClient.getAccountMetrics(opts || {}));
  ipcMain.handle('tradelocker:getOrders', async () => tradeLockerClient.getOrders());
  ipcMain.handle('tradelocker:getOrdersHistory', async () => tradeLockerClient.getOrdersHistory());
  ipcMain.handle('tradelocker:getOrderDetails', async (_evt, args) => tradeLockerClient.getOrderDetails(args || {}));
  ipcMain.handle('tradelocker:getPositionDetails', async (_evt, args) => tradeLockerClient.getPositionDetails(args || {}));
  ipcMain.handle('tradelocker:getQuote', async (_evt, args) => tradeLockerClient.getQuote(args || {}));
  ipcMain.handle('tradelocker:getQuotes', async (_evt, args) => tradeLockerClient.getQuotes(args || {}));
  ipcMain.handle('tradelocker:getHistory', async (_evt, args) => tradeLockerClient.getHistory(args || {}));
  ipcMain.handle('tradelocker:getHistorySeries', async (_evt, args) => tradeLockerClient.getHistorySeries(args || {}));
  ipcMain.handle('tradelocker:getDailyBar', async (_evt, args) => tradeLockerClient.getDailyBar(args || {}));
  ipcMain.handle('tradelocker:getInstrumentConstraints', async (_evt, args) => tradeLockerClient.getInstrumentConstraints(args || {}));
  ipcMain.handle('tradelocker:getInstrumentDetails', async (_evt, args) => tradeLockerClient.getInstrumentDetails(args || {}));
  ipcMain.handle('tradelocker:getSessionDetails', async (_evt, args) => tradeLockerClient.getSessionDetails(args || {}));
  ipcMain.handle('tradelocker:getSessionStatus', async (_evt, args) => tradeLockerClient.getSessionStatus(args || {}));
  ipcMain.handle('tradelocker:getStreamStatus', async () => tradeLockerClient.getStreamStatus());
  ipcMain.handle('tradelocker:startStream', async (evt) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    return tradeLockerClient.startStream();
  });
  ipcMain.handle('tradelocker:stopStream', async (evt) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    return tradeLockerClient.stopStream();
  });
  ipcMain.handle('tradelocker:cancelOrder', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    return tradeLockerClient.cancelOrder(args || {});
  });
  ipcMain.handle('tradelocker:modifyOrder', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    return tradeLockerClient.modifyOrder(args || {});
  });
  ipcMain.handle('tradelocker:modifyPosition', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    return tradeLockerClient.modifyPosition(args || {});
  });
  ipcMain.handle('tradelocker:closePosition', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    return tradeLockerClient.closePosition(args || {});
  });
  ipcMain.handle('tradelocker:placeOrder', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    return tradeLockerClient.placeOrder(args || {});
  });

  // --- News ---
  ipcMain.handle('news:getSnapshot', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    const service = ensureNewsService();
    if (!service) return { ok: false, error: 'News service unavailable.' };
    return service.getSnapshot(args || {});
  });

  // --- Calendar ---
  ipcMain.handle('calendar:getEvents', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    const service = ensureCalendarService();
    if (!service) return { ok: false, error: 'Calendar service unavailable.' };
    return service.getEvents(args || {});
  });

  // --- Telegram ---
  const broadcastTelegramUpdate = (update) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      try {
        if (!win || win.isDestroyed()) continue;
        const wc = win.webContents;
        if (!wc || wc.isDestroyed()) continue;
        wc.send('telegram:update', update);
      } catch {
        // ignore send failures
      }
    }
  };

  const scheduleTelegramPoll = (delayMs) => {
    if (!telegramPoller.active) return;
    if (telegramPoller.timer) {
      clearTimeout(telegramPoller.timer);
      telegramPoller.timer = null;
    }
    telegramPoller.timer = setTimeout(() => {
      void pollTelegramOnce();
    }, Math.max(250, delayMs || 0));
  };

  const pollTelegramOnce = async () => {
    if (!telegramPoller.active || telegramPoller.inFlight) return;
    const token = String(telegramPoller.token || '').trim();
    if (!token) return;
    telegramPoller.inFlight = true;
    let nextBackoff = 1000;
    try {
      const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`);
      url.searchParams.set('timeout', '25');
      url.searchParams.set('limit', '50');
      if (telegramPoller.lastUpdateId) {
        url.searchParams.set('offset', String(telegramPoller.lastUpdateId + 1));
      }
      const res = await fetch(url.toString(), { method: 'GET' });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && Array.isArray(data.result)) {
        let maxUpdateId = telegramPoller.lastUpdateId || 0;
        for (const update of data.result) {
          const updateId = Number(update?.update_id);
          if (Number.isFinite(updateId) && updateId > maxUpdateId) {
            maxUpdateId = updateId;
          }
          const chatId = resolveTelegramChatId(update);
          if (telegramPoller.chatIds.size > 0 && (!chatId || !telegramPoller.chatIds.has(chatId))) {
            continue;
          }
          broadcastTelegramUpdate(update);
        }
        telegramPoller.lastUpdateId = maxUpdateId;
        nextBackoff = 500;
      } else {
        nextBackoff = Math.min(30_000, telegramPoller.backoffMs * 2);
      }
    } catch {
      nextBackoff = Math.min(30_000, telegramPoller.backoffMs * 2);
    } finally {
      telegramPoller.inFlight = false;
      telegramPoller.backoffMs = nextBackoff;
      scheduleTelegramPoll(nextBackoff);
    }
  };

  ipcMain.handle('telegram:startPolling', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    const token = String(args?.botToken || '').trim();
    const chatIds = normalizeTelegramChatIds(args?.chatId || args?.chatIds);
    if (!token || chatIds.length === 0) {
      return { ok: false, error: 'Telegram bot token and chat id are required.' };
    }
    const prevToken = telegramPoller.token;
    const prevChatKey = Array.from(telegramPoller.chatIds || []).join('|');
    const nextChatKey = chatIds.join('|');
    telegramPoller.token = token;
    telegramPoller.chatIds = new Set(chatIds);
    telegramPoller.active = true;
    telegramPoller.backoffMs = 1000;
    if ((prevToken && prevToken !== token) || (prevChatKey && prevChatKey !== nextChatKey)) {
      telegramPoller.lastUpdateId = 0;
    }
    telegramPoller.lastUpdateId = Number.isFinite(Number(args?.offset))
      ? Math.max(0, Math.floor(Number(args.offset)))
      : telegramPoller.lastUpdateId;

    if (args?.drain) {
      try {
        const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`);
        url.searchParams.set('timeout', '0');
        url.searchParams.set('limit', '50');
        const res = await fetch(url.toString(), { method: 'GET' });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.ok && Array.isArray(data.result)) {
          let maxUpdateId = telegramPoller.lastUpdateId || 0;
          for (const update of data.result) {
            const updateId = Number(update?.update_id);
            if (Number.isFinite(updateId) && updateId > maxUpdateId) maxUpdateId = updateId;
          }
          telegramPoller.lastUpdateId = maxUpdateId;
        }
      } catch {
        // ignore drain failures
      }
    }

    scheduleTelegramPoll(250);
    return { ok: true, chatIds };
  });

  ipcMain.handle('telegram:stopPolling', async (evt) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    telegramPoller.active = false;
    telegramPoller.inFlight = false;
    if (telegramPoller.timer) {
      clearTimeout(telegramPoller.timer);
      telegramPoller.timer = null;
    }
    return { ok: true };
  });

  ipcMain.handle('telegram:sendPhoto', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    const token = String(args?.botToken || '').trim();
    const chatId = String(args?.chatId || '').trim();
    const dataUrl = String(args?.dataUrl || '').trim();
    const captionRaw = args?.caption != null ? String(args.caption).trim() : '';
    if (!token || !chatId || !dataUrl) {
      return { ok: false, error: 'Telegram bot token, chat id, and image data are required.' };
    }
    const parsed = parseTelegramDataUrl(dataUrl);
    if (!parsed) return { ok: false, error: 'Invalid image payload.' };
    const caption = captionRaw.length > 900 ? captionRaw.slice(0, 900) : captionRaw;
    try {
      const blob = new Blob([Buffer.from(parsed.data, 'base64')], { type: parsed.mimeType || 'image/png' });
      const form = new FormData();
      form.append('chat_id', chatId);
      if (caption) form.append('caption', caption);
      form.append('photo', blob, 'chart.png');
      const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST',
        body: form
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const err = data?.description || data?.error?.message || res.statusText || 'Telegram send failed.';
        return { ok: false, error: err, result: data || null };
      }
      return { ok: true, result: data?.result || null };
    } catch (err) {
      return { ok: false, error: err?.message ? String(err.message) : 'Telegram send failed.' };
    }
  });

  ipcMain.handle('telegram:sendMessage', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    const token = String(args?.botToken || '').trim();
    const chatId = String(args?.chatId || '').trim();
    const textRaw = String(args?.text || '').trim();
    const replyMarkup = args?.replyMarkup ?? null;
    if (!token || !chatId || !textRaw) {
      return { ok: false, error: 'Telegram bot token, chat id, and text are required.' };
    }
    const text = textRaw.length > 3900 ? textRaw.slice(0, 3900) : textRaw;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
          reply_markup: replyMarkup || undefined
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const err = data?.description || data?.error?.message || res.statusText || 'Telegram send failed.';
        return { ok: false, error: err, result: data || null };
      }
      return { ok: true, result: data?.result || null };
    } catch (err) {
      return { ok: false, error: err?.message ? String(err.message) : 'Telegram send failed.' };
    }
  });

  ipcMain.handle('telegram:answerCallback', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    const token = String(args?.botToken || '').trim();
    const callbackId = String(args?.callbackId || '').trim();
    const textRaw = args?.text != null ? String(args.text).trim() : '';
    if (!token || !callbackId) {
      return { ok: false, error: 'Telegram bot token and callback id are required.' };
    }
    const text = textRaw.length > 180 ? textRaw.slice(0, 180) : textRaw;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackId,
          text: text || undefined
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const err = data?.description || data?.error?.message || res.statusText || 'Telegram callback failed.';
        return { ok: false, error: err, result: data || null };
      }
      return { ok: true, result: data?.result || null };
    } catch (err) {
      return { ok: false, error: err?.message ? String(err.message) : 'Telegram callback failed.' };
    }
  });

  // --- Broker Adapter Layer ---
  ipcMain.handle('broker:list', async () => {
    if (!brokerRegistry) return { ok: false, error: 'Broker registry unavailable.' };
    return { ok: true, brokers: brokerRegistry.list() };
  });

  ipcMain.handle('broker:getActive', async () => {
    if (!brokerRegistry) return { ok: false, error: 'Broker registry unavailable.' };
    return { ok: true, activeId: brokerRegistry.getActiveId() };
  });

  ipcMain.handle('broker:setActive', async (evt, args) => {
    if (!brokerRegistry) return { ok: false, error: 'Broker registry unavailable.' };
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    const brokerId = String(args?.brokerId || args?.id || '').trim();
    if (!brokerId) return { ok: false, error: 'Broker id required.' };
    return brokerRegistry.setActive(brokerId);
  });

  ipcMain.handle('broker:request', async (evt, args) => {
    if (!brokerRegistry) return { ok: false, error: 'Broker registry unavailable.' };
    const method = String(args?.method || '').trim();
    if (!method) return { ok: false, error: 'Broker method required.' };
    if (brokerRegistry.isWriteMethod(method) && !isTrustedSender(evt)) {
      return { ok: false, error: 'Untrusted renderer.' };
    }
    return brokerRegistry.request({
      brokerId: args?.brokerId ? String(args.brokerId) : null,
      method,
      args: args?.args
    });
  });

  // --- Trade Ledger ---
  ipcMain.handle('tradeLedger:append', async (_evt, entry) => tradeLedger.append(entry || {}));
  ipcMain.handle('tradeLedger:reserve', async (_evt, args) => tradeLedger.reserve(args || {}));
  ipcMain.handle('tradeLedger:update', async (_evt, args) => tradeLedger.update(args || {}));
  ipcMain.handle('tradeLedger:list', async (_evt, args) => tradeLedger.list(args || {}));
  ipcMain.handle('tradeLedger:listEvents', async (_evt, args) => tradeLedger.listEvents(args || {}));
  ipcMain.handle('tradeLedger:findRecent', async (_evt, args) => tradeLedger.findRecent(args || {}));
  ipcMain.handle('tradeLedger:addMemory', async (_evt, memory) => tradeLedger.addMemory(memory || {}));
  ipcMain.handle('tradeLedger:listMemories', async (_evt, args) => tradeLedger.listMemories(args || {}));
  ipcMain.handle('tradeLedger:updateMemory', async (_evt, args) => tradeLedger.updateMemory(args || {}));
  ipcMain.handle('tradeLedger:deleteMemory', async (_evt, args) => tradeLedger.deleteMemory(args || {}));
  ipcMain.handle('tradeLedger:clearMemories', async () => tradeLedger.clearMemories());
  ipcMain.handle('tradeLedger:upsertAgentMemory', async (_evt, args) => tradeLedger.upsertAgentMemory(args || {}));
  ipcMain.handle('tradeLedger:getAgentMemory', async (_evt, args) => tradeLedger.getAgentMemory(args || {}));
  ipcMain.handle('tradeLedger:listAgentMemory', async (_evt, args) => tradeLedger.listAgentMemory(args || {}));
  ipcMain.handle('tradeLedger:deleteAgentMemory', async (_evt, args) => tradeLedger.deleteAgentMemory(args || {}));
  ipcMain.handle('tradeLedger:clearAgentMemory', async () => tradeLedger.clearAgentMemory());
  ipcMain.handle('tradeLedger:getOptimizerEvalCache', async (_evt, args) => tradeLedger.getOptimizerEvalCache(args || {}));
  ipcMain.handle('tradeLedger:putOptimizerEvalCache', async (_evt, args) => tradeLedger.putOptimizerEvalCache(args || {}));
  ipcMain.handle('tradeLedger:pruneOptimizerEvalCache', async (_evt, args) => tradeLedger.pruneOptimizerEvalCache(args || {}));
  ipcMain.handle('tradeLedger:createExperimentNote', async (_evt, args) => tradeLedger.createExperimentNote(args || {}));
  ipcMain.handle('tradeLedger:getExperimentNote', async (_evt, args) => tradeLedger.getExperimentNote(args || {}));
  ipcMain.handle('tradeLedger:listExperimentNotes', async (_evt, args) => tradeLedger.listExperimentNotes(args || {}));
  ipcMain.handle('tradeLedger:createOptimizerWinner', async (_evt, args) => tradeLedger.createOptimizerWinner(args || {}));
  ipcMain.handle('tradeLedger:getOptimizerWinner', async (_evt, args) => tradeLedger.getOptimizerWinner(args || {}));
  ipcMain.handle('tradeLedger:getOptimizerWinnerBySessionRound', async (_evt, args) => tradeLedger.getOptimizerWinnerBySessionRound(args || {}));
  ipcMain.handle('tradeLedger:listOptimizerWinners', async (_evt, args) => tradeLedger.listOptimizerWinners(args || {}));
  ipcMain.handle('tradeLedger:createResearchSession', async (_evt, args) => tradeLedger.createResearchSession(args || {}));
  ipcMain.handle('tradeLedger:getResearchSession', async (_evt, args) => tradeLedger.getResearchSession(args || {}));
  ipcMain.handle('tradeLedger:listResearchSessions', async (_evt, args) => tradeLedger.listResearchSessions(args || {}));
  ipcMain.handle('tradeLedger:appendResearchStep', async (_evt, args) => tradeLedger.appendResearchStep(args || {}));
  ipcMain.handle('tradeLedger:listResearchSteps', async (_evt, args) => tradeLedger.listResearchSteps(args || {}));
  ipcMain.handle('tradeLedger:createPlaybookRun', async (_evt, args) => tradeLedger.createPlaybookRun(args || {}));
  ipcMain.handle('tradeLedger:getPlaybookRun', async (_evt, args) => tradeLedger.getPlaybookRun(args || {}));
  ipcMain.handle('tradeLedger:listPlaybookRuns', async (_evt, args) => tradeLedger.listPlaybookRuns(args || {}));
  ipcMain.handle('tradeLedger:stats', async () => (tradeLedger?.stats ? tradeLedger.stats() : { ok: false, error: 'Trade ledger unavailable.' }));
  ipcMain.handle('tradeLedger:flush', async () => (tradeLedger?.flush ? tradeLedger.flush() : { ok: false, error: 'Trade ledger unavailable.' }));

  // --- Secrets (OpenAI / Gemini) ---
  ipcMain.handle('secrets:getStatus', async () => {
  const openaiKey = getSecretValue('openai');
  const geminiKey = getSecretValue('gemini');
  const openaiStorage = keychainCache.openai
    ? 'keychain'
    : secretsState?.openai?.key
      ? 'encrypted'
      : null;
  const geminiStorage = keychainCache.gemini
    ? 'keychain'
    : secretsState?.gemini?.key
      ? 'encrypted'
      : null;
  const openaiSource = openaiStorage || ((process.env.OPENAI_API_KEY || process.env.API_KEY || '').trim() ? 'env' : 'none');
  const geminiSource = geminiStorage || ((process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim() ? 'env' : 'none');
  return {
    ok: true,
    encryptionAvailable: !!safeStorage?.isEncryptionAvailable?.(),
    keychainAvailable: isKeychainAvailable(),
    keychainLoaded: keychainCache.loaded,
    openai: { hasKey: !!openaiKey, storage: openaiStorage, source: openaiSource },
    gemini: { hasKey: !!geminiKey, storage: geminiStorage, source: geminiSource }
  };
});

  ipcMain.handle('secrets:setOpenAIKey', async (_evt, args) => {
    return setSecretValue('openai', args?.key);
  });

  ipcMain.handle('secrets:clearOpenAIKey', async () => {
    return setSecretValue('openai', '');
  });

  ipcMain.handle('secrets:setGeminiKey', async (_evt, args) => {
    return setSecretValue('gemini', args?.key);
  });

  ipcMain.handle('secrets:clearGeminiKey', async () => {
    return setSecretValue('gemini', '');
  });

  ipcMain.handle('secrets:getOpenAIKey', async (evt) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    const key = getOpenAIKey();
    if (!key) return { ok: false, error: 'OpenAI API key missing.' };
    return { ok: true, key };
  });

  ipcMain.handle('secrets:getGeminiKey', async (evt) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    const key = getGeminiKey();
    if (!key) return { ok: false, error: 'Gemini API key missing.' };
    return { ok: true, key };
  });

  // --- Window controls ---
  ipcMain.handle('window:setFullscreen', async (evt, args) => {
    try {
      const win = BrowserWindow.fromWebContents(evt.sender);
      if (!win) return { ok: false, error: 'No window.' };
      const next = !!(args?.fullscreen ?? args);
      win.setFullScreen(next);
      return { ok: true, fullscreen: win.isFullScreen() };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle('window:getFullscreen', async (evt) => {
    try {
      const win = BrowserWindow.fromWebContents(evt.sender);
      if (!win) return { ok: false, error: 'No window.' };
      return { ok: true, fullscreen: win.isFullScreen() };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // --- Codebase tools ---
  ipcMain.handle('codebase:listFiles', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    const rootRes = resolveCodebaseRoot(args?.root);
    if (!rootRes.ok) return rootRes;
    return listCodebaseFiles(rootRes.root, args || {});
  });

  ipcMain.handle('codebase:search', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    const rootRes = resolveCodebaseRoot(args?.root);
    if (!rootRes.ok) return rootRes;
    return searchCodebase(rootRes.root, args || {});
  });

  ipcMain.handle('codebase:readFile', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    const rootRes = resolveCodebaseRoot(args?.root);
    if (!rootRes.ok) return rootRes;
    return readCodebaseFile(rootRes.root, args || {});
  });

  ipcMain.handle('codebase:traceDataflow', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    const rootRes = resolveCodebaseRoot(args?.root);
    if (!rootRes.ok) return rootRes;
    return traceCodebaseDataflow(rootRes.root, args || {});
  });

  ipcMain.handle('agentRunner:evaluateSignal', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    const apiKey = getOpenAIKey();
    if (!apiKey) return { ok: false, error: 'OpenAI API key missing.' };

    const input = args?.input && typeof args.input === 'object' ? args.input : (args || {});
    const agent = input?.agent || {};
    const agentId = String(agent?.id || 'agent').trim() || 'agent';
    const now = Date.now();
    agentRunnerState.lastRunAtMs = now;

    const maxPerMinute = Number.isFinite(Number(input?.maxCommandsPerMinute))
      ? Math.max(0, Math.floor(Number(input.maxCommandsPerMinute)))
      : 0;
    if (maxPerMinute > 0) {
      const windowMs = 60_000;
      const recent = (agentRunnerState.agentRate.get(agentId) || []).filter((ts) => now - ts <= windowMs);
      if (recent.length >= maxPerMinute) {
        return { ok: false, error: 'Agent rate limit reached.', code: 'rate_limited' };
      }
      recent.push(now);
      agentRunnerState.agentRate.set(agentId, recent);
    }

    const { prompt, symbol } = buildAgentRunnerPrompt(input);
    const symbolKey = normalizeAgentSymbolKey(symbol);
    if (symbolKey && agentRunnerState.activeSymbols.has(symbolKey)) {
      return { ok: false, error: 'Agent already evaluating this symbol.', code: 'agent_busy' };
    }
    const sessionId = String(input?.sessionId || '').trim() || `ar_${now}_${Math.random().toString(16).slice(2, 8)}`;
    const abortController = new AbortController();
    agentRunnerState.activeSessions.set(sessionId, {
      agentId,
      symbolKey,
      symbol,
      startedAtMs: now,
      controller: abortController
    });
    if (symbolKey) {
      agentRunnerState.activeSymbols.set(symbolKey, { sessionId, symbol, startedAtMs: now });
    }

    try {
      const modelRaw = String(input?.model || AGENT_RUNNER_DEFAULT_MODEL || 'gpt-5.2').trim();
      const model = modelRaw || 'gpt-5.2';
      const systemContext = buildAgentRunnerSystemContext(agent, input?.context);
      const systemPrompt = systemContext || 'You are a trading agent.';
      const body = {
        model,
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        tools: [AGENT_RUNNER_TOOL],
        tool_choice: 'auto'
      };

      const effort = String(input?.reasoningEffort || '').trim().toLowerCase();
      if (effort && model.toLowerCase().startsWith('gpt-5')) {
        body.reasoning = { effort };
      }

      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: abortController.signal
      });

      const { text, json } = await readJsonOrText(res);
      if (!res.ok) {
        const message = json?.error?.message || json?.message || (text ? String(text).slice(0, 800) : null);
        return { ok: false, error: message || `OpenAI request failed (HTTP ${res.status}).` };
      }

      const data = json || safeJsonParse(text) || {};
      const parsed = parseAgentRunnerResponse(data);
      return { ok: true, text: parsed.text || '', proposal: parsed.proposal || null, sessionId };
    } catch (e) {
      if (e?.name === 'AbortError') {
        return { ok: false, error: 'Agent runner canceled.', code: 'agent_canceled', sessionId };
      }
      return { ok: false, error: e?.message ? String(e.message) : 'Agent runner failed.', sessionId };
    } finally {
      if (symbolKey) agentRunnerState.activeSymbols.delete(symbolKey);
      if (sessionId) agentRunnerState.activeSessions.delete(sessionId);
    }
  });

  ipcMain.handle('agentRunner:cancel', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    const input = args?.input && typeof args.input === 'object' ? args.input : (args || {});
    const sessionId = String(input?.sessionId || '').trim();
    const symbolKey = normalizeAgentSymbolKey(input?.symbol);
    const canceled = [];

    const cancelSession = (id) => {
      if (!id) return false;
      const entry = agentRunnerState.activeSessions.get(id);
      if (!entry) return false;
      if (entry?.controller?.abort) {
        try {
          entry.controller.abort();
        } catch {
          // ignore abort errors
        }
      }
      agentRunnerState.activeSessions.delete(id);
      const activeSymbolKey = entry?.symbolKey || null;
      if (activeSymbolKey && agentRunnerState.activeSymbols.has(activeSymbolKey)) {
        agentRunnerState.activeSymbols.delete(activeSymbolKey);
      }
      canceled.push(id);
      return true;
    };

    if (sessionId) {
      cancelSession(sessionId);
    } else if (symbolKey) {
      const entry = agentRunnerState.activeSymbols.get(symbolKey);
      const candidate = entry?.sessionId || (typeof entry === 'string' ? entry : null);
      cancelSession(candidate);
    } else {
      return { ok: false, error: 'Session id or symbol is required.' };
    }

    if (canceled.length === 0) {
      return { ok: false, error: 'No active agent runner session found.' };
    }
    return { ok: true, canceled, canceledCount: canceled.length };
  });

  ipcMain.handle('agentRunner:status', async (evt) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    const activeSessions = Array.from(agentRunnerState.activeSessions.entries()).map(([id, entry]) => ({
      sessionId: id,
      agentId: entry?.agentId || null,
      symbol: entry?.symbol || entry?.symbolKey || null,
      startedAtMs: entry?.startedAtMs || null
    }));
    return {
      ok: true,
      activeSymbols: Array.from(agentRunnerState.activeSymbols.entries()).map(([key, entry]) => entry?.symbol || key),
      activeSessions,
      lastRunAtMs: agentRunnerState.lastRunAtMs
    };
  });

  // --- OpenAI (proxy to avoid CORS in renderer) ---
  ipcMain.handle('openai:responses', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, status: 403, error: 'Untrusted renderer.' };
    const apiKey = getOpenAIKey();
    const body = args?.body && typeof args.body === 'object' ? args.body : null;
    if (!apiKey) return { ok: false, status: 400, error: 'OpenAI API key missing.' };
    if (!body) return { ok: false, status: 400, error: 'OpenAI request body missing.' };

    try {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      });

      const { text, json } = await readJsonOrText(res);
      const requestId = res.headers?.get?.('x-request-id') || null;

      if (!res.ok) {
        const message = json?.error?.message || json?.message || (text ? String(text).slice(0, 800) : null);
        return {
          ok: false,
          status: res.status,
          error: message || `OpenAI request failed (HTTP ${res.status}).`,
          requestId
        };
      }

      return { ok: true, status: res.status, data: json ?? text, requestId };
    } catch (e) {
      return { ok: false, status: 0, error: e?.message ? String(e.message) : 'OpenAI request failed.' };
    }
  });

  ipcMain.handle('openai:images', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, status: 403, error: 'Untrusted renderer.' };
    const apiKey = getOpenAIKey();
    const body = args?.body && typeof args.body === 'object' ? args.body : null;
    if (!apiKey) return { ok: false, status: 400, error: 'OpenAI API key missing.' };
    if (!body) return { ok: false, status: 400, error: 'OpenAI request body missing.' };

    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      });

      const { text, json } = await readJsonOrText(res);
      const requestId = res.headers?.get?.('x-request-id') || null;

      if (!res.ok) {
        const message = json?.error?.message || json?.message || (text ? String(text).slice(0, 800) : null);
        return {
          ok: false,
          status: res.status,
          error: message || `OpenAI request failed (HTTP ${res.status}).`,
          requestId
        };
      }

      return { ok: true, status: res.status, data: json ?? text, requestId };
    } catch (e) {
      return { ok: false, status: 0, error: e?.message ? String(e.message) : 'OpenAI request failed.' };
    }
  });

  ipcMain.handle('openai:responsesStream', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, status: 403, error: 'Untrusted renderer.' };
    const apiKey = getOpenAIKey();
    const body = args?.body && typeof args.body === 'object' ? args.body : null;
    const streamId = String(args?.streamId || generateStreamId());

    if (!apiKey) return { ok: false, status: 400, error: 'OpenAI API key missing.' };
    if (!body) return { ok: false, status: 400, error: 'OpenAI request body missing.' };

    const requestBody = { ...body, stream: true };

    try {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
          accept: 'text/event-stream'
        },
        body: JSON.stringify(requestBody)
      });

      const requestId = res.headers?.get?.('x-request-id') || null;

      if (!res.ok) {
        const { text, json } = await readJsonOrText(res);
        const message = json?.error?.message || json?.message || (text ? String(text).slice(0, 800) : null);
        return {
          ok: false,
          status: res.status,
          error: message || `OpenAI request failed (HTTP ${res.status}).`,
          requestId,
          streamId
        };
      }

      let outputText = '';
      const functionCalls = new Map(); // call_id -> { name, argsText }
      let finalResponse = null;

      for await (const dataLine of iterateSseData(res.body)) {
        if (dataLine === '[DONE]') break;
        const eventJson = safeJsonParse(dataLine);
        if (!eventJson || typeof eventJson !== 'object') continue;

        try {
          evt.sender.send('openai:responsesStream:event', { streamId, event: eventJson });
        } catch {
          // ignore IPC send errors
        }

        const type = String(eventJson.type || '');
        if (type === 'response.output_text.delta' && typeof eventJson.delta === 'string') {
          outputText += eventJson.delta;
        } else if (type === 'response.output_text.done' && typeof eventJson.text === 'string') {
          outputText = eventJson.text;
        } else if (type === 'response.output_item.added' && eventJson.item && typeof eventJson.item === 'object') {
          const item = eventJson.item;
          const itemType = String(item.type || '');
          if (itemType === 'function_call') {
            const callId = String(item.call_id || item.id || '');
            const name = String(item.name || item.tool_name || '');
            if (callId) {
              const existing = functionCalls.get(callId) || { name: name || null, argsText: '' };
              if (name) existing.name = name;
              functionCalls.set(callId, existing);
            }
          }
        } else if (type === 'response.function_call_arguments.delta') {
          const callId = String(eventJson.call_id || '');
          const delta = typeof eventJson.delta === 'string' ? eventJson.delta : '';
          if (callId && delta) {
            const existing = functionCalls.get(callId) || { name: null, argsText: '' };
            existing.argsText += delta;
            functionCalls.set(callId, existing);
          }
        } else if (type === 'response.function_call_arguments.done') {
          const callId = String(eventJson.call_id || '');
          const argsText = typeof eventJson.arguments === 'string' ? eventJson.arguments : '';
          if (callId && argsText) {
            const existing = functionCalls.get(callId) || { name: null, argsText: '' };
            existing.argsText = argsText;
            functionCalls.set(callId, existing);
          }
        } else if ((type === 'response.completed' || type === 'response.done') && eventJson.response) {
          finalResponse = eventJson.response;
        }
      }

      if (!finalResponse) {
        const synthesized = {
          output_text: outputText,
          output: []
        };
        for (const [callId, call] of functionCalls.entries()) {
          if (!call?.name) continue;
          synthesized.output.push({ type: 'function_call', call_id: callId, name: call.name, arguments: call.argsText || '{}' });
        }
        finalResponse = synthesized;
      }

      return { ok: true, status: 200, data: finalResponse, requestId, streamId };
    } catch (e) {
      return {
        ok: false,
        status: 0,
        error: e?.message ? String(e.message) : 'OpenAI streaming request failed.',
        streamId
      };
    }
  });

  // --- Gemini (TTS proxy) ---
  let geminiModulePromise = null;
  const getGeminiModule = async () => {
    if (!geminiModulePromise) {
      geminiModulePromise = import('@google/genai');
    }
    return geminiModulePromise;
  };

  ipcMain.handle('gemini:tts', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    const apiKey = getGeminiKey();
    if (!apiKey) return { ok: false, error: 'Gemini API key missing.' };
    const text = String(args?.text || '').trim();
    if (!text) return { ok: false, error: 'Text is required.' };
    const voiceName = String(args?.voiceName || 'Kore').trim() || 'Kore';
    try {
      const mod = await getGeminiModule();
      const { GoogleGenAI, Modality } = mod;
      const client = new GoogleGenAI({ apiKey });
      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: { parts: [{ text }] },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName }
            }
          }
        }
      });
      const audioData = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioData) return { ok: false, error: 'No audio data returned.' };
      return { ok: true, data: audioData };
    } catch (e) {
      return { ok: false, error: e?.message ? String(e.message) : 'Gemini TTS failed.' };
    }
  });

  const normalizeCaptureOptions = (opts) => {
    const raw = opts && typeof opts === 'object' ? opts : {};
    const format = String(raw.format || 'jpeg').toLowerCase() === 'png' ? 'png' : 'jpeg';
    const qualityRaw = raw.quality == null ? 60 : Number(raw.quality);
    const quality = Number.isFinite(qualityRaw) ? Math.min(100, Math.max(1, Math.floor(qualityRaw))) : 60;
    const clampDim = (value) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return null;
      const rounded = Math.floor(num);
      if (rounded <= 0) return null;
      return Math.min(4096, Math.max(1, rounded));
    };
    const width = clampDim(raw.width);
    const height = clampDim(raw.height);
    return { format, quality, width, height };
  };

  // --- Capture (tab/webContents screenshots) ---
  ipcMain.handle('glass:captureWebContents', async (evt, args) => {
    try {
      if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
      const webContentsId = Number(args?.webContentsId);
      const options = args?.options && typeof args.options === 'object' ? args.options : {};
      if (!Number.isFinite(webContentsId)) return { ok: false, error: 'Invalid webContentsId.' };

      const wc = electron.webContents.fromId(webContentsId);
      if (!wc) return { ok: false, error: 'webContents not found.' };

      let image = await wc.capturePage();

      const normalized = normalizeCaptureOptions(options);
      const width = normalized.width;
      const height = normalized.height;
      if (width || height) {
        image = image.resize({
          width: width && Number.isFinite(width) ? Math.max(1, Math.floor(width)) : undefined,
          height: height && Number.isFinite(height) ? Math.max(1, Math.floor(height)) : undefined
        });
      }

      const format = normalized.format;
      if (format === 'png') {
        const buf = image.toPNG();
        return { ok: true, mimeType: 'image/png', data: buf.toString('base64') };
      }

      const quality = normalized.quality;
      const buf = image.toJPEG(quality);
      return { ok: true, mimeType: 'image/jpeg', data: buf.toString('base64') };
    } catch (e) {
      return { ok: false, error: e?.message ? String(e.message) : 'Failed to capture webContents.' };
    }
  });

  ipcMain.handle('glass:captureNativeSnapshot', async (evt, args) => {
    try {
      if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
      const options = args?.options && typeof args.options === 'object' ? args.options : {};
      const wc = evt?.sender;
      if (!wc) return { ok: false, error: 'webContents not found.' };

      let image = await wc.capturePage();
      const normalized = normalizeCaptureOptions(options);
      const width = normalized.width;
      const height = normalized.height;
      if (width || height) {
        image = image.resize({
          width: width && Number.isFinite(width) ? Math.max(1, Math.floor(width)) : undefined,
          height: height && Number.isFinite(height) ? Math.max(1, Math.floor(height)) : undefined
        });
      }

      if (normalized.format === 'png') {
        const buf = image.toPNG();
        return { ok: true, mimeType: 'image/png', data: buf.toString('base64') };
      }

      const buf = image.toJPEG(normalized.quality);
      return { ok: true, mimeType: 'image/jpeg', data: buf.toString('base64') };
    } catch (e) {
      return { ok: false, error: e?.message ? String(e.message) : 'Failed to capture snapshot.' };
    }
  });

  // --- Persist screenshots to disk (userData) ---
  ipcMain.handle('glass:saveUserFile', async (_evt, args) => {
    try {
      const subdirRaw = args?.subdir != null ? String(args.subdir) : 'snapshots';
      const prefixRaw = args?.prefix != null ? String(args.prefix) : 'snapshot';
      const maxPrefixLen = 64;

      const sanitize = (value) =>
        String(value || '')
          .trim()
          .replace(/[^a-z0-9._-]+/gi, '_')
          .replace(/^_+|_+$/g, '');

      const subdir = sanitize(subdirRaw) || 'snapshots';
      const prefix = (sanitize(prefixRaw) || 'snapshot').slice(0, maxPrefixLen);

      let mimeType = args?.mimeType != null ? String(args.mimeType) : '';
      let base64 = '';

      const dataUrlRaw = args?.dataUrl != null ? String(args.dataUrl) : '';
      const dataRaw = args?.data != null ? String(args.data) : '';

      if (dataUrlRaw && dataUrlRaw.startsWith('data:')) {
        const match = dataUrlRaw.match(/^data:([^;]+);base64,(.*)$/i);
        if (!match) return { ok: false, error: 'Invalid dataUrl.' };
        mimeType = match[1] || mimeType || 'image/jpeg';
        base64 = match[2] || '';
      } else {
        base64 = dataRaw || '';
      }

      if (!base64) return { ok: false, error: 'No image data provided.' };
      if (!mimeType) mimeType = 'image/jpeg';

      const mt = mimeType.toLowerCase();
      const ext =
        mt.includes('markdown') ? 'md' :
        mt.includes('csv') ? 'csv' :
        mt.includes('json') ? 'json' :
        mt.startsWith('text/') ? 'txt' :
        mt.includes('png') ? 'png' :
        mt.includes('webp') ? 'webp' :
        'jpg';

      const dir = path.join(app.getPath('userData'), subdir);
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (e) {
        return { ok: false, error: e?.message ? String(e.message) : 'Failed to create snapshot directory.' };
      }

      const stamp = Date.now();
      const rand = Math.random().toString(16).slice(2, 8);
      const filename = `${prefix}_${stamp}_${rand}.${ext}`;
      const filePath = path.join(dir, filename);

      try {
        fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
      } catch (e) {
        return { ok: false, error: e?.message ? String(e.message) : 'Failed to write snapshot file.' };
      }

      return { ok: true, path: filePath, filename, mimeType };
    } catch (e) {
      return { ok: false, error: e?.message ? String(e.message) : 'Failed to save file.' };
    }
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  try {
    tradeLedger?.flushSync?.();
  } catch {
    // ignore
  }
  stopMt5BridgeWatchdog();
  stopMt5Bridge();
});
