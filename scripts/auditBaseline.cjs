#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'artifacts');
const OUT_FILE = path.join(OUT_DIR, 'enterprise-baseline.json');

const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

function countMatches(source, regex) {
  if (!source) return 0;
  const matches = source.match(regex);
  return matches ? matches.length : 0;
}

function safeJson(relPath, fallback = null) {
  try {
    return JSON.parse(read(relPath));
  } catch {
    return fallback;
  }
}

function buildAppComplexity(appSource) {
  const lines = appSource.split(/\r?\n/);
  return {
    lines: lines.length,
    bytes: Buffer.byteLength(appSource, 'utf8'),
    hooks: {
      useState: countMatches(appSource, /\buseState\s*\(/g),
      useEffect: countMatches(appSource, /\buseEffect\s*\(/g),
      useMemo: countMatches(appSource, /\buseMemo\s*\(/g),
      useCallback: countMatches(appSource, /\buseCallback\s*\(/g),
      useRef: countMatches(appSource, /\buseRef\s*\(/g)
    },
    orchestrationSignals: {
      lazyImports: countMatches(appSource, /React\.lazy\s*\(/g),
      dynamicImports: countMatches(appSource, /\bimport\(['"`]/g),
      inlineIntervals: countMatches(appSource, /\bsetInterval\s*\(/g),
      inlineTimeouts: countMatches(appSource, /\bsetTimeout\s*\(/g)
    }
  };
}

function buildRenderHotspots(appSource, componentFiles) {
  const source = [appSource].concat(componentFiles.map((rel) => read(rel))).join('\n');
  return {
    requestAnimationFrameCalls: countMatches(source, /\brequestAnimationFrame\s*\(/g),
    debounceMentions: countMatches(source, /\bdebounce\b/gi),
    throttleMentions: countMatches(source, /\bthrottl/gi),
    workerMentions: countMatches(source, /\bnew Worker\s*\(/g),
    reactMemoMentions: countMatches(source, /\bReact\.memo\s*\(/g)
  };
}

function buildIpcSurface(contractJson) {
  const channels = Array.isArray(contractJson?.channels) ? contractJson.channels : [];
  const byScope = {};
  for (const channel of channels) {
    const scopes = Array.isArray(channel?.scopes) ? channel.scopes : [];
    for (const scope of scopes) {
      byScope[scope] = (byScope[scope] || 0) + 1;
    }
  }
  return {
    totalChannels: channels.length,
    scopes: Object.keys(byScope)
      .sort()
      .map((scope) => ({ scope, channels: byScope[scope] }))
  };
}

function buildWebviewUsageMap() {
  const browserView = read('components/BrowserView.tsx');
  const main = read('electron/main.cjs');
  const rootMain = read('main.cjs');
  return {
    browserView: {
      hasWebviewElement: /<webview\b/.test(browserView),
      hasPersistPartition: /partition=["']persist:glass["']/.test(browserView),
      webpreferencesString: /webpreferences=/.test(browserView)
    },
    electronMain: {
      hasWillAttachWebviewGuard: /will-attach-webview/.test(main),
      hasAllowedProtocolGuard: /isAllowedWebviewUrl/.test(main),
      hasWindowOpenHandler: /setWindowOpenHandler/.test(main),
      hasWebviewTagEnabled: /webviewTag:\s*true/.test(main)
    },
    rootMainMirror: {
      hasWillAttachWebviewGuard: /will-attach-webview/.test(rootMain),
      hasAllowedProtocolGuard: /isAllowedWebviewUrl/.test(rootMain),
      hasWindowOpenHandler: /setWindowOpenHandler/.test(rootMain),
      hasWebviewTagEnabled: /webviewTag:\s*true/.test(rootMain)
    }
  };
}

function buildSidecarLifecycleMap() {
  const main = read('electron/main.cjs');
  return {
    usesSpawn: /spawn\s*\(/.test(main),
    watchdogIntervalMs: (() => {
      const m = main.match(/setInterval\(\(\)\s*=>\s*\{[\s\S]*?\}\s*,\s*(\d+)\s*\)/m);
      return m ? Number(m[1]) : null;
    })(),
    hasRestartTimer: /mt5BridgeRestartTimer/.test(main),
    hasHealthCheck: /checkHealth\(/.test(main),
    hasGracefulStop: /function stopMt5Bridge\(/.test(main),
    hasForceRestartHandler: /mt5Bridge:forceRestart/.test(main),
    hasHeartbeatIpc: /mt5Bridge:heartbeat/.test(main),
    hasLifecycleStatusIpc: /mt5Bridge:lifecycleStatus/.test(main)
  };
}

function buildScorecard(baseline) {
  const scorecard = [];
  const appLines = Number(baseline?.appComplexity?.lines || 0);
  scorecard.push({
    id: 'app_monolith',
    needed: appLines > 20000,
    detail: `App.tsx lines=${appLines}`
  });
  scorecard.push({
    id: 'ipc_security_audit',
    needed: true,
    detail: 'Security audit snapshots should be enforced per release.'
  });
  scorecard.push({
    id: 'mt5_bridge_auth',
    needed: true,
    detail: 'Bridge token auth should be required for local sidecar endpoints.'
  });
  scorecard.push({
    id: 'e2e_coverage',
    needed: true,
    detail: 'End-to-end Electron coverage should gate release.'
  });
  return scorecard;
}

function main() {
  const appSource = read('App.tsx');
  const packageJson = safeJson('package.json', {});
  const contractJson = safeJson('contracts/ipc.contract.json', { channels: [] });
  const baseline = {
    generatedAtMs: Date.now(),
    generatedAtIso: new Date().toISOString(),
    appVersion: String(packageJson?.version || 'unknown'),
    appComplexity: buildAppComplexity(appSource),
    renderHotspots: buildRenderHotspots(appSource, [
      'components/BacktesterInterface.tsx',
      'components/ChatInterface.tsx',
      'components/MonitorInterface.tsx'
    ]),
    ipcSurface: buildIpcSurface(contractJson),
    webviewUsage: buildWebviewUsageMap(),
    sidecarLifecycle: buildSidecarLifecycleMap()
  };
  baseline.scorecard = buildScorecard(baseline);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(baseline, null, 2), 'utf8');
  console.log(`[audit:baseline] wrote ${OUT_FILE}`);
  console.log(
    `[audit:baseline] appLines=${baseline.appComplexity.lines} channels=${baseline.ipcSurface.totalChannels} scorecard=${baseline.scorecard.length}`
  );
}

main();
