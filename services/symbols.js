const normalizeSymbolRaw = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  const afterColon = raw.includes(':') ? raw.split(':').pop() || raw : raw;
  return afterColon.replace(/\s+/g, '');
};

const stripSymbolSuffix = (value) => {
  if (!value) return '';
  return value.split('.')[0] || value;
};

export const normalizeSymbolKey = (value) => {
  const raw = normalizeSymbolRaw(value);
  if (!raw) return '';
  return stripSymbolSuffix(raw);
};

export const normalizeSymbolLoose = (value) => {
  const base = normalizeSymbolKey(value);
  if (!base) return '';
  return base.replace(/[^A-Z0-9]/g, '');
};

export const buildSymbolKeyVariants = (value) => {
  const raw = normalizeSymbolRaw(value);
  if (!raw) return [];
  const base = stripSymbolSuffix(raw);
  const cleanRaw = raw.replace(/[^A-Z0-9]/g, '');
  const cleanBase = base.replace(/[^A-Z0-9]/g, '');
  const variants = [raw, base, cleanRaw, cleanBase].filter(Boolean);
  return Array.from(new Set(variants));
};

export const normalizeTimeframeKey = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d+)\s*([a-zA-Z]+)$/);
  if (!match) return raw;
  const amount = match[1];
  const unit = match[2].toLowerCase();
  if (unit === 'h' || unit === 'd' || unit === 'w') return `${amount}${unit.toUpperCase()}`;
  if (unit === 'm') return `${amount}m`;
  return raw;
};

export const normalizeTimeframe = normalizeTimeframeKey;
