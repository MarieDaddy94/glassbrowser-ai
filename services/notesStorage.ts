export type NoteTradeLink = {
  ledgerId: string;
  broker?: string;
  symbol?: string;
  action?: string;
  status?: string;
  positionStatus?: string;
  entryPrice?: number | null;
  closePrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  qty?: number | null;
  openedAtMs?: number | null;
  closedAtMs?: number | null;
  realizedPnl?: number | null;
  pnlEstimate?: number | null;
  updatedAtMs?: number | null;
};

export type NoteEntry = {
  id: string;
  templateId: string;
  title: string;
  fields: Record<string, string>;
  checklist: Record<string, boolean>;
  body: string;
  context?: {
    url?: string;
    title?: string;
    symbol?: string;
    timeframe?: string;
    capturedAtMs?: number;
    snapshot?: string;
  } | null;
  tradeLinks?: NoteTradeLink[];
  tags?: string[];
  createdAtMs: number;
  updatedAtMs: number;
};

const NOTES_STORAGE_KEY = 'glass_notes_v1';

const POST_TRADE_CHECKLIST = [
  'Plan followed',
  'Stop respected',
  'Size correct',
  'No revenge trade',
  'Exit per plan'
];

const initChecklist = () => {
  const out: Record<string, boolean> = {};
  for (const item of POST_TRADE_CHECKLIST) {
    out[item] = false;
  }
  return out;
};

export const appendNoteToStorage = (note: NoteEntry) => {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const nextNote = {
    ...note,
    updatedAtMs: note.updatedAtMs || now,
    createdAtMs: note.createdAtMs || now
  };
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    const idx = list.findIndex((entry: any) => entry && String(entry.id) === String(nextNote.id));
    if (idx >= 0) {
      list[idx] = { ...(list[idx] || {}), ...nextNote, updatedAtMs: nextNote.updatedAtMs };
    } else {
      list.unshift(nextNote);
    }
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore storage failures
  }
  try {
    window.dispatchEvent(new CustomEvent('glass_notes_append', { detail: nextNote }));
  } catch {
    // ignore dispatch failures
  }
};

export const buildPostTradeReviewNote = (payload: {
  ledgerId: string;
  symbol: string;
  action: string;
  entry?: string | null;
  stop?: string | null;
  takeProfit?: string | null;
  close?: string | null;
  pnl?: string | null;
  timeframe?: string | null;
  reviewText?: string | null;
  lesson?: string | null;
  tags?: string[];
  snapshotUrl?: string | null;
  chartUrl?: string | null;
  snapshotTitle?: string | null;
  snapshotTimeframe?: string | null;
  snapshotCapturedAtMs?: number | null;
  tradeLink?: NoteTradeLink | null;
}) => {
  const now = Date.now();
  const id = `note_review_${payload.ledgerId}`;
  const result = payload.pnl != null && payload.pnl !== ''
    ? Number(payload.pnl) > 0 ? 'Win' : Number(payload.pnl) < 0 ? 'Loss' : 'Breakeven'
    : '';
  const fields: Record<string, string> = {
    symbol: payload.symbol || '',
    timeframe: payload.timeframe || payload.snapshotTimeframe || '',
    direction: payload.action || '',
    entry: payload.entry || '',
    exit: payload.close || '',
    result,
    pnl: payload.pnl || '',
    r_multiple: '',
    worked: '',
    failed: '',
    lesson: payload.lesson || ''
  };

  const tags = ['post_trade', ...(payload.tags || [])].filter(Boolean);

  const note: NoteEntry = {
    id,
    templateId: 'post_trade',
    title: `${payload.symbol} ${payload.action} review`,
    fields,
    checklist: initChecklist(),
    body: payload.reviewText || '',
    context: {
      url: payload.chartUrl || undefined,
      title: payload.snapshotTitle || undefined,
      symbol: payload.symbol || undefined,
      timeframe: payload.snapshotTimeframe || payload.timeframe || undefined,
      capturedAtMs: payload.snapshotCapturedAtMs || undefined,
      snapshot: payload.snapshotUrl || undefined
    },
    tradeLinks: payload.tradeLink ? [payload.tradeLink] : [],
    tags,
    createdAtMs: now,
    updatedAtMs: now
  };

  return note;
};
