'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const BRIDGE_VERSION = 'v1';
const API_PREFIX = '/runtime-ops/v1';
const HEARTBEAT_INTERVAL_MS = 15_000;
const COMMANDS_PER_MINUTE_LIMIT = 30;
const STATE_CACHE_FRESH_MS = 60_000;

function safeNow() {
  return Date.now();
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 256 * 1024) {
        resolve({ ok: false, error: 'Payload too large.' });
        try {
          req.destroy();
        } catch {
          // ignore
        }
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({ ok: true, value: {} });
        return;
      }
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          resolve({ ok: false, error: 'Invalid JSON body.' });
          return;
        }
        resolve({ ok: true, value: parsed });
      } catch {
        resolve({ ok: false, error: 'Invalid JSON body.' });
      }
    });
    req.on('error', () => resolve({ ok: false, error: 'Invalid request body.' }));
  });
}

function sendJson(res, statusCode, payload) {
  const text = JSON.stringify(payload || {});
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(text);
}

function parseBearerToken(req) {
  const auth = String(req?.headers?.authorization || '').trim();
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) return '';
  return auth.slice(7).trim();
}

function normalizeReplayLast(value, fallback = 120) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(0, Math.min(2000, Math.floor(raw)));
}

function writeDiscoveryFileAtomically(filePath, payload) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch {
    // ignore directory creation failure here; write will fail below
  }
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function formatSseEvent(eventName, data, idValue) {
  const lines = [];
  if (idValue != null) lines.push(`id: ${idValue}`);
  if (eventName) lines.push(`event: ${eventName}`);
  const serialized = JSON.stringify(data == null ? {} : data);
  lines.push(`data: ${serialized}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function createRuntimeOpsExternalBridge(input = {}) {
  const app = input.app;
  const appendMainLog = typeof input.appendMainLog === 'function' ? input.appendMainLog : () => {};
  const pushRuntimeEvent = typeof input.pushRuntimeEvent === 'function' ? input.pushRuntimeEvent : () => {};
  const getRuntimeEvents =
    typeof input.getRuntimeEvents === 'function' ? input.getRuntimeEvents : () => [];
  const getRuntimeDroppedCount =
    typeof input.getRuntimeDroppedCount === 'function' ? input.getRuntimeDroppedCount : () => 0;
  const relayExternalCommand =
    typeof input.relayExternalCommand === 'function'
      ? input.relayExternalCommand
      : async () => ({ ok: false, error: 'External command relay unavailable.' });
  const getBridgeSnapshot =
    typeof input.getBridgeSnapshot === 'function'
      ? input.getBridgeSnapshot
      : () => ({ mode: null, streamStatus: null });
  const getControllerStateSnapshot =
    typeof input.getControllerStateSnapshot === 'function'
      ? input.getControllerStateSnapshot
      : () => ({ state: null, updatedAtMs: null });
  const getTargetState =
    typeof input.getTargetState === 'function'
      ? input.getTargetState
      : () => ({
        selectedWebContentsId: null,
        selectedSource: null,
        commandSubscribers: [],
        streamSubscribers: []
      });

  let server = null;
  let heartbeatTimer = null;
  let token = '';
  let startedAtMs = 0;
  let port = 0;
  let disposed = false;
  let bridgeMode = null;
  let seq = 0;
  const clients = new Map();
  const commandTimestamps = [];

  const userDataPath =
    typeof app?.getPath === 'function'
      ? app.getPath('userData')
      : path.join(process.env.APPDATA || process.cwd(), 'glassbrowser-ai');
  const discoveryPath = path.join(userDataPath, 'runtime-ops-bridge.json');

  const gcCommandRateWindow = () => {
    const cutoff = safeNow() - 60_000;
    while (commandTimestamps.length > 0 && commandTimestamps[0] < cutoff) {
      commandTimestamps.shift();
    }
  };

  const commandRateAllowed = () => {
    gcCommandRateWindow();
    if (commandTimestamps.length >= COMMANDS_PER_MINUTE_LIMIT) return false;
    commandTimestamps.push(safeNow());
    return true;
  };

  const sendToClient = (client, eventName, payload, idValue) => {
    if (!client || !client.res) return false;
    try {
      client.res.write(formatSseEvent(eventName, payload, idValue));
      return true;
    } catch {
      return false;
    }
  };

  const broadcastEvent = (event) => {
    if (!event || clients.size === 0) return;
    const idValue =
      Number.isFinite(Number(event?.seq)) && Number(event.seq) > 0 ? Number(event.seq) : ++seq;
    for (const [clientId, client] of clients.entries()) {
      const ok = sendToClient(client, 'runtime_event', event, idValue);
      if (!ok) {
        try {
          client.res.end();
        } catch {
          // ignore
        }
        clients.delete(clientId);
      }
    }
  };

  const writeDiscovery = () => {
    const snapshot = getBridgeSnapshot() || {};
    const payload = {
      version: BRIDGE_VERSION,
      pid: process.pid,
      port,
      token,
      startedAtMs,
      expiresAtMs: null,
      mode: snapshot?.mode ?? bridgeMode ?? null
    };
    writeDiscoveryFileAtomically(discoveryPath, payload);
  };

  const removeDiscovery = () => {
    try {
      if (fs.existsSync(discoveryPath)) fs.unlinkSync(discoveryPath);
    } catch {
      // ignore cleanup failures
    }
  };

  const ensureHeartbeatTimer = () => {
    if (heartbeatTimer || disposed) return;
    heartbeatTimer = setInterval(() => {
      if (clients.size === 0) return;
      const heartbeat = {
        ts: safeNow(),
        source: 'runtime',
        level: 'info',
        code: 'runtime_ops_bridge_heartbeat',
        message: 'Runtime Ops bridge heartbeat'
      };
      for (const [clientId, client] of clients.entries()) {
        const ok = sendToClient(client, 'heartbeat', heartbeat, null);
        if (!ok) {
          try {
            client.res.end();
          } catch {
            // ignore
          }
          clients.delete(clientId);
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  };

  const stopHeartbeatTimer = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const isAuthorized = (req) => {
    const incoming = parseBearerToken(req);
    return incoming && token && incoming === token;
  };

  const requireAuth = (req, res) => {
    if (isAuthorized(req)) return true;
    sendJson(res, 401, { ok: false, error: 'Unauthorized.' });
    return false;
  };

  const collectEventsReplay = (replayLast) => {
    const all = Array.isArray(getRuntimeEvents()) ? getRuntimeEvents() : [];
    if (replayLast <= 0) return [];
    return all.slice(-replayLast);
  };

  const handleEventsRequest = (req, res, parsedUrl) => {
    if (!requireAuth(req, res)) return;
    const replayLast = normalizeReplayLast(parsedUrl.searchParams.get('replayLast'), 120);
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no'
    });
    try {
      res.write(': runtime-ops bridge connected\n\n');
    } catch {
      try {
        res.end();
      } catch {
        // ignore
      }
      return;
    }
    const clientId = `sse_${safeNow()}_${Math.random().toString(16).slice(2, 8)}`;
    clients.set(clientId, { id: clientId, res, connectedAtMs: safeNow() });
    ensureHeartbeatTimer();

    const replay = collectEventsReplay(replayLast);
    for (const event of replay) {
      sendToClient(clients.get(clientId), 'runtime_event', event, event?.seq || null);
    }
    sendToClient(
      clients.get(clientId),
      'bridge_state',
      {
        ok: true,
        connectedAtMs: safeNow(),
        replayed: replay.length,
        droppedCount: Number(getRuntimeDroppedCount() || 0),
        mode: getBridgeSnapshot()?.mode ?? bridgeMode ?? null,
        streamStatus: getBridgeSnapshot()?.streamStatus ?? null
      },
      null
    );

    req.on('close', () => {
      clients.delete(clientId);
      if (clients.size === 0) stopHeartbeatTimer();
    });
  };

  const relayCommand = async (command, payload, opts) => {
    const result = await relayExternalCommand(command, payload || {}, opts || {});
    if (result?.mode) {
      bridgeMode = result.mode;
    } else if (result?.state?.mode) {
      bridgeMode = result.state.mode;
    }
    return result;
  };

  const getCachedControllerState = () => {
    const raw = getControllerStateSnapshot();
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const state = raw.state && typeof raw.state === 'object' && !Array.isArray(raw.state) ? raw.state : null;
      const updatedAtMs = Number.isFinite(Number(raw.updatedAtMs)) ? Number(raw.updatedAtMs) : null;
      return { state, updatedAtMs };
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return { state: raw, updatedAtMs: null };
    }
    return { state: null, updatedAtMs: null };
  };

  const handleHealth = async (req, res) => {
    if (!requireAuth(req, res)) return;
    const snapshot = getBridgeSnapshot() || {};
    const cachedState = getCachedControllerState();
    sendJson(res, 200, {
      ok: true,
      version: BRIDGE_VERSION,
      pid: process.pid,
      startedAtMs,
      uptimeMs: safeNow() - startedAtMs,
      mode: snapshot?.mode ?? bridgeMode ?? null,
      streamStatus: snapshot?.streamStatus ?? null,
      commandSubscriberHealthy:
        cachedState.state && typeof cachedState.state === 'object'
          ? (cachedState.state.commandSubscriberHealthy === true)
          : null,
      externalRelayHealthy:
        cachedState.state && typeof cachedState.state === 'object'
          ? (cachedState.state.externalRelayHealthy !== false)
          : null,
      lastExternalCommandAtMs:
        cachedState.state && typeof cachedState.state === 'object'
          ? (Number.isFinite(Number(cachedState.state.lastExternalCommandAtMs))
              ? Number(cachedState.state.lastExternalCommandAtMs)
              : null)
          : null,
      lastExternalCommandError:
        cachedState.state && typeof cachedState.state === 'object'
          ? (cachedState.state.lastExternalCommandError || null)
          : null,
      droppedCount: Number(getRuntimeDroppedCount() || 0),
      externalCommandSubscribeCount: Number(snapshot?.externalCommandSubscribeCount || 0),
      externalCommandUnsubscribeCount: Number(snapshot?.externalCommandUnsubscribeCount || 0),
      externalCommandReplyFailures: Number(snapshot?.externalCommandReplyFailures || 0),
      externalCommandTimeouts: Number(snapshot?.externalCommandTimeouts || 0),
      rendererErrorForwarded: Number(snapshot?.rendererErrorForwarded || 0)
    });
  };

  const handleState = async (req, res) => {
    if (!requireAuth(req, res)) return;
    const result = await relayCommand('state.get', {});
    if (result?.ok !== false) {
      sendJson(res, 200, result || { ok: false, error: 'No response.' });
      return;
    }
    const cached = getCachedControllerState();
    const ageMs =
      cached.updatedAtMs && Number.isFinite(Number(cached.updatedAtMs))
        ? Math.max(0, safeNow() - Number(cached.updatedAtMs))
        : null;
    const fresh = !!cached.state && (ageMs == null || ageMs <= STATE_CACHE_FRESH_MS);
    if (fresh) {
      sendJson(res, 200, {
        ok: true,
        requestId: result?.requestId || null,
        command: 'state.get',
        stale: true,
        staleAgeMs: ageMs,
        mode: cached.state?.mode ?? null,
        state: cached.state
      });
      return;
    }
    sendJson(res, 503, result || { ok: false, error: 'No response.' });
  };

  const handleActions = async (req, res) => {
    if (!requireAuth(req, res)) return;
    const result = await relayCommand('actions.list', {});
    sendJson(res, result?.ok === false ? 503 : 200, result || { ok: false, error: 'No response.' });
  };

  const handleTargets = async (req, res) => {
    if (!requireAuth(req, res)) return;
    sendJson(res, 200, {
      ok: true,
      target: getTargetState()
    });
  };

  const handleModeSet = async (req, res) => {
    if (!requireAuth(req, res)) return;
    if (!commandRateAllowed()) {
      sendJson(res, 429, { ok: false, error: 'Command rate limit exceeded.' });
      return;
    }
    const body = await readJsonBody(req);
    if (!body.ok) {
      sendJson(res, 400, { ok: false, error: body.error || 'Invalid body.' });
      return;
    }
    const mode = String(body.value?.mode || '').trim();
    const result = await relayCommand('mode.set', { mode });
    sendJson(res, result?.ok === false ? 400 : 200, result || { ok: false, error: 'No response.' });
  };

  const handleEmergencyStop = async (req, res) => {
    if (!requireAuth(req, res)) return;
    if (!commandRateAllowed()) {
      sendJson(res, 429, { ok: false, error: 'Command rate limit exceeded.' });
      return;
    }
    const body = await readJsonBody(req);
    if (!body.ok) {
      sendJson(res, 400, { ok: false, error: body.error || 'Invalid body.' });
      return;
    }
    const reason = String(body.value?.reason || 'external_bridge_emergency_stop').trim();
    const result = await relayCommand('emergency.stop', { reason });
    sendJson(res, result?.ok === false ? 400 : 200, result || { ok: false, error: 'No response.' });
  };

  const handleAction = async (req, res) => {
    if (!requireAuth(req, res)) return;
    if (!commandRateAllowed()) {
      sendJson(res, 429, { ok: false, error: 'Command rate limit exceeded.' });
      return;
    }
    const body = await readJsonBody(req);
    if (!body.ok) {
      sendJson(res, 400, { ok: false, error: body.error || 'Invalid body.' });
      return;
    }
    const actionId = String(body.value?.actionId || '').trim();
    if (!actionId) {
      sendJson(res, 400, { ok: false, error: 'Action id is required.' });
      return;
    }
    const payload =
      body.value?.payload && typeof body.value.payload === 'object' && !Array.isArray(body.value.payload)
        ? body.value.payload
        : {};
    const confirm = body.value?.confirm === true || body.value?.confirmed === true;
    const result = await relayCommand('action.run', {
      actionId,
      payload,
      confirm
    });
    sendJson(res, result?.ok === false ? 400 : 200, result || { ok: false, error: 'No response.' });
  };

  const handleTradeLockerSwitch = async (req, res) => {
    if (!requireAuth(req, res)) return;
    if (!commandRateAllowed()) {
      sendJson(res, 429, { ok: false, error: 'Command rate limit exceeded.' });
      return;
    }
    const body = await readJsonBody(req);
    if (!body.ok) {
      sendJson(res, 400, { ok: false, error: body.error || 'Invalid body.' });
      return;
    }
    const payload =
      body.value && typeof body.value === 'object' && !Array.isArray(body.value)
        ? body.value
        : {};
    const result = await relayCommand('tradelocker.switch', payload, { timeoutMs: 60_000 });
    sendJson(res, result?.ok === false ? 400 : 200, result || { ok: false, error: 'No response.' });
  };

  const requestHandler = async (req, res) => {
    try {
      const method = String(req?.method || 'GET').toUpperCase();
      const parsedUrl = new URL(String(req?.url || '/'), 'http://127.0.0.1');
      const pathname = parsedUrl.pathname;
      if (!pathname.startsWith(API_PREFIX)) {
        sendJson(res, 404, { ok: false, error: 'Not found.' });
        return;
      }
      if (method === 'GET' && pathname === `${API_PREFIX}/events`) {
        handleEventsRequest(req, res, parsedUrl);
        return;
      }
      if (method === 'GET' && pathname === `${API_PREFIX}/health`) {
        await handleHealth(req, res);
        return;
      }
      if (method === 'GET' && pathname === `${API_PREFIX}/state`) {
        await handleState(req, res);
        return;
      }
      if (method === 'GET' && pathname === `${API_PREFIX}/actions`) {
        await handleActions(req, res);
        return;
      }
      if (method === 'GET' && pathname === `${API_PREFIX}/targets`) {
        await handleTargets(req, res);
        return;
      }
      if (method === 'POST' && pathname === `${API_PREFIX}/mode`) {
        await handleModeSet(req, res);
        return;
      }
      if (method === 'POST' && pathname === `${API_PREFIX}/emergency-stop`) {
        await handleEmergencyStop(req, res);
        return;
      }
      if (method === 'POST' && pathname === `${API_PREFIX}/action`) {
        await handleAction(req, res);
        return;
      }
      if (method === 'POST' && pathname === `${API_PREFIX}/tradelocker/switch`) {
        await handleTradeLockerSwitch(req, res);
        return;
      }
      sendJson(res, 404, { ok: false, error: 'Not found.' });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err?.message || String(err) });
    }
  };

  const start = async () => {
    if (server) {
      return {
        ok: true,
        port,
        token,
        discoveryPath
      };
    }
    disposed = false;
    token = crypto.randomBytes(32).toString('base64url');
    bridgeMode = getBridgeSnapshot()?.mode ?? null;
    startedAtMs = safeNow();
    server = http.createServer((req, res) => {
      void requestHandler(req, res);
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    const addr = server.address();
    port = Number(addr?.port || 0) || 0;
    writeDiscovery();
    appendMainLog(
      `[${new Date().toISOString()}] runtime_ops_bridge_started port=${port} discoveryPath=${discoveryPath}\n`
    );
    pushRuntimeEvent({
      source: 'runtime',
      level: 'info',
      code: 'runtime_ops_bridge_started',
      message: `Runtime Ops external bridge started on 127.0.0.1:${port}`,
      payload: {
        port,
        discoveryPath
      }
    });
    return { ok: true, port, token, discoveryPath };
  };

  const stop = async () => {
    disposed = true;
    stopHeartbeatTimer();
    for (const client of clients.values()) {
      try {
        client.res.end();
      } catch {
        // ignore
      }
    }
    clients.clear();
    if (server) {
      const current = server;
      server = null;
      await new Promise((resolve) => {
        try {
          current.close(() => resolve());
        } catch {
          resolve();
        }
      });
    }
    removeDiscovery();
    appendMainLog(`[${new Date().toISOString()}] runtime_ops_bridge_stopped\n`);
    pushRuntimeEvent({
      source: 'runtime',
      level: 'info',
      code: 'runtime_ops_bridge_stopped',
      message: 'Runtime Ops external bridge stopped'
    });
    port = 0;
    token = '';
    return { ok: true };
  };

  const onRuntimeEvent = (event) => {
    broadcastEvent(event);
  };

  const getState = () => ({
    ok: true,
    version: BRIDGE_VERSION,
    port,
    startedAtMs,
    discoveryPath,
    clients: clients.size,
    mode: getBridgeSnapshot()?.mode ?? bridgeMode ?? null,
    streamStatus: getBridgeSnapshot()?.streamStatus ?? null
  });

  return {
    start,
    stop,
    onRuntimeEvent,
    getState
  };
}

module.exports = {
  createRuntimeOpsExternalBridge
};
