export type MistakeTag = {
  id: string;
  label: string;
  group?: string;
  description?: string;
};

export const MISTAKE_TAXONOMY: MistakeTag[] = [
  { id: 'no_plan', label: 'No plan', group: 'process' },
  { id: 'invalid_setup', label: 'Invalid setup', group: 'process' },
  { id: 'late_entry', label: 'Late entry', group: 'execution' },
  { id: 'early_entry', label: 'Early entry', group: 'execution' },
  { id: 'chasing', label: 'Chased price / FOMO', group: 'execution' },
  { id: 'counter_trend', label: 'Counter trend', group: 'selection' },
  { id: 'news_risk', label: 'Traded into news', group: 'risk' },
  { id: 'session_mismatch', label: 'Bad session timing', group: 'selection' },
  { id: 'over_risk', label: 'Over risked size', group: 'risk' },
  { id: 'under_risk', label: 'Under sized / timid', group: 'risk' },
  { id: 'moved_stop', label: 'Moved stop', group: 'risk' },
  { id: 'no_stop', label: 'No stop', group: 'risk' },
  { id: 'exit_early', label: 'Exit too early', group: 'execution' },
  { id: 'exit_late', label: 'Exit too late', group: 'execution' },
  { id: 'overtrade', label: 'Overtrading', group: 'process' },
  { id: 'revenge', label: 'Revenge trade', group: 'process' },
  { id: 'spread', label: 'Bad spread / slippage', group: 'execution' }
];

const TAG_MAP = new Map(MISTAKE_TAXONOMY.map((tag) => [tag.id, tag]));
const LABEL_MAP = new Map(
  MISTAKE_TAXONOMY.map((tag) => [
    tag.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
    tag.id
  ])
);

export const formatMistakeTagsForPrompt = () =>
  MISTAKE_TAXONOMY.map((tag) => `${tag.id} (${tag.label})`).join(', ');

export const normalizeMistakeTags = (raw: any): string[] => {
  const tokens = Array.isArray(raw)
    ? raw
    : String(raw || '')
      .split(/[,;|\n]/g)
      .map((part) => part.trim());
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (!token) continue;
    const key = token.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!key) continue;
    let resolved = '';
    if (TAG_MAP.has(key)) resolved = key;
    else if (LABEL_MAP.has(key)) resolved = LABEL_MAP.get(key) as string;
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      deduped.push(resolved);
    }
  }
  return deduped;
};

