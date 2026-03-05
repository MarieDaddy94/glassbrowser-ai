const electron = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { TradeLockerClient } = require('./tradelocker.cjs');
const { TradeLedger } = require('./tradeLedger.cjs');

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

const { app, BrowserWindow, ipcMain, shell, safeStorage } = electron;

const isDev = !app.isPackaged;
const SECRETS_FILE = 'ai-secrets.json';
const DEFAULT_SECRETS = Object.freeze({
  version: 1,
  openai: { key: null },
  gemini: { key: null }
});
const ENABLE_SANDBOX = process.env.GLASS_DISABLE_SANDBOX !== '1';
const ALLOWED_WEBVIEW_PROTOCOLS = new Set(['http:', 'https:', 'about:', 'blob:']);
const DEFAULT_ALLOWED_WEBVIEW_HOSTS = new Set(['localhost', '127.0.0.1']);
const RENDERER_ENTRY_ASSET_ATTR_RE = /\b(?:src|href)=["']([^"']+)["']/gi;
const NON_LOCAL_RENDERER_REF_RE = /^(?:[a-z]+:|\/\/|#)/i;
const ENTERPRISE_FLAG_DEFAULTS = Object.freeze({
  securityAuditV1: true,
  mt5BridgeAuthV1: true,
  zustandMigrationV1: true,
  uiVirtualizationV1: false,
  electronE2EV1: true
});
const BRIDGE_AUTH_HEADER = 'x-glass-bridge-token';
const BRIDGE_HEARTBEAT_INTERVAL_MS = 5_000;
const BRIDGE_HEARTBEAT_TIMEOUT_MS = 2_000;
const BRIDGE_HEARTBEAT_MISS_LIMIT = 3;
const BRIDGE_FORCE_KILL_DELAY_MS = 4_000;
const CSP_PACKAGED = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss: ws://127.0.0.1:* http://127.0.0.1:*; media-src 'self' blob: data:; frame-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const CSP_DEV = "default-src 'self' http://localhost:3000 http://127.0.0.1:3000 ws://localhost:3000 ws://127.0.0.1:3000; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:3000 http://127.0.0.1:3000; style-src 'self' 'unsafe-inline' http://localhost:3000 http://127.0.0.1:3000; img-src 'self' data: blob: https: http:; font-src 'self' data: http:; connect-src 'self' https: http://localhost:3000 http://127.0.0.1:3000 ws://localhost:3000 ws://127.0.0.1:3000 ws://127.0.0.1:* http://127.0.0.1:*; media-src 'self' blob: data:; object-src 'none'; base-uri 'self'; form-action 'self'";

function loadEnterpriseFlags() {
  const envRaw = String(process.env.GLASS_FEATURE_FLAGS_JSON || '').trim();
  const next = { ...ENTERPRISE_FLAG_DEFAULTS };
  if (!envRaw) return next;
  try {
    const parsed = JSON.parse(envRaw);
    if (parsed && typeof parsed === 'object') {
      for (const key of Object.keys(next)) {
        if (Object.prototype.hasOwnProperty.call(parsed, key)) {
          next[key] = parsed[key] === true;
        }
      }
    }
  } catch {
    // ignore malformed payload
  }
  return next;
}

const enterpriseFlags = loadEnterpriseFlags();

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
  if (!ALLOWED_WEBVIEW_PROTOCOLS.has(proto)) return false;
  if (proto !== 'http:' && proto !== 'https:') return true;
  const host = String(url.hostname || '').trim().toLowerCase();
  if (!host) return false;
  if (DEFAULT_ALLOWED_WEBVIEW_HOSTS.has(host)) return true;
  const rawAllowlist = String(process.env.GLASS_WEBVIEW_HOST_ALLOWLIST || '').trim();
  if (!rawAllowlist) return false;
  const allowedHosts = rawAllowlist
    .split(',')
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter(Boolean);
  return allowedHosts.includes(host);
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

function buildSecureWebPreferences(overrides = {}) {
  return {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: ENABLE_SANDBOX,
    webSecurity: true,
    allowRunningInsecureContent: false,
    enableRemoteModule: false,
    webviewTag: true,
    ...overrides
  };
}

function getContentSecurityPolicy() {
  return isDev ? CSP_DEV : CSP_PACKAGED;
}

function installContentSecurityPolicy() {
  try {
    const ses = electron?.session?.defaultSession;
    if (!ses?.webRequest?.onHeadersReceived) return;
    ses.webRequest.onHeadersReceived((details, callback) => {
      try {
        const nextHeaders = { ...(details?.responseHeaders || {}) };
        nextHeaders['Content-Security-Policy'] = [getContentSecurityPolicy()];
        callback({ responseHeaders: nextHeaders });
      } catch {
        callback({ responseHeaders: details?.responseHeaders || {} });
      }
    });
  } catch {
    // ignore csp injector errors
  }
}

function buildSecurityAuditSnapshot() {
  const windows = BrowserWindow.getAllWindows().map((win) => {
    let prefs = null;
    try {
      prefs = win?.webContents?.getLastWebPreferences?.() || null;
    } catch {
      prefs = null;
    }
    return {
      id: win?.id || null,
      destroyed: !!win?.isDestroyed?.(),
      url: win?.webContents?.getURL?.() || null,
      webPreferences: prefs
        ? {
            contextIsolation: prefs.contextIsolation === true,
            nodeIntegration: prefs.nodeIntegration === false,
            sandbox: prefs.sandbox !== false,
            webSecurity: prefs.webSecurity !== false,
            allowRunningInsecureContent: prefs.allowRunningInsecureContent !== true,
            webviewTag: prefs.webviewTag === true
          }
        : null
    };
  });
  return {
    ok: true,
    generatedAtMs: Date.now(),
    isPackaged: app.isPackaged,
    csp: { mode: isDev ? 'dev' : 'packaged', policy: getContentSecurityPolicy() },
    windows
  };
}

function buildRenderPerfSnapshot() {
  const memory = process.memoryUsage();
  return {
    ok: true,
    generatedAtMs: Date.now(),
    appUptimeSec: Number(process.uptime().toFixed(2)),
    windows: BrowserWindow.getAllWindows().length,
    memory: {
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      external: memory.external
    }
  };
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
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
let mt5BridgeHeartbeatTimer = null;
let mt5BridgeHeartbeatMisses = 0;
let mt5BridgeLastHeartbeatAtMs = null;
let mt5BridgeLastHeartbeatOk = null;
let mt5BridgeLaunchToken = null;
let mt5BridgeRestartCount = 0;
let mt5BridgeLastExitAtMs = null;
let mt5BridgeLastExitCode = null;
let mt5BridgeLastExitSignal = null;
let mt5BridgeLastTerminationRequestedAtMs = null;
let mt5BridgeLastTerminationAckAtMs = null;
let isQuitting = false;
let tradeLockerClient = null;
let tradeLedger = null;

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

      const securePrefs = buildSecureWebPreferences({ preload: undefined });
      Object.assign(webPreferences, securePrefs, { preload: undefined, safeDialogs: true });
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

function setSecretValue(kind, value) {
  const trimmed = String(value || '').trim();
  const next = { ...secretsState };
  if (!trimmed) {
    next[kind] = { key: null };
    secretsState = next;
    const persisted = persistSecrets(next);
    return { ok: persisted.ok, cleared: true, error: persisted.error };
  }
  if (!safeStorage?.isEncryptionAvailable?.()) {
    return { ok: false, error: 'Secure storage is unavailable on this system.' };
  }
  const encrypted = encryptSecret(trimmed);
  if (!encrypted) return { ok: false, error: 'Failed to encrypt secret.' };
  next[kind] = { key: encrypted };
  secretsState = next;
  const persisted = persistSecrets(next);
  return { ok: persisted.ok, saved: persisted.ok, error: persisted.error };
}

function getSecretValue(kind) {
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

function getMt5BridgeToken() {
  if (!enterpriseFlags.mt5BridgeAuthV1) return '';
  if (mt5BridgeLaunchToken) return mt5BridgeLaunchToken;
  mt5BridgeLaunchToken = crypto.randomBytes(24).toString('hex');
  return mt5BridgeLaunchToken;
}

function getMt5BridgeScriptPath() {
  const base = getBackendBasePath();
  return path.join(base, 'backend', 'mt5_bridge', 'app.py');
}

function getPackagedMt5BridgeBinaryPath() {
  const base = getBackendBasePath();
  return path.join(base, 'backend', 'mt5_bridge', 'dist', 'mt5_bridge', 'mt5_bridge.exe');
}

function resolveMt5BridgeLaunchSpec() {
  if (!isDev) {
    const binaryPath = getPackagedMt5BridgeBinaryPath();
    if (fs.existsSync(binaryPath)) {
      return { mode: 'packaged_binary', cmdCandidates: [binaryPath], args: [], entryPath: binaryPath };
    }
    return { mode: 'packaged_binary_missing', cmdCandidates: [], args: [], entryPath: binaryPath };
  }
  const scriptPath = getMt5BridgeScriptPath();
  return {
    mode: 'python_script',
    cmdCandidates: [(process.env.GLASS_MT5_PYTHON || '').trim(), 'python', 'py'].filter(Boolean),
    args: [scriptPath],
    entryPath: scriptPath
  };
}

function killProcessTreeWindows(pid) {
  const targetPid = Number(pid || 0);
  if (process.platform !== 'win32' || !Number.isFinite(targetPid) || targetPid <= 0) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn('taskkill', ['/PID', String(targetPid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    child.once('error', () => done(false));
    child.once('exit', (code) => done(code === 0));
  });
}

function buildMt5BridgeHeaders() {
  const headers = {};
  const token = getMt5BridgeToken();
  if (token) headers[BRIDGE_AUTH_HEADER] = token;
  return headers;
}

function appendMt5Log(line) {
  try {
    if (mt5BridgeLogStream) mt5BridgeLogStream.write(line);
  } catch {
    // ignore logging errors
  }
}

function checkHealth(url, timeoutMs = 1200, headers = null) {
  return new Promise((resolve) => {
    try {
      const req = http.get(url, { headers: headers || undefined }, (res) => {
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

async function checkMt5BridgeHeartbeat() {
  const port = getMt5BridgePort();
  const heartbeatUrl = `http://127.0.0.1:${port}/heartbeat`;
  return checkHealth(heartbeatUrl, BRIDGE_HEARTBEAT_TIMEOUT_MS, buildMt5BridgeHeaders());
}

function scheduleMt5BridgeRestart(reason = 'unknown') {
  if (isQuitting) return;
  if (mt5BridgeRestartTimer) return;
  mt5BridgeRestartTimer = setTimeout(() => {
    mt5BridgeRestartTimer = null;
    mt5BridgeRestartCount += 1;
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

function startMt5BridgeHeartbeatLoop() {
  if (mt5BridgeHeartbeatTimer || process.env.GLASS_DISABLE_MT5_BRIDGE === '1') return;
  mt5BridgeHeartbeatTimer = setInterval(async () => {
    if (isQuitting) return;
    if (!mt5BridgeProcess) return;
    const ok = await checkMt5BridgeHeartbeat();
    mt5BridgeLastHeartbeatOk = ok;
    if (ok) {
      mt5BridgeLastHeartbeatAtMs = Date.now();
      mt5BridgeHeartbeatMisses = 0;
      return;
    }
    mt5BridgeHeartbeatMisses += 1;
    if (mt5BridgeHeartbeatMisses < BRIDGE_HEARTBEAT_MISS_LIMIT) return;
    appendMt5Log(`[${new Date().toISOString()}] Heartbeat miss threshold reached (${mt5BridgeHeartbeatMisses}). Restarting bridge.\n`);
    stopMt5Bridge({ force: true });
    scheduleMt5BridgeRestart('heartbeat_miss');
  }, BRIDGE_HEARTBEAT_INTERVAL_MS);
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

function stopMt5BridgeHeartbeatLoop() {
  if (!mt5BridgeHeartbeatTimer) return;
  clearInterval(mt5BridgeHeartbeatTimer);
  mt5BridgeHeartbeatTimer = null;
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
    const alreadyRunning = await checkHealth(healthUrl, 1200, buildMt5BridgeHeaders());
    if (alreadyRunning) {
      mt5BridgeLastStartError = null;
      mt5BridgeLastHeartbeatAtMs = Date.now();
      mt5BridgeLastHeartbeatOk = true;
      return { ok: true, port, healthy: true, started: false };
    }

    const cwd = getBackendBasePath();
    const launchSpec = resolveMt5BridgeLaunchSpec();
    const launchMode = String(launchSpec.mode || '').trim().toLowerCase();
    const entryPath = String(launchSpec.entryPath || launchSpec.args?.[0] || '').trim();

    if (launchMode === 'packaged_binary_missing') {
      const msg =
        `Packaged MT5 sidecar binary missing at ${entryPath}. ` +
        'Rebuild with `npm run build:mt5-sidecar` before packaging the installer.';
      mt5BridgeLastStartError = msg;
      appendMt5Log(`[${new Date().toISOString()}] ${msg}\n`);
      return { ok: false, port, error: msg, mode: launchMode };
    }

    if (launchMode === 'python_script' && !fs.existsSync(entryPath)) {
      const msg = `MT5 bridge script not found: ${entryPath}`;
      mt5BridgeLastStartError = msg;
      appendMt5Log(`[${new Date().toISOString()}] ${msg}\n`);
      return { ok: false, port, error: msg, mode: launchMode };
    }

    const logPath = path.join(app.getPath('userData'), 'mt5-bridge.log');
    try {
      mt5BridgeLogStream = fs.createWriteStream(logPath, { flags: 'a' });
      appendMt5Log(`\n\n[${new Date().toISOString()}] Starting MT5 bridge (port ${port})\n`);
      appendMt5Log(`[${new Date().toISOString()}] Launch mode: ${launchMode}\n`);
      appendMt5Log(`[${new Date().toISOString()}] Entry: ${entryPath}\n`);
    } catch {
      mt5BridgeLogStream = null;
    }

    const env = { ...process.env };
    env.MT5_BRIDGE_PORT = String(port);
    const token = getMt5BridgeToken();
    if (token) env.GLASS_BRIDGE_TOKEN = token;
    env.GLASS_BRIDGE_AUTH_REQUIRED = enterpriseFlags.mt5BridgeAuthV1 ? '1' : '0';

    const { child, cmd, lastError } = await spawnWithCandidates(
      launchSpec.cmdCandidates,
      launchSpec.args,
      { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }
    );

    if (!child) {
      const msg = `Could not start bridge. Last error: ${String(lastError)}`;
      mt5BridgeLastStartError = msg;
      appendMt5Log(`[${new Date().toISOString()}] ${msg}\n`);
      return { ok: false, port, error: msg };
    }

    appendMt5Log(`[${new Date().toISOString()}] Spawned (${launchMode}): ${cmd} ${entryPath}\n`);
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
      mt5BridgeLastExitAtMs = Date.now();
      mt5BridgeLastExitCode = Number.isFinite(Number(code)) ? Number(code) : null;
      mt5BridgeLastExitSignal = signal ? String(signal) : null;
      mt5BridgeLastTerminationAckAtMs = mt5BridgeLastExitAtMs;
      mt5BridgeProcess = null;
      scheduleMt5BridgeRestart('process_exit');
    });

    const healthy = await checkHealth(healthUrl, 1800, buildMt5BridgeHeaders());
    mt5BridgeLastHeartbeatOk = healthy;
    mt5BridgeLastHeartbeatAtMs = healthy ? Date.now() : mt5BridgeLastHeartbeatAtMs;
    return { ok: true, port, healthy, started: true, mode: launchMode, entryPath };
  })();

  try {
    return await mt5BridgeStartInFlight;
  } finally {
    mt5BridgeStartInFlight = null;
  }
}

function stopMt5Bridge(options = {}) {
  const force = options?.force === true;
  const child = mt5BridgeProcess;
  mt5BridgeProcess = null;
  if (child) {
    const childPid = Number(child?.pid || 0);
    mt5BridgeLastTerminationRequestedAtMs = Date.now();
    try {
      child.kill(force ? 'SIGKILL' : 'SIGTERM');
      appendMt5Log(`[${new Date().toISOString()}] Sent ${force ? 'SIGKILL' : 'SIGTERM'} to bridge\n`);
      if (force && process.platform === 'win32' && Number.isFinite(childPid) && childPid > 0) {
        void killProcessTreeWindows(childPid).then((ok) => {
          appendMt5Log(
            `[${new Date().toISOString()}] taskkill /T /F ${ok ? 'succeeded' : 'failed'} for bridge pid ${childPid}\n`
          );
        });
      }
      if (!force) {
        setTimeout(() => {
          if (child.killed) return;
          try {
            child.kill('SIGKILL');
            appendMt5Log(`[${new Date().toISOString()}] Escalated bridge kill to SIGKILL\n`);
            if (process.platform === 'win32' && Number.isFinite(childPid) && childPid > 0) {
              void killProcessTreeWindows(childPid).then((ok) => {
                appendMt5Log(
                  `[${new Date().toISOString()}] taskkill /T /F escalation ${ok ? 'succeeded' : 'failed'} for bridge pid ${childPid}\n`
                );
              });
            }
          } catch {
            // ignore
          }
        }, BRIDGE_FORCE_KILL_DELAY_MS);
      }
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

function normalizeRendererAssetReference(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return null;
  if (NON_LOCAL_RENDERER_REF_RE.test(raw)) return null;
  let normalized = raw.split('#')[0].split('?')[0].trim().replace(/\\/g, '/');
  if (!normalized) return null;
  if (normalized.startsWith('./')) normalized = normalized.slice(2);
  if (normalized.startsWith('/')) normalized = normalized.slice(1);
  if (!normalized.startsWith('assets/')) return null;
  if (normalized.includes('..')) return null;
  return normalized;
}

function extractRendererAssetReferences(htmlText) {
  const refs = new Set();
  const source = String(htmlText || '');
  RENDERER_ENTRY_ASSET_ATTR_RE.lastIndex = 0;
  let match = null;
  while ((match = RENDERER_ENTRY_ASSET_ATTR_RE.exec(source)) !== null) {
    const normalized = normalizeRendererAssetReference(match[1]);
    if (normalized) refs.add(normalized);
  }
  return Array.from(refs).sort();
}

function validatePackagedRendererEntryIntegrity() {
  const distDir = path.resolve(path.join(__dirname, '../dist'));
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return {
      ok: false,
      reason: 'index_missing',
      indexPath,
      distDir,
      references: [],
      missingFiles: [{ ref: 'index.html', path: indexPath }],
      error: null
    };
  }
  let htmlText = '';
  try {
    htmlText = fs.readFileSync(indexPath, 'utf8');
  } catch (err) {
    return {
      ok: false,
      reason: 'index_read_failed',
      indexPath,
      distDir,
      references: [],
      missingFiles: [],
      error: err?.message || String(err)
    };
  }
  const references = extractRendererAssetReferences(htmlText);
  const missingFiles = [];
  for (const ref of references) {
    const resolvedPath = path.resolve(path.join(distDir, ref));
    let exists = false;
    try {
      exists = fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile();
    } catch {
      exists = false;
    }
    if (!exists) missingFiles.push({ ref, path: resolvedPath });
  }
  return {
    ok: missingFiles.length === 0,
    reason: missingFiles.length > 0 ? 'asset_missing' : 'ok',
    indexPath,
    distDir,
    references,
    missingFiles,
    error: null
  };
}

function escapeHtml(rawValue) {
  return String(rawValue || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildRendererIntegrityFailureHtml(details) {
  const missingList = Array.isArray(details?.missingFiles) ? details.missingFiles : [];
  const missingMarkup = missingList.length > 0
    ? `<ul>${missingList.map((entry) => `<li><code>${escapeHtml(entry?.path || entry?.ref || '')}</code></li>`).join('')}</ul>`
    : '<p>No specific files were reported missing.</p>';
  const reason = details?.error ? `${details?.reason || 'unknown'} (${details.error})` : String(details?.reason || 'unknown');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GlassBrowser AI Startup Error</title>
    <style>
      body { margin: 0; font-family: "Segoe UI", sans-serif; background: #090d16; color: #e8edf7; }
      main { max-width: 920px; margin: 40px auto; padding: 24px; background: #11182a; border: 1px solid #2a3654; border-radius: 12px; }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 8px 0; line-height: 1.5; color: #c6d2e9; }
      code { color: #9fd3ff; }
      ul { margin: 10px 0 0 20px; padding: 0; }
      li { margin: 6px 0; }
      .hint { margin-top: 18px; padding: 12px; border-radius: 8px; background: #1a2338; border: 1px solid #31456f; }
    </style>
  </head>
  <body>
    <main>
      <h1>GlassBrowser AI could not load packaged UI assets.</h1>
      <p>Version: <code>${escapeHtml(app.getVersion())}</code></p>
      <p>Reason: <code>${escapeHtml(reason)}</code></p>
      <p>Executable: <code>${escapeHtml(process.execPath)}</code></p>
      <p>App path: <code>${escapeHtml(app.getAppPath())}</code></p>
      <p>Expected renderer entry: <code>${escapeHtml(details?.indexPath || 'unknown')}</code></p>
      <h2>Missing files</h2>
      ${missingMarkup}
      <div class="hint">
        Reinstall the latest hotfix installer build. If this persists, remove the existing install folder before reinstalling.
      </div>
    </main>
  </body>
</html>`;
}

function reportRendererEntryIntegrityFailure(details) {
  const missingCount = Array.isArray(details?.missingFiles) ? details.missingFiles.length : 0;
  const message = `[GlassBrowser AI] renderer_entry_integrity_failed reason=${details?.reason || 'unknown'} missing=${missingCount} indexPath=${details?.indexPath || 'n/a'}`;
  try {
    console.error(message);
  } catch {
    // ignore console failures
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
    webPreferences: buildSecureWebPreferences()
  });

  if (isDev) {
    win.loadURL('http://localhost:3000');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const integrity = validatePackagedRendererEntryIntegrity();
    if (!integrity.ok) {
      reportRendererEntryIntegrityFailure(integrity);
      const fallbackHtml = buildRendererIntegrityFailureHtml(integrity);
      win.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(fallbackHtml)}`);
    } else {
      win.loadFile(integrity.indexPath);
    }
  }
}

app.whenReady().then(() => {
  installContentSecurityPolicy();
  startMt5Bridge().catch(() => {});
  startMt5BridgeWatchdog();
  startMt5BridgeHeartbeatLoop();

  tradeLockerClient = new TradeLockerClient();
  tradeLedger = new TradeLedger();

  ipcMain.handle('mt5Bridge:start', async () => {
    const res = await startMt5Bridge();
    if (res && typeof res === 'object') return res;
    return { ok: true, port: getMt5BridgePort() };
  });

  ipcMain.handle('mt5Bridge:status', async () => {
    const port = getMt5BridgePort();
    const healthUrl = `http://127.0.0.1:${port}/health`;
    const healthy = await checkHealth(healthUrl, 800, buildMt5BridgeHeaders());
    return { ok: true, port, healthy, lastError: mt5BridgeLastStartError };
  });

  ipcMain.handle('mt5Bridge:heartbeat', async () => {
    const port = getMt5BridgePort();
    const heartbeatUrl = `http://127.0.0.1:${port}/heartbeat`;
    const healthy = await checkHealth(heartbeatUrl, BRIDGE_HEARTBEAT_TIMEOUT_MS, buildMt5BridgeHeaders());
    mt5BridgeLastHeartbeatOk = healthy;
    if (healthy) mt5BridgeLastHeartbeatAtMs = Date.now();
    return { ok: true, port, healthy, lastHeartbeatAtMs: mt5BridgeLastHeartbeatAtMs };
  });

  ipcMain.handle('mt5Bridge:lifecycleStatus', async () => {
    const port = getMt5BridgePort();
    const launchSpec = resolveMt5BridgeLaunchSpec();
    const launchMode = String(launchSpec.mode || '').trim().toLowerCase();
    const expectedEntryPath = String(launchSpec.entryPath || '').trim() || null;
    return {
      ok: true,
      port,
      running: !!mt5BridgeProcess,
      pid: mt5BridgeProcess?.pid || null,
      launchMode,
      expectedEntryPath,
      authEnabled: enterpriseFlags.mt5BridgeAuthV1,
      tokenPresent: !!getMt5BridgeToken(),
      lastError: mt5BridgeLastStartError || null,
      lastHeartbeatAtMs: mt5BridgeLastHeartbeatAtMs,
      lastHeartbeatOk: mt5BridgeLastHeartbeatOk,
      heartbeatMisses: mt5BridgeHeartbeatMisses,
      restartCount: mt5BridgeRestartCount,
      lastExitAtMs: mt5BridgeLastExitAtMs,
      lastExitCode: mt5BridgeLastExitCode,
      lastExitSignal: mt5BridgeLastExitSignal,
      lastTerminationRequestedAtMs: mt5BridgeLastTerminationRequestedAtMs,
      lastTerminationAckAtMs: mt5BridgeLastTerminationAckAtMs
    };
  });

  ipcMain.handle('mt5Bridge:forceRestart', async () => {
    stopMt5Bridge({ force: true });
    await startMt5Bridge();
    return { ok: true, restarted: true, port: getMt5BridgePort() };
  });

  ipcMain.handle('mt5Bridge:openLog', async () => {
    const logPath = path.join(app.getPath('userData'), 'mt5-bridge.log');
    try { await shell.openPath(logPath); } catch {}
    return { ok: true, logPath };
  });

  ipcMain.handle('diagnostics:securityAuditSnapshot', async () => buildSecurityAuditSnapshot());
  ipcMain.handle('diagnostics:renderPerfSnapshot', async () => buildRenderPerfSnapshot());

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
  ipcMain.handle('tradelocker:getAccountMetricsForAccount', async (_evt, opts) => tradeLockerClient.getAccountMetricsForAccount(opts || {}));
  ipcMain.handle('tradelocker:getOrders', async () => tradeLockerClient.getOrders());
  ipcMain.handle('tradelocker:getOrderDetails', async (_evt, args) => tradeLockerClient.getOrderDetails(args || {}));
  ipcMain.handle('tradelocker:getPositionDetails', async (_evt, args) => tradeLockerClient.getPositionDetails(args || {}));
  ipcMain.handle('tradelocker:cancelOrder', async (evt, args) => {
    if (!isTrustedSender(evt)) return { ok: false, error: 'Untrusted renderer.' };
    return tradeLockerClient.cancelOrder(args || {});
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
  ipcMain.handle('tradeLedger:stats', async () => (tradeLedger?.stats ? tradeLedger.stats() : { ok: false, error: 'Trade ledger unavailable.' }));
  ipcMain.handle('tradeLedger:flush', async () => (tradeLedger?.flush ? tradeLedger.flush() : { ok: false, error: 'Trade ledger unavailable.' }));

  // --- Secrets (OpenAI / Gemini) ---
  ipcMain.handle('secrets:getStatus', async () => {
    return {
      ok: true,
      encryptionAvailable: !!safeStorage?.isEncryptionAvailable?.(),
      openai: { hasKey: !!secretsState?.openai?.key },
      gemini: { hasKey: !!secretsState?.gemini?.key }
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

  // --- Capture (tab/webContents screenshots) ---
  ipcMain.handle('glass:captureWebContents', async (_evt, args) => {
    try {
      const webContentsId = Number(args?.webContentsId);
      const options = args?.options && typeof args.options === 'object' ? args.options : {};
      if (!Number.isFinite(webContentsId)) return { ok: false, error: 'Invalid webContentsId.' };

      const wc = electron.webContents.fromId(webContentsId);
      if (!wc) return { ok: false, error: 'webContents not found.' };

      let image = await wc.capturePage();

      const width = options?.width ? Number(options.width) : null;
      const height = options?.height ? Number(options.height) : null;
      if (width || height) {
        image = image.resize({
          width: width && Number.isFinite(width) ? Math.max(1, Math.floor(width)) : undefined,
          height: height && Number.isFinite(height) ? Math.max(1, Math.floor(height)) : undefined
        });
      }

      const format = String(options?.format || 'jpeg').toLowerCase();
      if (format === 'png') {
        const buf = image.toPNG();
        return { ok: true, mimeType: 'image/png', data: buf.toString('base64') };
      }

      const qualityRaw = options?.quality == null ? 60 : Number(options.quality);
      const quality = Number.isFinite(qualityRaw) ? Math.min(100, Math.max(1, Math.floor(qualityRaw))) : 60;
      const buf = image.toJPEG(quality);
      return { ok: true, mimeType: 'image/jpeg', data: buf.toString('base64') };
    } catch (e) {
      return { ok: false, error: e?.message ? String(e.message) : 'Failed to capture webContents.' };
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
  stopMt5BridgeHeartbeatLoop();
  stopMt5Bridge();
});
