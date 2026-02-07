export const hashStringSampled = (value: string, maxSamples: number = 2048) => {
  const s = String(value || "");
  const len = s.length;
  if (!len) return "0";

  // FNV-1a-ish hash over a sampled subset of the string for speed.
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(len / Math.max(1, Math.floor(maxSamples))));

  for (let i = 0; i < len; i += step) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  hash ^= len;
  return (hash >>> 0).toString(16);
};

