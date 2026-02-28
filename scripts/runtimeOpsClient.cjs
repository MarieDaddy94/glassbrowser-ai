'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

const DISCOVERY_PATH = path.join(
  process.env.APPDATA || process.env.LOCALAPPDATA || process.cwd(),
  'glassbrowser-ai',
  'runtime-ops-bridge.json'
);

function readDiscovery() {
  if (!fs.existsSync(DISCOVERY_PATH)) {
    throw new Error(`Runtime Ops discovery file not found: ${DISCOVERY_PATH}`);
  }
  const parsed = JSON.parse(fs.readFileSync(DISCOVERY_PATH, 'utf8'));
  const port = Number(parsed?.port || 0);
  const token = String(parsed?.token || '').trim();
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid bridge port in discovery file: ${DISCOVERY_PATH}`);
  }
  if (!token) {
    throw new Error(`Missing bridge token in discovery file: ${DISCOVERY_PATH}`);
  }
  return { port, token, raw: parsed };
}

function requestJson({ method = 'GET', route = '/', body = null, timeoutMs = 20000 }) {
  const discovery = readDiscovery();
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method,
        host: '127.0.0.1',
        port: discovery.port,
        path: route,
        timeout: timeoutMs,
        headers: {
          authorization: `Bearer ${discovery.token}`,
          'content-type': 'application/json; charset=utf-8',
          ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {})
        }
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch {
            parsed = { ok: false, error: 'Invalid JSON response.', raw };
          }
          resolve({
            statusCode: Number(res.statusCode || 0),
            headers: res.headers,
            body: parsed
          });
        });
      }
    );
    req.on('timeout', () => {
      try {
        req.destroy(new Error('Request timeout.'));
      } catch {
        // ignore
      }
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = String(args[0] || '').trim().toLowerCase();
  const flags = {};
  for (let i = 1; i < args.length; i += 1) {
    const token = String(args[i] || '');
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = args[i + 1];
    if (next && !String(next).startsWith('--')) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function runStatus() {
  const health = await requestJson({ method: 'GET', route: '/runtime-ops/v1/health' });
  let state = null;
  try {
    state = await requestJson({ method: 'GET', route: '/runtime-ops/v1/state' });
  } catch (err) {
    state = {
      statusCode: 0,
      body: {
        ok: false,
        code: 'client_timeout',
        error: err?.message ? String(err.message) : 'State request failed.'
      }
    };
  }
  const healthOk = health.statusCode >= 200 && health.statusCode < 300;
  const stateReachable = state.statusCode >= 200 && state.statusCode < 300;
  const stateTimedOut = state.body?.code === 'timeout';
  const stateStale = state.body?.stale === true;
  const stateRelayOk = stateReachable && state.body?.ok !== false && !stateTimedOut && !stateStale;
  const warning =
    !healthOk
      ? `Bridge health request failed (HTTP ${health.statusCode || 0}).`
      : (!stateRelayOk
          ? (stateTimedOut
              ? 'Bridge reachable but renderer command relay timed out.'
              : (stateStale
                  ? 'Bridge reachable; state returned from stale cache fallback.'
                  : `Bridge reachable but state relay failed (HTTP ${state.statusCode || 0}).`))
          : null);
  printJson({
    ok: healthOk,
    partial: healthOk && !stateRelayOk,
    discoveryPath: DISCOVERY_PATH,
    warning,
    health: health.body,
    state: state.body
  });
}

async function runState() {
  const state = await requestJson({ method: 'GET', route: '/runtime-ops/v1/state' });
  if (!(state.statusCode >= 200 && state.statusCode < 300)) {
    printJson({
      ok: false,
      statusCode: state.statusCode,
      error: state.body?.error || 'State request failed.',
      code: state.body?.code || null,
      detail:
        state.body?.code === 'timeout'
          ? 'Bridge is up, but renderer did not answer runtime command in time.'
          : null
    });
    return;
  }
  printJson(state.body);
}

async function runMode(flags) {
  const mode = String(flags.set || '').trim();
  if (!mode) {
    throw new Error('Missing --set <autonomous|observe_only|disarmed|emergency_stop>');
  }
  const res = await requestJson({
    method: 'POST',
    route: '/runtime-ops/v1/mode',
    body: { mode }
  });
  printJson(res.body);
}

async function runActions() {
  const res = await requestJson({ method: 'GET', route: '/runtime-ops/v1/actions' });
  if (!(res.statusCode >= 200 && res.statusCode < 300)) {
    printJson({
      ok: false,
      statusCode: res.statusCode,
      error: res.body?.error || 'Actions request failed.',
      code: res.body?.code || null
    });
    return;
  }
  printJson(res.body);
}

async function loadActionCatalogSnapshot() {
  const res = await requestJson({ method: 'GET', route: '/runtime-ops/v1/actions' });
  if (!(res.statusCode >= 200 && res.statusCode < 300) || res.body?.ok === false) {
    return { ok: false, actions: [], error: res.body?.error || 'Action catalog request failed.' };
  }
  const actions = Array.isArray(res.body?.actions) ? res.body.actions : [];
  return { ok: true, actions };
}

async function runTarget() {
  const res = await requestJson({ method: 'GET', route: '/runtime-ops/v1/targets' });
  if (!(res.statusCode >= 200 && res.statusCode < 300)) {
    printJson({
      ok: false,
      statusCode: res.statusCode,
      error: res.body?.error || 'Targets request failed.',
      code: res.body?.code || null
    });
    return;
  }
  printJson(res.body);
}

async function runStop(flags) {
  const reason = String(flags.reason || 'runtime_ops_client').trim();
  const res = await requestJson({
    method: 'POST',
    route: '/runtime-ops/v1/emergency-stop',
    body: { reason }
  });
  printJson(res.body);
}

async function runAction(flags) {
  const actionId = String(flags.id || '').trim();
  if (!actionId) throw new Error('Missing --id <actionId>');
  let payload = {};
  if (flags.payload != null) {
    try {
      payload = JSON.parse(String(flags.payload));
    } catch {
      throw new Error('Invalid --payload JSON');
    }
  }
  const confirm = flags.confirm === true || String(flags.confirm || '').toLowerCase() === 'true';
  if (!confirm) {
    const catalog = await loadActionCatalogSnapshot();
    if (catalog.ok) {
      const row = catalog.actions.find((entry) => String(entry?.id || '').trim() === actionId);
      const requiresConfirm = row?.safety?.requiresConfirmation === true || row?.requiresBroker === true;
      if (requiresConfirm) {
        printJson({
          ok: false,
          code: 'confirmation_required',
          error: `Action "${actionId}" requires explicit --confirm in safe-first mode.`,
          actionId
        });
        return;
      }
    }
  }
  const res = await requestJson({
    method: 'POST',
    route: '/runtime-ops/v1/action',
    body: { actionId, payload, confirm }
  });
  printJson(res.body);
}

async function runTradeLockerSwitch(flags) {
  const profileId = flags.profile != null ? String(flags.profile).trim() : '';
  const accountKey = flags['account-key'] != null ? String(flags['account-key']).trim() : '';
  const accountIdRaw = flags['account-id'] != null ? String(flags['account-id']).trim() : '';
  const accNumRaw = flags['acc-num'] != null ? String(flags['acc-num']).trim() : '';
  const env = flags.env != null ? String(flags.env).trim().toLowerCase() : '';
  const server = flags.server != null ? String(flags.server).trim() : '';
  const email = flags.email != null ? String(flags.email).trim() : '';
  const password = flags.password != null ? String(flags.password) : '';
  const developerApiKey = flags['developer-api-key'] != null ? String(flags['developer-api-key']) : '';
  const rememberPassword =
    flags['remember-password'] === true ||
    String(flags['remember-password'] || '').toLowerCase() === 'true' ||
    String(flags['remember-password'] || '') === '1'
      ? true
      : (flags['remember-password'] === false ||
         String(flags['remember-password'] || '').toLowerCase() === 'false' ||
         String(flags['remember-password'] || '') === '0'
           ? false
           : null);
  const rememberDeveloperApiKey =
    flags['remember-developer-api-key'] === true ||
    String(flags['remember-developer-api-key'] || '').toLowerCase() === 'true' ||
    String(flags['remember-developer-api-key'] || '') === '1'
      ? true
      : (flags['remember-developer-api-key'] === false ||
         String(flags['remember-developer-api-key'] || '').toLowerCase() === 'false' ||
         String(flags['remember-developer-api-key'] || '') === '0'
           ? false
           : null);
  const accountId = accountIdRaw ? Number(accountIdRaw) : null;
  const accNum = accNumRaw ? Number(accNumRaw) : null;
  if (!profileId && !accountKey && !accountIdRaw && !env && !server && !email) {
    throw new Error(
      'Missing target. Use --profile <id>, --account-key <key>, --account-id <id> [--acc-num <n>], or direct connect flags --env/--server/--email [--password].'
    );
  }
  if (accountIdRaw && !Number.isFinite(accountId)) {
    throw new Error('Invalid --account-id value.');
  }
  if (accNumRaw && !Number.isFinite(accNum)) {
    throw new Error('Invalid --acc-num value.');
  }
  const payload = {};
  if (profileId) payload.profileId = profileId;
  if (accountKey) payload.accountKey = accountKey;
  if (Number.isFinite(accountId)) payload.accountId = accountId;
  if (Number.isFinite(accNum)) payload.accNum = accNum;
  if (env) payload.env = env;
  if (server) payload.server = server;
  if (email) payload.email = email;
  if (password) payload.password = password;
  if (developerApiKey) payload.developerApiKey = developerApiKey;
  if (rememberPassword != null) payload.rememberPassword = rememberPassword;
  if (rememberDeveloperApiKey != null) payload.rememberDeveloperApiKey = rememberDeveloperApiKey;
  const res = await requestJson({
    method: 'POST',
    route: '/runtime-ops/v1/tradelocker/switch',
    body: payload,
    timeoutMs: 70_000
  });
  printJson(res.body);
}

async function runAttach(flags) {
  await runStatus();
  await runState();
  await runTarget();
  const includeActions =
    flags.actions === true ||
    String(flags.actions || '').toLowerCase() === 'true' ||
    String(flags.actions || '') === '1';
  if (includeActions) {
    await runActions();
  }
  await runLogs({
    follow: true,
    retry: flags.retry == null ? true : flags.retry,
    replay: flags.replay != null ? flags.replay : 100
  });
}

function createSseParser(onEvent) {
  let buffer = '';
  const flushBlock = (blockText) => {
    if (!blockText) return;
    const lines = String(blockText)
      .split(/\r?\n/)
      .map((line) => String(line || ''))
      .filter((line) => line.length > 0);
    if (lines.length === 0) return;
    if (lines.every((line) => line.startsWith(':'))) return;
    let id = null;
    let eventName = 'message';
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('id:')) {
        id = line.slice(3).trim();
        continue;
      }
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim() || 'message';
        continue;
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (dataLines.length === 0) return;
    const dataRaw = dataLines.join('\n');
    let data = null;
    try {
      data = JSON.parse(dataRaw);
    } catch {
      data = dataRaw;
    }
    onEvent({ id, event: eventName, data });
  };
  return {
    push(chunk) {
      buffer += chunk.toString('utf8');
      while (true) {
        const match = buffer.match(/\r?\n\r?\n/);
        if (!match) break;
        const idx = Number(match.index || 0);
        const sep = String(match[0] || '\n\n');
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + sep.length);
        flushBlock(block);
      }
    }
  };
}

async function runLogs(flags) {
  const replayLast = Number.isFinite(Number(flags.replay))
    ? Math.max(0, Math.min(2000, Math.floor(Number(flags.replay))))
    : 100;
  const follow = flags.follow === true || String(flags.follow || '').toLowerCase() === 'true';
  const retry =
    flags.retry === true ||
    String(flags.retry || '').toLowerCase() === 'true' ||
    String(flags.retry || '').toLowerCase() === '1';
  const discovery = readDiscovery();
  const connectOnce = (replay) =>
    new Promise((resolve) => {
      const route = `/runtime-ops/v1/events?replayLast=${replay}`;
      const parser = createSseParser((evt) => {
        const ts = new Date().toISOString();
        process.stdout.write(`[${ts}] ${evt.event}${evt.id ? ` #${evt.id}` : ''} ${JSON.stringify(evt.data)}\n`);
      });
      let closed = false;
      let manualAbort = false;
      const req = http.request({
        method: 'GET',
        host: '127.0.0.1',
        port: discovery.port,
        path: route,
        headers: {
          authorization: `Bearer ${discovery.token}`,
          accept: 'text/event-stream'
        }
      });
      const finish = (result) => {
        if (closed) return;
        closed = true;
        resolve(result);
      };
      req.on('response', (res) => {
        if (Number(res.statusCode || 0) !== 200) {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            process.stderr.write(`SSE error ${res.statusCode}: ${body}\n`);
            finish({ ok: false, retryable: Number(res.statusCode || 0) >= 500 });
          });
          return;
        }
        res.on('data', (chunk) => {
          parser.push(chunk);
        });
        res.on('error', (err) => {
          if (manualAbort && !follow) {
            finish({ ok: true, retryable: false });
            return;
          }
          process.stderr.write(`SSE error: ${err?.message || String(err)}\n`);
          finish({ ok: false, retryable: follow });
        });
        res.on('close', () => {
          if (manualAbort && !follow) {
            finish({ ok: true, retryable: false });
            return;
          }
          finish({ ok: true, retryable: follow });
        });
        if (!follow) {
          setTimeout(() => {
            manualAbort = true;
            try {
              req.destroy();
            } catch {
              // ignore
            }
          }, 4000);
        }
      });
      req.on('error', (err) => {
        if (manualAbort && !follow) {
          finish({ ok: true, retryable: false });
          return;
        }
        process.stderr.write(`${err?.message || String(err)}\n`);
        finish({ ok: false, retryable: follow });
      });
      req.end();
    });

  let attempt = 0;
  while (true) {
    const replay = attempt === 0 ? replayLast : 0;
    const res = await connectOnce(replay);
    if (!follow) break;
    if (!retry) {
      if (!res.ok) process.exitCode = 1;
      break;
    }
    if (!res.retryable) {
      if (!res.ok) process.exitCode = 1;
      break;
    }
    attempt += 1;
    const delayMs = Math.min(10_000, 1000 * attempt);
    process.stderr.write(`SSE stream closed. Retrying in ${delayMs}ms...\n`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

function printUsage() {
  const file = path.join(__dirname, 'runtimeOpsClient.help.txt');
  if (fs.existsSync(file)) {
    process.stdout.write(`${fs.readFileSync(file, 'utf8')}\n`);
    return;
  }
  process.stdout.write('Usage: node scripts/runtimeOpsClient.cjs <status|state|target|actions|logs|mode|stop|action|tl-switch|attach>\n');
}

async function main() {
  const { command, flags } = parseArgs(process.argv);
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return;
  }
  if (command === 'status') {
    await runStatus();
    return;
  }
  if (command === 'state') {
    await runState();
    return;
  }
  if (command === 'logs') {
    await runLogs(flags);
    return;
  }
  if (command === 'mode') {
    await runMode(flags);
    return;
  }
  if (command === 'actions') {
    await runActions();
    return;
  }
  if (command === 'target' || command === 'targets') {
    await runTarget();
    return;
  }
  if (command === 'stop') {
    await runStop(flags);
    return;
  }
  if (command === 'action') {
    await runAction(flags);
    return;
  }
  if (command === 'tl-switch' || command === 'tradelocker-switch') {
    await runTradeLockerSwitch(flags);
    return;
  }
  if (command === 'attach') {
    await runAttach(flags);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((err) => {
  const message = err?.message ? String(err.message) : String(err);
  if (message.toLowerCase().includes('discovery file not found')) {
    process.stderr.write(`${message}\n`);
    process.stderr.write('Tip: launch GlassBrowser AI and wait for runtime_ops_bridge_started in main.log, then retry.\n');
    process.exitCode = 1;
    return;
  }
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
