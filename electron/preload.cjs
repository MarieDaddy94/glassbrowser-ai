const { contextBridge, ipcRenderer, clipboard } = require('electron');
let WebSocketImpl = null;
try {
  WebSocketImpl = require('ws');
} catch {
  WebSocketImpl = null;
}

const FALLBACK_ALLOWED_SCOPES = [
  'bridge',
  'clipboard',
  'capture',
  'file',
  'mt5',
  'window',
  'diagnostics',
  'news',
  'telegram',
  'broker',
  'tradelocker',
  'tradeLedger',
  'codebase',
  'agentRunner',
  'secrets',
  'openai',
  'gemini',
  'live',
  'calendar'
];

const resolveScopeModuleAttempts = () => {
  const cwd =
    typeof process !== 'undefined' && process && typeof process.cwd === 'function'
      ? process.cwd()
      : '';
  const cwdNormalized = String(cwd || '').replace(/\\/g, '/').replace(/\/+$/g, '');
  const cwdAttempts = cwdNormalized
    ? [`${cwdNormalized}/electron/generated/ipcScopes.cjs`, `${cwdNormalized}/generated/ipcScopes.cjs`]
    : [];
  return [
    './generated/ipcScopes.cjs',
    '../generated/ipcScopes.cjs',
    ...cwdAttempts
  ];
};

const loadGeneratedAllowedScopes = () => {
  const attempts = resolveScopeModuleAttempts();
  for (const modulePath of attempts) {
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const loaded = require(modulePath);
      const scopes = Array.isArray(loaded?.ALLOWED_SCOPES)
        ? loaded.ALLOWED_SCOPES.map((scope) => String(scope || '').trim()).filter(Boolean)
        : [];
      if (scopes.length > 0) {
        return {
          scopes,
          source: modulePath,
          attempts
        };
      }
    } catch {
      // continue to fallback source
    }
  }
  return {
    scopes: FALLBACK_ALLOWED_SCOPES.slice(),
    source: 'fallback_inline',
    attempts
  };
};

const GENERATED_SCOPE_LOAD = loadGeneratedAllowedScopes();
if (GENERATED_SCOPE_LOAD.source === 'fallback_inline') {
  try {
    console.warn('[preload] generated scope module missing; falling back to inline allowlist', {
      attempts: GENERATED_SCOPE_LOAD.attempts
    });
  } catch {
    // ignore console serialization issues
  }
}

let liveSocket = null;
let lastCaptureError = null;
const liveListeners = {
  open: new Set(),
  message: new Set(),
  close: new Set(),
  error: new Set()
};

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const permissionState = {
  scopes: new Set(),
  source: null,
  allowAll: false
};
const ALLOWED_SCOPES = new Set(
  Array.isArray(GENERATED_SCOPE_LOAD.scopes) && GENERATED_SCOPE_LOAD.scopes.length > 0
    ? GENERATED_SCOPE_LOAD.scopes
    : FALLBACK_ALLOWED_SCOPES
);

const normalizeScopeList = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  const raw = String(value || '').trim();
  if (!raw) return [];
  return raw.split(/[,\s]+/g).map((entry) => entry.trim()).filter(Boolean);
};

const setPermissions = (input = {}) => {
  if (!isPlainObject(input)) return { ok: false, error: 'Invalid permissions payload.' };
  const source = String(input.source || '').trim();
  if (!source) return { ok: false, error: 'Permission source required.' };
  const scopes = normalizeScopeList(input.scopes || input.scope || input.permissions);
  const acceptedScopes = Array.from(new Set(scopes.filter((scope) => ALLOWED_SCOPES.has(scope))));
  const unknown = scopes.filter((scope) => !ALLOWED_SCOPES.has(scope));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown permission scope(s): ${unknown.join(', ')}`,
      unknownScopes: Array.from(new Set(unknown)),
      acceptedScopes
    };
  }
  permissionState.scopes = new Set(acceptedScopes);
  permissionState.source = source;
  permissionState.allowAll = input.allowAll === true;
  return {
    ok: true,
    scopes: Array.from(permissionState.scopes),
    source: permissionState.source,
    allowAll: permissionState.allowAll
  };
};

const getPermissions = () => ({
  ok: true,
  scopes: Array.from(permissionState.scopes),
  source: permissionState.source,
  allowAll: permissionState.allowAll
});

const getAllowedScopes = () => ({
  ok: true,
  scopes: Array.from(ALLOWED_SCOPES)
});

const hasPermission = (scope) => {
  if (permissionState.allowAll) return true;
  if (!permissionState.source) return false;
  return permissionState.scopes.has(scope);
};

const denyResult = (scope, label) => ({
  ok: false,
  error: `Permission denied (${scope}).`,
  code: 'permission_denied',
  scope,
  label: label || scope
});
const invoke = (channel, args) => {
  if (args == null) return ipcRenderer.invoke(channel);
  if (!isPlainObject(args)) return ipcRenderer.invoke(channel, args);
  return ipcRenderer.invoke(channel, args);
};

const invokeWithMeta = (channel, payload, meta = {}) => {
  const metaObj = isPlainObject(meta) ? meta : { requestId: String(meta || '') };
  return ipcRenderer.invoke(channel, { __meta: metaObj, payload });
};

const guardedInvoke = (scope, channel, args) => {
  if (!hasPermission(scope)) return Promise.resolve(denyResult(scope, channel));
  return invoke(channel, args);
};

const guardedInvokeWithMeta = (scope, channel, payload, meta = {}) => {
  if (!hasPermission(scope)) return Promise.resolve(denyResult(scope, channel));
  return invokeWithMeta(channel, payload, meta);
};

const responsesStreamListeners = new Set();
ipcRenderer.on('openai:responsesStream:event', (_evt, payload) => {
  for (const fn of responsesStreamListeners) {
    try { fn(payload); } catch { /* ignore */ }
  }
});

const telegramUpdateListeners = new Set();
ipcRenderer.on('telegram:update', (_evt, payload) => {
  for (const fn of telegramUpdateListeners) {
    try { fn(payload); } catch { /* ignore */ }
  }
});

const tradelockerStreamListeners = new Set();
ipcRenderer.on('tradelocker:stream:event', (_evt, payload) => {
  for (const fn of tradelockerStreamListeners) {
    try { fn(payload); } catch { /* ignore */ }
  }
});

const emit = (event, payload) => {
  const set = liveListeners[event];
  if (!set) return;
  for (const fn of set) {
    try { fn(payload); } catch { /* ignore */ }
  }
};

const closeLive = () => {
  if (!hasPermission('live')) return;
  if (liveSocket) {
    try { liveSocket.close(); } catch {}
  }
  liveSocket = null;
};

const connectLive = ({ apiKey, model, systemInstruction, tools } = {}) => {
  if (!hasPermission('live')) {
    emit('error', { message: 'Permission denied (live).' });
    return;
  }
  closeLive();
  if (!WebSocketImpl) {
    emit('error', { message: 'Live bridge unavailable (ws module failed to load).' });
    return;
  }

  const doConnect = (key) => {
    const finalKey = String(key || '').trim();
    if (!finalKey) {
      emit('error', { message: 'OpenAI API key missing.' });
      return;
    }
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;

    liveSocket = new WebSocketImpl(url, {
      headers: {
        Authorization: `Bearer ${finalKey}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    liveSocket.on('open', () => {
      emit('open');
      try {
        liveSocket.send(JSON.stringify({
          type: 'session.update',
          session: {
            instructions: systemInstruction,
            tools,
            tool_choice: 'auto',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            turn_detection: { type: 'server_vad' },
            modalities: ['audio']
          }
        }));
      } catch (e) {
        emit('error', { message: e?.message || String(e) });
      }
    });

    liveSocket.on('message', (data) => {
      emit('message', data.toString());
    });

    liveSocket.on('close', () => {
      emit('close');
      liveSocket = null;
    });

    liveSocket.on('error', (err) => {
      emit('error', { message: err?.message || String(err) });
    });
  };

  if (apiKey) {
    doConnect(apiKey);
  } else {
    guardedInvoke('secrets', 'secrets:getOpenAIKey')
      .then((res) => {
        if (res?.ok && res.key) doConnect(res.key);
        else emit('error', { message: res?.error || 'OpenAI API key missing.' });
      })
      .catch((err) => emit('error', { message: err?.message || 'OpenAI API key missing.' }));
  }
};

const sendAudio = (base64Pcm16) => {
  if (!hasPermission('live')) return;
  if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) return;
  liveSocket.send(JSON.stringify({
    type: 'input_audio_buffer.append',
    audio: base64Pcm16
  }));
};

const sendEvent = (event) => {
  if (!hasPermission('live')) return;
  if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) return;
  liveSocket.send(JSON.stringify(event));
};

const sendImage = ({ mimeType, data, text }) => {
  if (!hasPermission('live')) return;
  if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) return;
  const hasPrefix = typeof data === 'string' && data.startsWith('data:');
  const dataUrl = hasPrefix ? data : `data:${mimeType || 'image/jpeg'};base64,${data}`;
  // Inject an image into the conversation without forcing an immediate response.
  const content = [];
  if (typeof text === 'string' && text.trim().length > 0) {
    content.push({ type: 'input_text', text: text.trim() });
  }
  content.push({ type: 'input_image', image_url: dataUrl });
  sendEvent({
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'user',
      content
    }
  });
};

const captureWebContents = async (webContentsId, options = {}) => {
  try {
    const id = Number(webContentsId);
    if (!Number.isFinite(id)) {
      lastCaptureError = 'Invalid webContentsId.';
      return null;
    }
    const res = await guardedInvoke('capture', 'glass:captureWebContents', { webContentsId: id, options });
    if (!res || res.ok !== true) {
      lastCaptureError = res?.error ? String(res.error) : 'Capture failed.';
      return null;
    }
    if (!res.data) {
      lastCaptureError = 'Capture returned empty image.';
      return null;
    }
    lastCaptureError = null;
    return { mimeType: res.mimeType || 'image/jpeg', data: String(res.data) };
  } catch (e) {
    lastCaptureError = e?.message ? String(e.message) : 'Capture failed.';
    return null;
  }
};

const captureNativeSnapshot = async (options = {}) => {
  try {
    const opts = options && typeof options === 'object' ? options : {};
    const res = await guardedInvoke('capture', 'glass:captureNativeSnapshot', { options: opts });
    if (!res || res.ok !== true) {
      lastCaptureError = res?.error ? String(res.error) : 'Capture failed.';
      return null;
    }
    if (!res.data) {
      lastCaptureError = 'Capture returned empty image.';
      return null;
    }
    lastCaptureError = null;
    return { mimeType: res.mimeType || 'image/jpeg', data: String(res.data) };
  } catch (e) {
    lastCaptureError = e?.message ? String(e.message) : 'Capture failed.';
    return null;
  }
};

const saveUserFile = async (args = {}) => {
  try {
    const res = await guardedInvoke('file', 'glass:saveUserFile', args || {});
    if (!res || res.ok !== true) {
      return { ok: false, error: res?.error ? String(res.error) : 'Save failed.' };
    }
    return { ok: true, path: res.path, filename: res.filename, mimeType: res.mimeType };
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : 'Save failed.' };
  }
};

const on = (event, handler) => {
  const set = liveListeners[event];
  if (!set) return () => {};
  set.add(handler);
  return () => set.delete(handler);
};

const guardedOn = (event, handler) => {
  if (!hasPermission('live')) return () => {};
  return on(event, handler);
};

const onResponsesStreamEvent = (handler) => {
  if (typeof handler !== 'function') return () => {};
  responsesStreamListeners.add(handler);
  return () => responsesStreamListeners.delete(handler);
};

const guardedOnResponsesStreamEvent = (handler) => {
  if (!hasPermission('openai')) return () => {};
  return onResponsesStreamEvent(handler);
};

const onTradeLockerStreamEvent = (handler) => {
  if (typeof handler !== 'function') return () => {};
  tradelockerStreamListeners.add(handler);
  return () => tradelockerStreamListeners.delete(handler);
};

const guardedOnTradeLockerStreamEvent = (handler) => {
  if (!hasPermission('tradelocker')) return () => {};
  return onTradeLockerStreamEvent(handler);
};

const onTelegramUpdate = (handler) => {
  if (typeof handler !== 'function') return () => {};
  telegramUpdateListeners.add(handler);
  return () => telegramUpdateListeners.delete(handler);
};

const guardedOnTelegramUpdate = (handler) => {
  if (!hasPermission('telegram')) return () => {};
  return onTelegramUpdate(handler);
};

contextBridge.exposeInMainWorld('glass', {
  isElectron: true,
  permissions: {
    set: setPermissions,
    get: getPermissions,
    allowedScopes: getAllowedScopes
  },
  invokeWithMeta: (channel, payload, meta) => guardedInvokeWithMeta('bridge', channel, payload, meta),
  getLastCaptureError: () => (hasPermission('capture') ? lastCaptureError : null),
  clipboard: {
    readText: () => {
      if (!hasPermission('clipboard')) return '';
      try {
        return clipboard.readText();
      } catch {
        return '';
      }
    },
    writeText: (text) => {
      if (!hasPermission('clipboard')) return false;
      try {
        clipboard.writeText(String(text ?? ''));
        return true;
      } catch {
        return false;
      }
    }
  },
  captureWebContents,
  captureNativeSnapshot,
  saveUserFile,
  mt5: {
    startBridge: () => guardedInvoke('mt5', 'mt5Bridge:start'),
    getBridgeStatus: () => guardedInvoke('mt5', 'mt5Bridge:status'),
    openBridgeLog: () => guardedInvoke('mt5', 'mt5Bridge:openLog')
  },
  window: {
    setFullscreen: (args) => guardedInvoke('window', 'window:setFullscreen', args),
    getFullscreen: () => guardedInvoke('window', 'window:getFullscreen')
  },
  diagnostics: {
    getAppMeta: () => guardedInvoke('diagnostics', 'diagnostics:getAppMeta'),
    getMainLog: (args) => guardedInvoke('diagnostics', 'diagnostics:getMainLog', args),
    listReleases: (args) => guardedInvoke('diagnostics', 'diagnostics:listReleases', args),
    getBundleStats: () => guardedInvoke('diagnostics', 'diagnostics:getBundleStats')
  },
  news: {
    getSnapshot: (args) => guardedInvoke('news', 'news:getSnapshot', args)
  },
  calendar: {
    getEvents: (args) => guardedInvoke('calendar', 'calendar:getEvents', args)
  },
  telegram: {
    sendMessage: (args) => guardedInvoke('telegram', 'telegram:sendMessage', args),
    sendPhoto: (args) => guardedInvoke('telegram', 'telegram:sendPhoto', args),
    answerCallback: (args) => guardedInvoke('telegram', 'telegram:answerCallback', args),
    startPolling: (args) => guardedInvoke('telegram', 'telegram:startPolling', args),
    stopPolling: () => guardedInvoke('telegram', 'telegram:stopPolling'),
    onUpdate: guardedOnTelegramUpdate
  },
  broker: {
    list: () => guardedInvoke('broker', 'broker:list'),
    getActive: () => guardedInvoke('broker', 'broker:getActive'),
    setActive: (brokerId) => guardedInvoke('broker', 'broker:setActive', { brokerId }),
    request: (args) => guardedInvoke('broker', 'broker:request', args)
  },
  tradelocker: {
    getSavedConfig: () => guardedInvoke('tradelocker', 'tradelocker:getSavedConfig'),
    updateSavedConfig: (patch) => guardedInvoke('tradelocker', 'tradelocker:updateSavedConfig', patch),
    clearSavedSecrets: () => guardedInvoke('tradelocker', 'tradelocker:clearSavedSecrets'),

    connect: (opts) => guardedInvoke('tradelocker', 'tradelocker:connect', opts),
    disconnect: () => guardedInvoke('tradelocker', 'tradelocker:disconnect'),
    getStatus: () => guardedInvoke('tradelocker', 'tradelocker:status'),
    getRateLimitPolicy: () => guardedInvoke('tradelocker', 'tradelocker:getRateLimitPolicy'),
    setRateLimitPolicy: (args) => guardedInvoke('tradelocker', 'tradelocker:setRateLimitPolicy', args),

    getAccounts: () => guardedInvoke('tradelocker', 'tradelocker:getAccounts'),
    setActiveAccount: (account) => guardedInvoke('tradelocker', 'tradelocker:setActiveAccount', account),
    setTradingOptions: (options) => guardedInvoke('tradelocker', 'tradelocker:setTradingOptions', options),
    searchInstruments: (args) => guardedInvoke('tradelocker', 'tradelocker:searchInstruments', args),

    getSnapshot: (opts) => guardedInvoke('tradelocker', 'tradelocker:getSnapshot', opts),
    getAccountMetrics: (opts) => guardedInvoke('tradelocker', 'tradelocker:getAccountMetrics', opts),
    getOrders: () => guardedInvoke('tradelocker', 'tradelocker:getOrders'),
    getOrdersHistory: () => guardedInvoke('tradelocker', 'tradelocker:getOrdersHistory'),
    getOrderDetails: (args) => guardedInvoke('tradelocker', 'tradelocker:getOrderDetails', args),
    getPositionDetails: (args) => guardedInvoke('tradelocker', 'tradelocker:getPositionDetails', args),
    getQuote: (args) => guardedInvoke('tradelocker', 'tradelocker:getQuote', args),
    getQuotes: (args) => guardedInvoke('tradelocker', 'tradelocker:getQuotes', args),
    getHistory: (args) => guardedInvoke('tradelocker', 'tradelocker:getHistory', args),
    getHistorySeries: (args) => guardedInvoke('tradelocker', 'tradelocker:getHistorySeries', args),
    getDailyBar: (args) => guardedInvoke('tradelocker', 'tradelocker:getDailyBar', args),
    getInstrumentConstraints: (args) => guardedInvoke('tradelocker', 'tradelocker:getInstrumentConstraints', args),
    getInstrumentDetails: (args) => guardedInvoke('tradelocker', 'tradelocker:getInstrumentDetails', args),
    getSessionDetails: (args) => guardedInvoke('tradelocker', 'tradelocker:getSessionDetails', args),
    getSessionStatus: (args) => guardedInvoke('tradelocker', 'tradelocker:getSessionStatus', args),
    getStreamStatus: () => guardedInvoke('tradelocker', 'tradelocker:getStreamStatus'),
    startStream: () => guardedInvoke('tradelocker', 'tradelocker:startStream'),
    stopStream: () => guardedInvoke('tradelocker', 'tradelocker:stopStream'),
    onStreamEvent: guardedOnTradeLockerStreamEvent,
    cancelOrder: (args) => guardedInvoke('tradelocker', 'tradelocker:cancelOrder', args),
    modifyOrder: (args) => guardedInvoke('tradelocker', 'tradelocker:modifyOrder', args),
    modifyPosition: (args) => guardedInvoke('tradelocker', 'tradelocker:modifyPosition', args),
    closePosition: (args) => guardedInvoke('tradelocker', 'tradelocker:closePosition', args),
    placeOrder: (args) => guardedInvoke('tradelocker', 'tradelocker:placeOrder', args)
  },
  tradeLedger: {
    append: (entry) => guardedInvoke('tradeLedger', 'tradeLedger:append', entry),
    reserve: (args) => guardedInvoke('tradeLedger', 'tradeLedger:reserve', args),
    update: (args) => guardedInvoke('tradeLedger', 'tradeLedger:update', args),
    list: (args) => guardedInvoke('tradeLedger', 'tradeLedger:list', args),
    listEvents: (args) => guardedInvoke('tradeLedger', 'tradeLedger:listEvents', args),
    findRecent: (args) => guardedInvoke('tradeLedger', 'tradeLedger:findRecent', args),
    addMemory: (memory) => guardedInvoke('tradeLedger', 'tradeLedger:addMemory', memory),
    listMemories: (args) => guardedInvoke('tradeLedger', 'tradeLedger:listMemories', args),
    updateMemory: (args) => guardedInvoke('tradeLedger', 'tradeLedger:updateMemory', args),
    deleteMemory: (args) => guardedInvoke('tradeLedger', 'tradeLedger:deleteMemory', args),
    clearMemories: () => guardedInvoke('tradeLedger', 'tradeLedger:clearMemories'),
    upsertAgentMemory: (memory) => guardedInvoke('tradeLedger', 'tradeLedger:upsertAgentMemory', memory),
    getAgentMemory: (args) => guardedInvoke('tradeLedger', 'tradeLedger:getAgentMemory', args),
    listAgentMemory: (args) => guardedInvoke('tradeLedger', 'tradeLedger:listAgentMemory', args),
    deleteAgentMemory: (args) => guardedInvoke('tradeLedger', 'tradeLedger:deleteAgentMemory', args),
    clearAgentMemory: () => guardedInvoke('tradeLedger', 'tradeLedger:clearAgentMemory'),
    getOptimizerEvalCache: (args) => guardedInvoke('tradeLedger', 'tradeLedger:getOptimizerEvalCache', args),
    putOptimizerEvalCache: (args) => guardedInvoke('tradeLedger', 'tradeLedger:putOptimizerEvalCache', args),
    pruneOptimizerEvalCache: (args) => guardedInvoke('tradeLedger', 'tradeLedger:pruneOptimizerEvalCache', args),
    createExperimentNote: (args) => guardedInvoke('tradeLedger', 'tradeLedger:createExperimentNote', args),
    getExperimentNote: (args) => guardedInvoke('tradeLedger', 'tradeLedger:getExperimentNote', args),
    listExperimentNotes: (args) => guardedInvoke('tradeLedger', 'tradeLedger:listExperimentNotes', args),
    createOptimizerWinner: (args) => guardedInvoke('tradeLedger', 'tradeLedger:createOptimizerWinner', args),
    getOptimizerWinner: (args) => guardedInvoke('tradeLedger', 'tradeLedger:getOptimizerWinner', args),
    getOptimizerWinnerBySessionRound: (args) => guardedInvoke('tradeLedger', 'tradeLedger:getOptimizerWinnerBySessionRound', args),
    listOptimizerWinners: (args) => guardedInvoke('tradeLedger', 'tradeLedger:listOptimizerWinners', args),
    createResearchSession: (args) => guardedInvoke('tradeLedger', 'tradeLedger:createResearchSession', args),
    getResearchSession: (args) => guardedInvoke('tradeLedger', 'tradeLedger:getResearchSession', args),
    listResearchSessions: (args) => guardedInvoke('tradeLedger', 'tradeLedger:listResearchSessions', args),
    appendResearchStep: (args) => guardedInvoke('tradeLedger', 'tradeLedger:appendResearchStep', args),
    listResearchSteps: (args) => guardedInvoke('tradeLedger', 'tradeLedger:listResearchSteps', args),
    createPlaybookRun: (args) => guardedInvoke('tradeLedger', 'tradeLedger:createPlaybookRun', args),
    getPlaybookRun: (args) => guardedInvoke('tradeLedger', 'tradeLedger:getPlaybookRun', args),
    listPlaybookRuns: (args) => guardedInvoke('tradeLedger', 'tradeLedger:listPlaybookRuns', args),
    stats: () => guardedInvoke('tradeLedger', 'tradeLedger:stats'),
    flush: () => guardedInvoke('tradeLedger', 'tradeLedger:flush')
  },
  codebase: {
    listFiles: (args) => guardedInvoke('codebase', 'codebase:listFiles', args),
    search: (args) => guardedInvoke('codebase', 'codebase:search', args),
    readFile: (args) => guardedInvoke('codebase', 'codebase:readFile', args),
    traceDataflow: (args) => guardedInvoke('codebase', 'codebase:traceDataflow', args)
  },
  agentRunner: {
    evaluateSignal: (input) => guardedInvoke('agentRunner', 'agentRunner:evaluateSignal', { input }),
    getStatus: () => guardedInvoke('agentRunner', 'agentRunner:status'),
    cancel: (input) => guardedInvoke('agentRunner', 'agentRunner:cancel', { input })
  },
  secrets: {
    getStatus: () => guardedInvoke('secrets', 'secrets:getStatus'),
    setOpenAIKey: (args) => guardedInvoke('secrets', 'secrets:setOpenAIKey', args),
    clearOpenAIKey: () => guardedInvoke('secrets', 'secrets:clearOpenAIKey'),
    setGeminiKey: (args) => guardedInvoke('secrets', 'secrets:setGeminiKey', args),
    clearGeminiKey: () => guardedInvoke('secrets', 'secrets:clearGeminiKey')
  },
  openai: {
    responses: (args) => guardedInvoke('openai', 'openai:responses', args),
    images: (args) => guardedInvoke('openai', 'openai:images', args),
    responsesStream: (args) => guardedInvoke('openai', 'openai:responsesStream', args),
    onStreamEvent: guardedOnResponsesStreamEvent
  },
  gemini: {
    tts: (args) => guardedInvoke('gemini', 'gemini:tts', args)
  },
  live: {
    connect: connectLive,
    sendAudio,
    sendImage,
    sendEvent,
    close: closeLive,
    on: guardedOn
  }
});


