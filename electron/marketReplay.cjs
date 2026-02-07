function normalizeBar(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ts = Number(raw.ts ?? raw.time ?? raw.timestamp ?? raw.t);
  if (!Number.isFinite(ts)) return null;
  return {
    ts,
    open: Number(raw.open),
    high: Number(raw.high),
    low: Number(raw.low),
    close: Number(raw.close),
    volume: Number.isFinite(Number(raw.volume)) ? Number(raw.volume) : null
  };
}

function createMarketReplay(bars = [], opts = {}) {
  const list = Array.isArray(bars)
    ? bars.map(normalizeBar).filter(Boolean).sort((a, b) => a.ts - b.ts)
    : [];
  const total = list.length;
  let index = 0;
  const loop = opts.loop === true;

  const next = () => {
    if (total === 0) return { ok: false, done: true, bar: null, index, total };
    if (index >= total) {
      if (!loop) return { ok: false, done: true, bar: null, index, total };
      index = 0;
    }
    const bar = list[index];
    index += 1;
    return { ok: true, done: false, bar, index, total };
  };

  const peek = () => {
    if (total === 0) return null;
    if (index >= total) return loop ? list[0] : null;
    return list[index];
  };

  const reset = () => {
    index = 0;
  };

  const getState = () => ({ index, total, loop });

  return { next, peek, reset, getState };
}

module.exports = {
  createMarketReplay
};
