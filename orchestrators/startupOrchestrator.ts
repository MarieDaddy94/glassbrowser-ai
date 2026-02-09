export const buildSystemInitializedMessage = (version: string | null | undefined) => {
  const raw = String(version || '').trim();
  const normalized = raw ? raw.replace(/^v/i, '') : 'dev';
  return `GlassBrowser AI v${normalized} Online`;
};
