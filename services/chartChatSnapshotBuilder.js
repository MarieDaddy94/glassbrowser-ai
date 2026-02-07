import { normalizeSymbolKey, normalizeTimeframeKey } from './symbols.js';

const DEFAULT_CHART_CHAT_TIMEFRAMES = ['5m', '15m', '30m', '1h', '4h', '1d'];
const DEFAULT_MAX_CANDLES = 240;
const DEFAULT_MAX_PAYLOAD_CHARS = 32000;
const MIN_CANDLES_ON_TRUNCATION = 60;

const normalizeTimeframeLabel = (value) => {
  const normalized = normalizeTimeframeKey(value);
  if (!normalized) return '';
  return normalized;
};

const coerceTimeframes = (input) => {
  if (Array.isArray(input) && input.length > 0) {
    return input
      .map((entry) => normalizeTimeframeKey(entry))
      .filter(Boolean);
  }
  return [...DEFAULT_CHART_CHAT_TIMEFRAMES];
};

const coerceCandles = (bars, maxCandles) => {
  const list = Array.isArray(bars) ? bars : [];
  if (list.length === 0) return [];
  const trimmed = Number.isFinite(Number(maxCandles)) && Number(maxCandles) > 0
    ? list.slice(-Math.floor(Number(maxCandles)))
    : list.slice();
  return trimmed.map((bar) => ({
    t: Number(bar?.t ?? bar?.time ?? bar?.timestamp ?? 0) || 0,
    o: Number(bar?.o ?? bar?.open ?? 0) || 0,
    h: Number(bar?.h ?? bar?.high ?? 0) || 0,
    l: Number(bar?.l ?? bar?.low ?? 0) || 0,
    c: Number(bar?.c ?? bar?.close ?? 0) || 0,
    v: bar?.v != null || bar?.volume != null ? Number(bar?.v ?? bar?.volume ?? 0) || 0 : null
  }));
};

const estimateChars = (value) => {
  if (value == null) return 0;
  return String(value).length;
};

const resolveModelType = (attachments) => {
  if (!attachments) return 'text';
  if (typeof attachments === 'string') {
    return attachments.trim() ? 'vision' : 'text';
  }
  if (Array.isArray(attachments)) {
    return attachments.some((item) => {
      if (!item) return false;
      if (typeof item === 'string') return !!item.trim();
      if (typeof item === 'object') {
        const raw = item.dataUrl ?? item.image ?? item.image_url ?? '';
        return !!String(raw || '').trim();
      }
      return false;
    }) ? 'vision' : 'text';
  }
  return 'text';
};

const buildChartFrames = ({
  snapshots,
  symbol,
  timeframes,
  maxCandles = DEFAULT_MAX_CANDLES
}) => {
  const requestedTimeframes = coerceTimeframes(timeframes);
  const normalizedSymbol = normalizeSymbolKey(symbol);
  const list = Array.isArray(snapshots) ? snapshots : [];

  const availableSymbols = Array.from(
    new Set(list.map((snap) => normalizeSymbolKey(snap?.symbol)).filter(Boolean))
  );
  const availableTimeframes = Array.from(
    new Set(list.map((snap) => normalizeTimeframeKey(snap?.timeframe)).filter(Boolean))
  );

  const frames = [];
  const missingFrames = [];

  for (const tf of requestedTimeframes) {
    const candidates = list.filter((snap) => {
      if (!snap) return false;
      if (normalizedSymbol && normalizeSymbolKey(snap.symbol) !== normalizedSymbol) return false;
      return normalizeTimeframeKey(snap.timeframe) === normalizeTimeframeKey(tf);
    });

    if (candidates.length === 0) {
      missingFrames.push(tf);
      continue;
    }

    const best = candidates.reduce((acc, next) => {
      const accTs = Number(acc?.updatedAtMs || 0);
      const nextTs = Number(next?.updatedAtMs || 0);
      return nextTs > accTs ? next : acc;
    }, candidates[0]);

    const barsTail = coerceCandles(best?.barsTail, maxCandles);
    frames.push({
      tf: normalizeTimeframeLabel(best?.timeframe || tf),
      barsCount: Number(best?.barCount ?? barsTail.length ?? 0) || 0,
      lastUpdatedAtMs: Number.isFinite(Number(best?.updatedAtMs)) ? Number(best.updatedAtMs) : null,
      candles: barsTail
    });
  }

  return {
    frames,
    requestedTimeframes,
    missingFrames,
    availableSymbols,
    availableTimeframes
  };
};

const buildChartSnapshotPayload = ({
  msgId,
  symbol,
  timeframes,
  snapshots,
  maxCandles = DEFAULT_MAX_CANDLES,
  maxPayloadChars = DEFAULT_MAX_PAYLOAD_CHARS,
  capturedAtMs,
  imageIncluded = false,
  reasonCode
}) => {
  const frameResult = buildChartFrames({ snapshots, symbol, timeframes, maxCandles });
  const trimmedSymbol = String(symbol || '').trim();

  let derivedReason = reasonCode || null;
  if (!derivedReason) {
    if (!trimmedSymbol) derivedReason = 'NO_SYMBOL_SELECTED';
    else if (frameResult.requestedTimeframes.length === 0) derivedReason = 'NO_TIMEFRAMES_SUBSCRIBED';
    else if (frameResult.frames.length === 0) derivedReason = 'STORE_EMPTY';
  }

  const diagnostics = {};
  if (derivedReason) diagnostics.reasonCode = derivedReason;

  const payload = {
    msgId: msgId || null,
    symbol: trimmedSymbol || null,
    capturedAt: Number.isFinite(Number(capturedAtMs)) ? Number(capturedAtMs) : null,
    image: imageIncluded ? { attached: true } : null,
    frames: frameResult.frames,
    diagnostics
  };

  let serialized = JSON.stringify(payload);
  let truncated = false;
  if (maxPayloadChars && estimateChars(serialized) > maxPayloadChars && payload.frames.length > 0) {
    const reduceTo = Math.max(MIN_CANDLES_ON_TRUNCATION, Math.floor(maxCandles / 3));
    payload.frames = payload.frames.map((frame) => ({
      ...frame,
      candles: Array.isArray(frame.candles) ? frame.candles.slice(-reduceTo) : []
    }));
    payload.diagnostics = {
      ...payload.diagnostics,
      warnings: ['PAYLOAD_STRIPPED']
    };
    truncated = true;
    serialized = JSON.stringify(payload);
  }

  return {
    payload,
    serialized,
    truncated,
    reasonCode: payload.diagnostics?.reasonCode || null,
    requestedTimeframes: frameResult.requestedTimeframes,
    missingFrames: frameResult.missingFrames,
    availableSymbols: frameResult.availableSymbols,
    availableTimeframes: frameResult.availableTimeframes
  };
};

const buildChartSnapshotContext = (payload) => {
  if (!payload) return '';
  return `CHART_SNAPSHOT_JSON:\n${JSON.stringify(payload)}`;
};

export {
  DEFAULT_CHART_CHAT_TIMEFRAMES,
  DEFAULT_MAX_CANDLES,
  DEFAULT_MAX_PAYLOAD_CHARS,
  normalizeSymbolKey,
  normalizeTimeframeKey,
  normalizeTimeframeLabel,
  resolveModelType,
  buildChartFrames,
  buildChartSnapshotPayload,
  buildChartSnapshotContext
};
