import { hashStringSampled } from './stringHash';

const normalizeText = (value: any) => String(value || '').trim();

const normalizeSymbol = (value: any) => normalizeText(value).toUpperCase();

const normalizeTimeframe = (value: any) => normalizeText(value).toLowerCase();

const normalizeAction = (value: any) => {
  const key = normalizeText(value).toUpperCase();
  return key === 'SELL' ? 'SELL' : 'BUY';
};

const normalizeMode = (value: any) => {
  const key = normalizeText(value).toLowerCase();
  return key || 'na';
};

const normalizePrice = (value: any) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 'na';
  return String(Math.round(num * 100_000) / 100_000);
};

const buildRunBucket = (input: { runId?: string | null; createdAtMs?: number | null }) => {
  const runId = normalizeText(input.runId);
  if (runId) return `run:${runId}`;
  const createdAtMs = Number(input.createdAtMs);
  if (Number.isFinite(createdAtMs) && createdAtMs > 0) {
    const bucket = Math.floor(createdAtMs / (5 * 60_000));
    return `bucket:${bucket}`;
  }
  return 'bucket:na';
};

export type SignalCanonicalIdV2Input = {
  symbol: any;
  timeframe: any;
  action: any;
  entryPrice: any;
  stopLoss: any;
  takeProfit: any;
  strategyMode?: any;
  agentKey?: any;
  runId?: string | null;
  createdAtMs?: number | null;
};

export const buildSignalCanonicalIdV2 = (input: SignalCanonicalIdV2Input): string => {
  const payload = [
    'sigv2',
    normalizeSymbol(input.symbol) || 'NA',
    normalizeTimeframe(input.timeframe) || 'na',
    normalizeAction(input.action),
    normalizePrice(input.entryPrice),
    normalizePrice(input.stopLoss),
    normalizePrice(input.takeProfit),
    normalizeMode(input.strategyMode),
    normalizeMode(input.agentKey),
    buildRunBucket(input)
  ].join('|');
  const hash = hashStringSampled(payload, 4096);
  return `sigv2_${hash}`;
};

export const buildSignalFingerprint = (input: Record<string, any>): string => {
  const payload = {
    signalCanonicalId: normalizeText(input.signalCanonicalId),
    signalIdentityVersion: normalizeText(input.signalIdentityVersion || 'v2'),
    legacySignalId: normalizeText(input.legacySignalId || input.id || ''),
    symbol: normalizeSymbol(input.symbol),
    timeframe: normalizeTimeframe(input.timeframe),
    action: normalizeAction(input.action),
    entryPrice: Number(input.entryPrice),
    stopLoss: Number(input.stopLoss),
    takeProfit: Number(input.takeProfit),
    probability: Number(input.probability),
    strategyMode: normalizeMode(input.strategyMode),
    reason: normalizeText(input.reason),
    status: normalizeText(input.status),
    outcome: normalizeText(input.outcome),
    createdAtMs: Number(input.createdAtMs),
    executedAtMs: Number(input.executedAtMs),
    resolvedAtMs: Number(input.resolvedAtMs),
    runId: normalizeText(input.runId),
    agentId: normalizeText(input.agentId),
    executionMode: normalizeText(input.executionMode),
    executionBroker: normalizeText(input.executionBroker),
    quantTelemetry: input.quantTelemetry ?? null
  };
  try {
    return JSON.stringify(payload);
  } catch {
    return normalizeText(input.signalCanonicalId || input.id || '');
  }
};

export const resolveSignalIdentityCandidates = (input: {
  signalCanonicalId?: any;
  signalId?: any;
  id?: any;
  legacySignalId?: any;
  caseId?: any;
}) => {
  const values = [
    normalizeText(input.signalCanonicalId),
    normalizeText(input.signalId),
    normalizeText(input.id),
    normalizeText(input.legacySignalId),
    normalizeText(input.caseId)
  ].filter(Boolean);
  return Array.from(new Set(values));
};

