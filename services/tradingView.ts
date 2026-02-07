const safeParseUrl = (value: string) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const isTradingViewHost = (hostname: string) => /(^|\.)tradingview\.com$/i.test(hostname);

const extractTradingViewParams = (u: URL) => {
  const symbol =
    u.searchParams.get('symbol') ||
    u.searchParams.get('symbol1') ||
    u.searchParams.get('ticker') ||
    '';
  const interval =
    u.searchParams.get('interval') ||
    u.searchParams.get('timeframe') ||
    u.searchParams.get('tf') ||
    '';

  return { symbol, interval };
};

export const formatTradingViewIntervalLabel = (interval: string) => {
  const raw = String(interval || '').trim();
  if (!raw) return '';

  // TradingView often uses numeric minutes in the URL (e.g. interval=15, interval=30, interval=240).
  if (/^\d+$/.test(raw)) {
    const minutes = Number(raw);
    if (!Number.isFinite(minutes) || minutes <= 0) return raw;
    if (minutes % 60 === 0) {
      const hours = minutes / 60;
      return hours === 1 ? '1h' : `${hours}h`;
    }
    return `${minutes}m`;
  }

  const match = raw.match(/^(\d+)\s*([a-zA-Z]+)$/);
  if (match) {
    const n = Number(match[1]);
    const unit = String(match[2] || '').trim().toLowerCase();
    if (!Number.isFinite(n) || n <= 0) return raw;
    if (unit === 'm' || unit === 'min' || unit === 'mins' || unit === 'minute' || unit === 'minutes') return `${n}m`;
    if (unit === 'h' || unit === 'hr' || unit === 'hrs' || unit === 'hour' || unit === 'hours') return `${n}h`;
    if (unit === 'd' || unit === 'day' || unit === 'days') return `${n}D`;
    if (unit === 'w' || unit === 'wk' || unit === 'wks' || unit === 'week' || unit === 'weeks') return `${n}W`;
    if (unit === 'mo' || unit === 'mon' || unit === 'month' || unit === 'months') return `${n}M`;
  }

  const up = raw.toUpperCase();
  if (up === 'D') return '1D';
  if (up === 'W') return '1W';
  if (up === 'M') return '1M';

  return raw;
};

export const getTradingViewParams = (url: string) => {
  const u = safeParseUrl(url);
  if (!u) return { symbol: '', interval: '' };
  if (!isTradingViewHost(u.hostname)) return { symbol: '', interval: '' };

  const { symbol, interval } = extractTradingViewParams(u);
  let decodedSymbol = symbol || '';
  if (decodedSymbol) {
    try {
      decodedSymbol = decodeURIComponent(decodedSymbol);
    } catch {
      // ignore decode errors
    }
  }

  return { symbol: decodedSymbol, interval: interval || '' };
};

export const isTradingViewUrl = (url: string) => {
  const u = safeParseUrl(url);
  return !!(u && isTradingViewHost(u.hostname));
};

export const getTradingViewLine = (url: string, title?: string) => {
  const u = safeParseUrl(url);
  if (!u) return '';
  if (!isTradingViewHost(u.hostname)) return '';

  const { symbol, interval } = extractTradingViewParams(u);

  const parts: string[] = [];
  if (symbol) parts.push(`symbol=${symbol}`);
  if (interval) parts.push(`interval=${interval}`);
  if (parts.length === 0 && title) parts.push(`title="${title}"`);
  return parts.length ? `TradingView: ${parts.join(', ')}` : 'TradingView';
};

export const getTradingViewContext = (url: string, title?: string) => {
  const u = safeParseUrl(url);
  if (!u) return '';
  if (!isTradingViewHost(u.hostname)) return '';

  const { symbol, interval } = extractTradingViewParams(u);

  const parts: string[] = [];
  if (symbol) parts.push(`symbol=${symbol}`);
  if (interval) parts.push(`interval=${interval}`);
  const details = parts.length > 0 ? parts.join(', ') : (title ? `title="${title}"` : '');
  return details ? `TRADINGVIEW CONTEXT: ${details}` : 'TRADINGVIEW CONTEXT: tradingview.com';
};
