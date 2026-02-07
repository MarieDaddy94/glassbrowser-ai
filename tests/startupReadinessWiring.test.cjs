const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'App.tsx');

test('App uses startup readiness hook wiring', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.equal(source.includes("import { useStartupReadiness } from './hooks/useStartupReadiness';"), true);
  assert.equal(source.includes('} = useStartupReadiness({'), true);
  assert.equal(source.includes('startupStatus: startupReadinessStatus'), true);
});

test('legacy inline startup bootstrap block removed from App', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.equal(source.includes('const bootstrapPermissionsAndReadiness = useCallback'), false);
  assert.equal(source.includes("runStartupBootstrap((window as any)?.glass"), false);
});

test('pre-trade startup bridge reads use safe ref indirection', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.equal(source.includes('const startupBridgeGateRef = React.useRef<{ ready: boolean; error: string | null }>({'), true);
  assert.equal(source.includes('bridgeReady: startupBridgeGateRef.current.ready'), true);
  assert.equal(source.includes('bridgeError: startupBridgeGateRef.current.error'), true);
  const bridgeReadyDirectHits = (source.match(/bridgeReady:\s*startupBridgeReady/g) || []).length;
  const bridgeErrorDirectHits = (source.match(/bridgeError:\s*startupBridgeError/g) || []).length;
  assert.equal(bridgeReadyDirectHits, 1);
  assert.equal(bridgeErrorDirectHits, 0);
  assert.equal(source.includes('startupBridgeGateRef.current.ready = startupBridgeReady;'), true);
  assert.equal(source.includes('startupBridgeGateRef.current.error = startupBridgeError ? String(startupBridgeError) : null;'), true);
});

test('pre-trade tradelocker reads use safe ref indirection', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.equal(source.includes('const tradeLockerExecutionGateRef = React.useRef<{ connected: boolean; upstreamBlockedUntilMs: number | null }>({'), true);
  assert.equal(source.includes("brokerConnected: targetBroker === 'tradelocker' ? tradeLockerExecutionGateRef.current.connected : true"), true);
  assert.equal(source.includes("upstreamBlockedUntilMs: targetBroker === 'tradelocker' ? tradeLockerExecutionGateRef.current.upstreamBlockedUntilMs : null"), true);
  assert.equal(source.includes("brokerConnected: targetBroker === 'tradelocker' ? tlStatus === 'connected' : true"), false);
  assert.equal(source.includes("upstreamBlockedUntilMs: targetBroker === 'tradelocker' ? tlUpstreamBlockedUntilMs : null"), false);
  assert.equal(source.includes("tradeLockerExecutionGateRef.current.connected = tlStatus === 'connected';"), true);
  assert.equal(source.includes('tradeLockerExecutionGateRef.current.upstreamBlockedUntilMs ='), true);
  const tlStatusDeclAt = source.indexOf('status: tlStatus,');
  const tlBlockedDeclAt = source.indexOf('upstreamBlockedUntilMs: tlUpstreamBlockedUntilMs,');
  assert.notEqual(tlStatusDeclAt, -1);
  assert.notEqual(tlBlockedDeclAt, -1);
  const beforeTlStatusDecl = source.slice(0, tlStatusDeclAt);
  const beforeTlBlockedDecl = source.slice(0, tlBlockedDeclAt);
  assert.equal(beforeTlStatusDecl.includes('tlStatus'), false);
  assert.equal(beforeTlBlockedDecl.includes('tlUpstreamBlockedUntilMs'), false);
});
