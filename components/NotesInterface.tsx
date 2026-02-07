import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Save, Plus, Trash2, ClipboardCheck, FileText, Search, Link2, Camera, Download } from 'lucide-react';
import { formatTradingViewIntervalLabel, getTradingViewParams, isTradingViewUrl } from '../services/tradingView';
import { MISTAKE_TAXONOMY } from '../services/reviewTaxonomy';
import type { CrossPanelContext } from '../types';

interface NotesInterfaceProps {
  autoAppend?: string | null;
  onClearAppend?: () => void;
  currentTab?: { url: string; title?: string };
  sessionBias?: string;
  captureActiveTabScreenshot?: () => Promise<string | null>;
  activeAccount?: {
    env?: 'demo' | 'live' | null;
    server?: string | null;
    accountId?: number | null;
    accNum?: number | null;
  };
  onReplayTrade?: (payload: {
    symbol: string;
    timeframe?: string | null;
    entryPrice?: number | null;
    stopLoss?: number | null;
    takeProfit?: number | null;
    closePrice?: number | null;
    action?: string | null;
    ledgerId?: string | null;
    noteId?: string | null;
  }) => void;
  onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
  crossPanelContext?: CrossPanelContext | null;
}

type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'date';
type TemplateId = 'trade_plan' | 'post_trade' | 'daily_prep' | 'weekly_recap' | 'blank';

interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  rows?: number;
  defaultValue?: string;
}

interface TemplateDef {
  id: TemplateId;
  label: string;
  description: string;
  fields: FieldDef[];
  checklist: string[];
  defaultTitle?: string;
}

interface NoteContext {
  url?: string;
  title?: string;
  symbol?: string;
  timeframe?: string;
  sessionBias?: string;
  capturedAtMs?: number;
  snapshot?: string;
}

interface NoteTradeLink {
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
}

interface NoteEntry {
  id: string;
  templateId: TemplateId;
  title: string;
  fields: Record<string, string>;
  checklist: Record<string, boolean>;
  body: string;
  context?: NoteContext | null;
  tradeLinks?: NoteTradeLink[];
  tags?: string[];
  createdAtMs: number;
  updatedAtMs: number;
}

const STORAGE_KEY = 'glass_notes_v1';

const TEMPLATES: TemplateDef[] = [
  {
    id: 'trade_plan',
    label: 'Trade Plan',
    description: 'Define setup, risk, and execution plan.',
    fields: [
      { id: 'symbol', label: 'Symbol', type: 'text', required: true, placeholder: 'XAUUSD' },
      { id: 'timeframe', label: 'Timeframe', type: 'select', required: true, options: ['1m', '5m', '15m', '30m', '1h', '4h', '1D'] },
      { id: 'bias', label: 'Bias', type: 'select', required: true, options: ['Bullish', 'Bearish', 'Neutral'] },
      { id: 'setup', label: 'Setup / Pattern', type: 'textarea', required: true, rows: 3, placeholder: 'e.g., BOS + FVG retest' },
      { id: 'entry', label: 'Entry Plan', type: 'textarea', required: true, rows: 2 },
      { id: 'stop', label: 'Stop Loss', type: 'text', required: true, placeholder: 'Price or level' },
      { id: 'target', label: 'Take Profit', type: 'text', required: true, placeholder: 'Price or level' },
      { id: 'risk', label: 'Risk %', type: 'number', required: true, placeholder: '1' },
      { id: 'rr', label: 'R:R Target', type: 'text', placeholder: '1:2' }
    ],
    checklist: [
      'HTF bias aligned',
      'Liquidity sweep identified',
      'Entry trigger confirmed',
      'News checked',
      'Session timing ok',
      'Risk defined'
    ]
  },
  {
    id: 'post_trade',
    label: 'Post-Trade Review',
    description: 'Review execution quality and lessons.',
    fields: [
      { id: 'symbol', label: 'Symbol', type: 'text', required: true },
      { id: 'timeframe', label: 'Timeframe', type: 'select', required: true, options: ['1m', '5m', '15m', '30m', '1h', '4h', '1D'] },
      { id: 'direction', label: 'Direction', type: 'select', required: true, options: ['BUY', 'SELL'] },
      { id: 'entry', label: 'Entry', type: 'text', required: true },
      { id: 'exit', label: 'Exit', type: 'text', required: true },
      { id: 'result', label: 'Result', type: 'select', required: true, options: ['Win', 'Loss', 'Breakeven'] },
      { id: 'pnl', label: 'P&L', type: 'text', placeholder: '$ or %' },
      { id: 'r_multiple', label: 'R Multiple', type: 'text', placeholder: 'e.g., +1.5R' },
      { id: 'worked', label: 'What worked', type: 'textarea', required: true, rows: 2 },
      { id: 'failed', label: 'What didn’t', type: 'textarea', required: true, rows: 2 },
      { id: 'lesson', label: 'Lesson / Rule', type: 'textarea', required: true, rows: 2 }
    ],
    checklist: [
      'Plan followed',
      'Stop respected',
      'Size correct',
      'No revenge trade',
      'Exit per plan'
    ]
  },
  {
    id: 'daily_prep',
    label: 'Daily Prep',
    description: 'Start the session with a focused plan.',
    fields: [
      { id: 'date', label: 'Date', type: 'date', required: true },
      { id: 'session', label: 'Session', type: 'select', required: true, options: ['Asia', 'London', 'New York'] },
      { id: 'bias', label: 'Session Bias', type: 'text', required: true },
      { id: 'watchlist', label: 'Watchlist', type: 'textarea', required: true, rows: 2 },
      { id: 'levels', label: 'Key Levels', type: 'textarea', required: true, rows: 2 },
      { id: 'news', label: 'News / Events', type: 'textarea', rows: 2 },
      { id: 'focus', label: 'Focus / Execution Rules', type: 'textarea', required: true, rows: 2 }
    ],
    checklist: [
      'Review HTF bias',
      'Mark key levels',
      'Check news',
      'Set risk limits',
      'Define session objective'
    ]
  },
  {
    id: 'weekly_recap',
    label: 'Weekly Recap',
    description: 'Summarize performance and improvements.',
    fields: [
      { id: 'week_of', label: 'Week of', type: 'date', required: true },
      { id: 'wins', label: 'Wins', type: 'number', required: true },
      { id: 'losses', label: 'Losses', type: 'number', required: true },
      { id: 'best_setup', label: 'Best Setup', type: 'textarea', required: true, rows: 2 },
      { id: 'biggest_mistake', label: 'Biggest Mistake', type: 'textarea', required: true, rows: 2 },
      { id: 'improvement', label: 'Improvement Focus', type: 'textarea', required: true, rows: 2 }
    ],
    checklist: [
      'Reviewed every trade',
      'Updated playbook',
      'Adjusted risk/size',
      'Set goals for next week'
    ]
  },
  {
    id: 'blank',
    label: 'Blank Note',
    description: 'Freeform note with no required fields.',
    fields: [],
    checklist: []
  }
];

const TEMPLATE_BY_ID = new Map<TemplateId, TemplateDef>(TEMPLATES.map((t) => [t.id, t]));

const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const NOTES_AUTO_LINK_KEY = 'glass_notes_auto_link';
const NOTES_AUTO_RECAP_KEY = 'glass_notes_auto_weekly_recap';

const filePathToFileUrl = (filePath: string) => {
  const raw = String(filePath || '').trim();
  if (!raw) return '';

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return raw;

  if (/^\\\\/.test(raw)) {
    const unc = raw.replace(/^\\\\/, '').replace(/\\/g, '/');
    return `file:////${encodeURI(unc)}`;
  }

  const normalized = raw.replace(/\\/g, '/');
  if (/^[a-zA-Z]:\//.test(normalized)) return `file:///${encodeURI(normalized)}`;
  if (normalized.startsWith('/')) return `file://${encodeURI(normalized)}`;
  return `file:///${encodeURI(normalized)}`;
};

const persistSnapshot = async (dataUrl: string) => {
  const raw = String(dataUrl || '').trim();
  if (!raw) return '';
  if (!raw.startsWith('data:')) return raw;

  try {
    const saver = (window as any)?.glass?.saveUserFile;
    if (typeof saver !== 'function') return raw;
    const res = await saver({ dataUrl: raw, subdir: 'note-snapshots', prefix: 'note_snapshot' });
    if (res?.ok && res.path) return filePathToFileUrl(String(res.path));
  } catch {
    // ignore
  }

  return raw;
};

const getDefaultValue = (field: FieldDef) => {
  if (field.defaultValue != null) return field.defaultValue;
  if (field.type === 'date') {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
};

const createNoteFromTemplate = (template: TemplateDef): NoteEntry => {
  const now = Date.now();
  const fields: Record<string, string> = {};
  template.fields.forEach((field) => {
    fields[field.id] = getDefaultValue(field);
  });
  const checklist: Record<string, boolean> = {};
  template.checklist.forEach((item) => {
    checklist[item] = false;
  });

  const defaultTitle = template.defaultTitle
    ? template.defaultTitle
    : `${template.label} - ${new Date().toLocaleDateString()}`;

  return {
    id: makeId(),
    templateId: template.id,
    title: defaultTitle,
    fields,
    checklist,
    body: '',
    context: null,
    tradeLinks: [],
    tags: [],
    createdAtMs: now,
    updatedAtMs: now
  };
};

  const normalizeNote = (raw: any): NoteEntry | null => {
    if (!raw || typeof raw !== 'object') return null;
    const templateId = (raw.templateId as TemplateId) || 'blank';
    const template = TEMPLATE_BY_ID.get(templateId) || TEMPLATE_BY_ID.get('blank')!;
    const fields: Record<string, string> = {};
  template.fields.forEach((field) => {
    const v = raw.fields && raw.fields[field.id] != null ? String(raw.fields[field.id]) : getDefaultValue(field);
    fields[field.id] = v;
  });
  const checklist: Record<string, boolean> = {};
  template.checklist.forEach((item) => {
    checklist[item] = raw.checklist && typeof raw.checklist[item] === 'boolean' ? raw.checklist[item] : false;
  });

  let context: NoteContext | null = null;
  if (raw.context && typeof raw.context === 'object') {
    const ctxRaw = raw.context as Record<string, any>;
    context = {
      url: ctxRaw.url != null ? String(ctxRaw.url) : undefined,
      title: ctxRaw.title != null ? String(ctxRaw.title) : undefined,
      symbol: ctxRaw.symbol != null ? String(ctxRaw.symbol) : undefined,
      timeframe: ctxRaw.timeframe != null ? String(ctxRaw.timeframe) : undefined,
      sessionBias: ctxRaw.sessionBias != null ? String(ctxRaw.sessionBias) : undefined,
      capturedAtMs: Number.isFinite(Number(ctxRaw.capturedAtMs)) ? Number(ctxRaw.capturedAtMs) : undefined,
      snapshot: ctxRaw.snapshot != null ? String(ctxRaw.snapshot) : undefined
    };
  }

  const rawLinks = Array.isArray(raw.tradeLinks) ? raw.tradeLinks : [];
  const tradeLinks: NoteTradeLink[] = rawLinks
    .map((link: any) => {
      if (!link || typeof link !== 'object') return null;
      const ledgerId = String(link.ledgerId || '').trim();
      if (!ledgerId) return null;
      const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : null);
      return {
        ledgerId,
        broker: link.broker != null ? String(link.broker) : undefined,
        symbol: link.symbol != null ? String(link.symbol) : undefined,
        action: link.action != null ? String(link.action) : undefined,
        status: link.status != null ? String(link.status) : undefined,
        positionStatus: link.positionStatus != null ? String(link.positionStatus) : undefined,
        entryPrice: toNum(link.entryPrice),
        closePrice: toNum(link.closePrice),
        stopLoss: toNum(link.stopLoss),
        takeProfit: toNum(link.takeProfit),
        qty: toNum(link.qty),
        openedAtMs: toNum(link.openedAtMs),
        closedAtMs: toNum(link.closedAtMs),
        realizedPnl: toNum(link.realizedPnl),
        pnlEstimate: toNum(link.pnlEstimate),
        updatedAtMs: toNum(link.updatedAtMs)
      } as NoteTradeLink;
    })
    .filter(Boolean) as NoteTradeLink[];

  const rawTags = Array.isArray(raw.tags) ? raw.tags : [];
  const tags = rawTags
    .map((tag: any) => String(tag || '').trim())
    .filter(Boolean);

  return {
    id: String(raw.id || makeId()),
    templateId: template.id,
    title: String(raw.title || template.label),
    fields,
    checklist,
    body: raw.body != null ? String(raw.body) : '',
    context,
    tradeLinks,
    tags,
    createdAtMs: Number(raw.createdAtMs || Date.now()),
    updatedAtMs: Number(raw.updatedAtMs || Date.now())
  };
};

const isFieldFilled = (value: string) => {
  return String(value || '').trim().length > 0;
};

const NotesInterface: React.FC<NotesInterfaceProps> = ({
  autoAppend,
  onClearAppend,
  currentTab,
  sessionBias,
  captureActiveTabScreenshot,
  activeAccount,
  onReplayTrade,
  onRunActionCatalog,
  crossPanelContext
}) => {
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [lastSavedAtMs, setLastSavedAtMs] = useState<number>(0);
  const [tagInput, setTagInput] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId | 'all'>('all');
  const [selectedDateKey, setSelectedDateKey] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [showSummary, setShowSummary] = useState(false);
  const [exportStatus, setExportStatus] = useState<string>('');
  const [exportAll, setExportAll] = useState<boolean>(false);
  const [autoGenerateRecap, setAutoGenerateRecap] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(NOTES_AUTO_RECAP_KEY);
      if (raw == null) return true;
      if (raw === '1' || raw === 'true') return true;
      if (raw === '0' || raw === 'false') return false;
    } catch {
      // ignore
    }
    return true;
  });
  const [autoLinkNewNotes, setAutoLinkNewNotes] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(NOTES_AUTO_LINK_KEY);
      if (raw == null) return true;
      if (raw === '1' || raw === 'true') return true;
      if (raw === '0' || raw === 'false') return false;
    } catch {
      // ignore
    }
    return true;
  });
  const [isAttaching, setIsAttaching] = useState(false);
  const [ledgerTrades, setLedgerTrades] = useState<any[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [selectedLedgerId, setSelectedLedgerId] = useState<string>('');

  const runActionOr = useCallback(
    (actionId: string, payload: Record<string, any>, fallback?: () => void) => {
      if (onRunActionCatalog) {
        void onRunActionCatalog({ actionId, payload });
        return;
      }
      fallback?.();
    },
    [onRunActionCatalog]
  );

  const activeNote = notes.find((n) => n.id === activeId) || notes[0] || null;
  const activeTemplate = activeNote ? TEMPLATE_BY_ID.get(activeNote.templateId) || TEMPLATE_BY_ID.get('blank')! : null;

  useEffect(() => {
    let loaded = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const hydrated = parsed.map(normalizeNote).filter(Boolean) as NoteEntry[];
          if (hydrated.length > 0) {
            setNotes(hydrated);
            setActiveId(hydrated[0].id);
            loaded = true;
          }
        }
      }
    } catch {
      // ignore
    }

    if (!loaded) {
      const seed = createNoteFromTemplate(TEMPLATE_BY_ID.get('trade_plan')!);
      setNotes([seed]);
      setActiveId(seed.id);
    }
    setNotesLoaded(true);
  }, []);

  useEffect(() => {
    const handler = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const note = normalizeNote(detail);
      if (!note) return;
      setNotes((prev) => {
        const idx = prev.findIndex((n) => n.id === note.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...note, updatedAtMs: note.updatedAtMs };
          return next;
        }
        return [note, ...prev];
      });
      if (!activeId) {
        setActiveId(note.id);
      }
    };
    window.addEventListener('glass_notes_append', handler as any);
    return () => window.removeEventListener('glass_notes_append', handler as any);
  }, [activeId]);

  useEffect(() => {
    const handler = (event: any) => {
      const id = String(event?.detail?.id || '').trim();
      if (!id) return;
      setNotes((prev) => {
        const next = prev.filter((note) => note.id !== id);
        if (next.length === prev.length) return prev;
        if (activeId === id) {
          const nextActive = next[0]?.id || '';
          setActiveId(nextActive || '');
        }
        return next;
      });
    };
    window.addEventListener('glass_notes_delete', handler as any);
    return () => window.removeEventListener('glass_notes_delete', handler as any);
  }, [activeId]);

  useEffect(() => {
    const handler = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.clear) {
        setSearch('');
        setSelectedTags([]);
        setSelectedTemplate('all');
        setSelectedDateKey('');
        return;
      }
      if (detail.search != null) setSearch(String(detail.search));
      const rawTags = Array.isArray(detail.tags)
        ? detail.tags.map((tag: any) => String(tag || '').trim()).filter(Boolean)
        : [];
      const singleTag = String(detail.tag || '').trim();
      if (rawTags.length > 0) setSelectedTags(rawTags);
      else if (singleTag) setSelectedTags([singleTag]);
      if (detail.templateId != null || detail.template != null) {
        const templateId = String(detail.templateId || detail.template || '').trim();
        setSelectedTemplate((templateId as TemplateId) || 'all');
      }
      if (detail.dateKey != null || detail.date != null) {
        setSelectedDateKey(String(detail.dateKey || detail.date || '').trim());
      }
    };
    window.addEventListener('glass_notes_filters', handler as any);
    return () => window.removeEventListener('glass_notes_filters', handler as any);
  }, []);

  useEffect(() => {
    const handler = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.autoLink != null) setAutoLinkNewNotes(!!detail.autoLink);
      if (detail.autoRecap != null) setAutoGenerateRecap(!!detail.autoRecap);
    };
    window.addEventListener('glass_notes_preferences', handler as any);
    return () => window.removeEventListener('glass_notes_preferences', handler as any);
  }, []);

  useEffect(() => {
    const handler = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      let nextDate: Date | null = null;
      if (detail.date) {
        const parsed = new Date(detail.date);
        if (!Number.isNaN(parsed.getTime())) nextDate = parsed;
      }
      if (!nextDate) {
        const monthRaw = Number(detail.month ?? detail.monthIndex);
        const yearRaw = Number(detail.year);
        const hasMonth = Number.isFinite(monthRaw);
        const hasYear = Number.isFinite(yearRaw);
        if (hasMonth || hasYear) {
          const now = new Date();
          const monthIndex =
            hasMonth
              ? monthRaw >= 1 && monthRaw <= 12
                ? monthRaw - 1
                : monthRaw >= 0 && monthRaw <= 11
                  ? monthRaw
                  : now.getMonth()
              : now.getMonth();
          const year = hasYear ? yearRaw : now.getFullYear();
          nextDate = new Date(year, monthIndex, 1);
        }
      }
      if (nextDate) setCalendarMonth(nextDate);
      if (detail.show === false) setShowCalendar(false);
      else if (detail.show === true) setShowCalendar(true);
    };
    window.addEventListener('glass_notes_calendar', handler as any);
    return () => window.removeEventListener('glass_notes_calendar', handler as any);
  }, []);

  useEffect(() => {
    const handler = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.toggle) {
        setShowSummary((prev) => !prev);
        return;
      }
      if (detail.show != null) setShowSummary(!!detail.show);
    };
    window.addEventListener('glass_notes_summary', handler as any);
    return () => window.removeEventListener('glass_notes_summary', handler as any);
  }, []);

  useEffect(() => {
    if (notes.length === 0) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
      setLastSavedAtMs(Date.now());
    } catch {
      // ignore
    }
  }, [notes]);

  useEffect(() => {
    try {
      localStorage.setItem(NOTES_AUTO_LINK_KEY, autoLinkNewNotes ? '1' : '0');
    } catch {
      // ignore
    }
  }, [autoLinkNewNotes]);

  useEffect(() => {
    try {
      localStorage.setItem(NOTES_AUTO_RECAP_KEY, autoGenerateRecap ? '1' : '0');
    } catch {
      // ignore
    }
  }, [autoGenerateRecap]);

  useEffect(() => {
    if (!exportStatus) return;
    const timer = window.setTimeout(() => setExportStatus(''), 4000);
    return () => window.clearTimeout(timer);
  }, [exportStatus]);

  useEffect(() => {
    if (!autoAppend) return;
    let nextActiveId = activeId;
    const stamp = new Date().toLocaleTimeString();
    setNotes((prev) => {
      const next = [...prev];
      const idx = next.findIndex((n) => n.id === activeId);
      if (idx === -1) {
        const fresh = createNoteFromTemplate(TEMPLATE_BY_ID.get('post_trade')!);
        fresh.body = `${fresh.body}\n\n[${stamp}] ${autoAppend}`.trim();
        nextActiveId = fresh.id;
        return [fresh, ...next];
      }
      const note = next[idx];
      const body = `${note.body}\n\n[${stamp}] ${autoAppend}`.trim();
      next[idx] = { ...note, body, updatedAtMs: Date.now() };
      return next;
    });
    if (nextActiveId !== activeId) setActiveId(nextActiveId);
    onClearAppend?.();
  }, [autoAppend, activeId, onClearAppend]);

  const applyContextToFields = useCallback((fields: Record<string, string>, ctx: NoteContext) => {
    const next = { ...fields };
    if ('symbol' in next && ctx.symbol && !isFieldFilled(next.symbol)) next.symbol = ctx.symbol;
    if ('timeframe' in next && ctx.timeframe && !isFieldFilled(next.timeframe)) next.timeframe = ctx.timeframe;
    if ('bias' in next && ctx.sessionBias && !isFieldFilled(next.bias)) next.bias = ctx.sessionBias;
    return next;
  }, []);

  const normalizeTag = (raw: string) => String(raw || '').trim().replace(/\s+/g, '-');
  const tagKey = (raw: string) => String(raw || '').trim().toLowerCase();

  const buildContextFromCurrent = useCallback(async (withSnapshot: boolean): Promise<NoteContext | null> => {
    const url = currentTab?.url ? String(currentTab.url).trim() : '';
    if (!url) return null;
    const title = currentTab?.title ? String(currentTab.title) : undefined;

    let symbol = '';
    let timeframe = '';
    if (isTradingViewUrl(url)) {
      const params = getTradingViewParams(url);
      symbol = params.symbol || '';
      timeframe = params.interval ? formatTradingViewIntervalLabel(params.interval) : '';
    }

    let snapshot: string | undefined = undefined;
    if (withSnapshot && typeof captureActiveTabScreenshot === 'function') {
      const raw = await captureActiveTabScreenshot();
      if (raw) snapshot = await persistSnapshot(raw);
    }

    return {
      url,
      title,
      symbol: symbol || undefined,
      timeframe: timeframe || undefined,
      sessionBias: sessionBias ? String(sessionBias).trim() : undefined,
      capturedAtMs: Date.now(),
      snapshot
    };
  }, [captureActiveTabScreenshot, currentTab, sessionBias]);

  const createNote = useCallback((templateId: TemplateId) => {
    const template = TEMPLATE_BY_ID.get(templateId) || TEMPLATE_BY_ID.get('blank')!;
    const note = createNoteFromTemplate(template);
    if (autoLinkNewNotes) {
      const ctx = currentTab?.url ? {
        url: String(currentTab.url),
        title: currentTab?.title ? String(currentTab.title) : undefined,
        ...(isTradingViewUrl(String(currentTab.url)) ? (() => {
          const params = getTradingViewParams(String(currentTab.url));
          return {
            symbol: params.symbol || undefined,
            timeframe: params.interval ? formatTradingViewIntervalLabel(params.interval) : undefined
          };
        })() : {}),
        sessionBias: sessionBias ? String(sessionBias).trim() : undefined,
        capturedAtMs: Date.now()
      } as NoteContext : null;
      if (ctx) {
        note.context = ctx;
        note.fields = applyContextToFields(note.fields, ctx);
      }
    }
    setNotes((prev) => [note, ...prev]);
    setActiveId(note.id);
  }, [applyContextToFields, autoLinkNewNotes, currentTab, sessionBias]);

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      if (activeId === id) {
        const fallback = next[0];
        setActiveId(fallback ? fallback.id : '');
      }
      return next;
    });
  }, [activeId]);

  const updateNote = useCallback((id: string, patch: Partial<NoteEntry>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAtMs: Date.now() } : n)));
  }, []);

  const updateField = useCallback((fieldId: string, value: string) => {
    if (!activeNote) return;
    updateNote(activeNote.id, {
      fields: { ...activeNote.fields, [fieldId]: value }
    });
  }, [activeNote, updateNote]);

  const toggleChecklist = useCallback((item: string) => {
    if (!activeNote) return;
    updateNote(activeNote.id, {
      checklist: { ...activeNote.checklist, [item]: !activeNote.checklist[item] }
    });
  }, [activeNote, updateNote]);

  const addTag = useCallback((rawTag: string) => {
    if (!activeNote) return;
    const nextTag = normalizeTag(rawTag);
    if (!nextTag) return;
    const existing = Array.isArray(activeNote.tags) ? activeNote.tags : [];
    if (existing.some((t) => tagKey(t) === tagKey(nextTag))) return;
    updateNote(activeNote.id, { tags: [...existing, nextTag] });
  }, [activeNote, updateNote]);

  const removeTag = useCallback((rawTag: string) => {
    if (!activeNote) return;
    const existing = Array.isArray(activeNote.tags) ? activeNote.tags : [];
    const next = existing.filter((t) => tagKey(t) !== tagKey(rawTag));
    updateNote(activeNote.id, { tags: next });
  }, [activeNote, updateNote]);

  const toggleMistakeTag = useCallback((tagId: string) => {
    if (!activeNote) return;
    const existing = Array.isArray(activeNote.tags) ? activeNote.tags : [];
    const isActive = existing.some((t) => tagKey(t) === tagKey(tagId));
    if (isActive) {
      updateNote(activeNote.id, { tags: existing.filter((t) => tagKey(t) !== tagKey(tagId)) });
    } else {
      updateNote(activeNote.id, { tags: [...existing, tagId] });
    }
  }, [activeNote, updateNote]);

  const handleTagKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' ) {
      event.preventDefault();
      const next = normalizeTag(tagInput);
      if (next) addTag(next);
      setTagInput('');
    }
  }, [addTag, normalizeTag, tagInput]);

  const toggleTagFilter = useCallback((tag: string) => {
    const key = tagKey(tag);
    setSelectedTags((prev) => {
      if (prev.some((t) => tagKey(t) === key)) {
        return prev.filter((t) => tagKey(t) !== key);
      }
      return [...prev, tag];
    });
  }, []);

  const clearFilters = useCallback(() => {
    setSearch('');
    setSelectedTags([]);
    setSelectedTemplate('all');
    setSelectedDateKey('');
  }, []);

  const parseNumberFromText = (value: string) => {
    const raw = String(value || '');
    const match = raw.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const n = Number(match[0]);
    return Number.isFinite(n) ? n : null;
  };

  const attachContext = useCallback(async (withSnapshot: boolean) => {
    if (!activeNote) return;
    if (isAttaching) return;
    setIsAttaching(true);
    try {
      const ctx = await buildContextFromCurrent(withSnapshot);
      if (!ctx) return;
      if (!withSnapshot && activeNote.context?.snapshot) {
        ctx.snapshot = activeNote.context.snapshot;
      }
      const nextFields = applyContextToFields(activeNote.fields, ctx);
      updateNote(activeNote.id, { context: ctx, fields: nextFields });
    } finally {
      setIsAttaching(false);
    }
  }, [activeNote, applyContextToFields, buildContextFromCurrent, isAttaching, updateNote]);

  const clearContext = useCallback(() => {
    if (!activeNote) return;
    updateNote(activeNote.id, { context: null });
  }, [activeNote, updateNote]);

  const toNumber = (value: any) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const isClosedEntry = (entry: any) => {
    const status = String(entry?.status || '').toUpperCase();
    const posStatus = String(entry?.positionStatus || '').toUpperCase();
    const closedAt = Number(entry?.positionClosedAtMs || 0);
    return status === 'CLOSED' || posStatus === 'CLOSED' || closedAt > 0;
  };

  const mapLedgerEntry = (entry: any): NoteTradeLink | null => {
    if (!entry) return null;
    const ledgerId = String(entry?.id || '').trim();
    if (!ledgerId) return null;
    const closed = isClosedEntry(entry);
    const openedAtMs = toNumber(entry?.positionOpenedAtMs ?? entry?.brokerOpenTimeMs ?? entry?.createdAtMs);
    const closedAtMs = closed
      ? toNumber(entry?.positionClosedAtMs ?? entry?.positionDetectedClosedAtMs ?? entry?.updatedAtMs)
      : null;
    const realizedPnl = toNumber(entry?.realizedPnl ?? entry?.positionClosedPnl);
    const pnlEstimate = toNumber(entry?.positionPnl ?? entry?.positionClosedPnlEstimate);
    return {
      ledgerId,
      broker: entry?.broker != null ? String(entry.broker) : undefined,
      symbol: entry?.symbol != null ? String(entry.symbol) : undefined,
      action: entry?.action != null ? String(entry.action) : undefined,
      status: entry?.status != null ? String(entry.status) : undefined,
      positionStatus: entry?.positionStatus != null ? String(entry.positionStatus) : undefined,
      entryPrice: toNumber(entry?.brokerEntryPrice ?? entry?.entryPrice),
      closePrice: toNumber(entry?.brokerClosePrice ?? entry?.closePrice),
      stopLoss: toNumber(entry?.stopLoss),
      takeProfit: toNumber(entry?.takeProfit),
      qty: toNumber(entry?.qtyNormalized ?? entry?.qty ?? entry?.brokerQty),
      openedAtMs,
      closedAtMs,
      realizedPnl,
      pnlEstimate,
      updatedAtMs: toNumber(entry?.updatedAtMs ?? entry?.createdAtMs)
    };
  };

  const accountMatches = useCallback((entry: any) => {
    const env = activeAccount?.env ?? null;
    const server = activeAccount?.server ?? null;
    const accountId = activeAccount?.accountId ?? null;
    const accNum = activeAccount?.accNum ?? null;
    if (!env && !server && !accountId && !accNum) return true;

    const normStr = (v: any) => String(v ?? '').trim().toUpperCase();
    const a = entry?.account || entry?.acct || null;
    const eEnv = a?.env != null ? String(a.env) : null;
    const eServer = a?.server != null ? String(a.server) : null;
    const eAccountId = a?.accountId != null ? Number(a.accountId) : null;
    const eAccNum = a?.accNum != null ? Number(a.accNum) : null;

    if (env != null) {
      if (!eEnv || normStr(eEnv) !== normStr(env)) return false;
    }
    if (server) {
      if (!eServer || normStr(eServer) !== normStr(server)) return false;
    }
    if (accountId != null && eAccountId !== accountId) return false;
    if (accNum != null && eAccNum !== accNum) return false;
    return true;
  }, [activeAccount?.accNum, activeAccount?.accountId, activeAccount?.env, activeAccount?.server]);

  const fetchLedgerTrades = useCallback(async () => {
    const ledger = (window as any)?.glass?.tradeLedger;
    if (!ledger?.list) {
      setLedgerError('Trade ledger not available.');
      return;
    }
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      const res = await ledger.list({ limit: 600 });
      if (!res?.ok || !Array.isArray(res.entries)) {
        setLedgerError(res?.error ? String(res.error) : 'Failed to load trade history.');
        return;
      }
      const filtered = res.entries.filter((e: any) => accountMatches(e));
      const sorted = [...filtered].sort((a, b) => {
        const aTime = Number(a?.positionClosedAtMs || 0) || Number(a?.updatedAtMs || 0) || Number(a?.createdAtMs || 0);
        const bTime = Number(b?.positionClosedAtMs || 0) || Number(b?.updatedAtMs || 0) || Number(b?.createdAtMs || 0);
        return bTime - aTime;
      });
      setLedgerTrades(sorted);
    } catch (e: any) {
      setLedgerError(e?.message ? String(e.message) : 'Failed to load trade history.');
    } finally {
      setLedgerLoading(false);
    }
  }, [accountMatches]);

  useEffect(() => {
    void fetchLedgerTrades();
  }, [fetchLedgerTrades]);

  const linkTrade = useCallback(() => {
    if (!activeNote) return;
    const entry = ledgerTrades.find((t) => String(t?.id || '') === String(selectedLedgerId || ''));
    if (!entry) return;
    const link = mapLedgerEntry(entry);
    if (!link) return;
    const existing = activeNote.tradeLinks || [];
    if (existing.some((l) => l.ledgerId === link.ledgerId)) return;
    updateNote(activeNote.id, { tradeLinks: [link, ...existing] });
    setSelectedLedgerId('');
  }, [activeNote, ledgerTrades, selectedLedgerId, updateNote]);

  const removeTradeLink = useCallback((ledgerId: string) => {
    if (!activeNote) return;
    const next = (activeNote.tradeLinks || []).filter((l) => l.ledgerId !== ledgerId);
    updateNote(activeNote.id, { tradeLinks: next });
  }, [activeNote, updateNote]);

  useEffect(() => {
    const handleEntryOpen = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const id = String(detail.id || detail.noteId || '').trim();
      if (id) setActiveId(id);
    };

    const handleChecklistToggle = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const item = String(detail.item || detail.value || '').trim();
      if (item) toggleChecklist(item);
    };

    const handleMistakeToggle = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const tagId = String(detail.tagId || detail.id || '').trim();
      if (tagId) toggleMistakeTag(tagId);
    };

    const handleTradeLink = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const action = String(detail.action || '').trim();
      const ledgerId = String(detail.ledgerId || detail.id || '').trim();
      if (!ledgerId) return;
      if (action === 'notes.trade_link.remove') {
        removeTradeLink(ledgerId);
        return;
      }
      const entry = ledgerTrades.find((t) => String(t?.id || '') === ledgerId);
      if (!entry) return;
      const link = mapLedgerEntry(entry);
      if (!link || !activeNote) return;
      const existing = activeNote.tradeLinks || [];
      if (existing.some((item) => item.ledgerId === link.ledgerId)) return;
      updateNote(activeNote.id, { tradeLinks: [...existing, link] });
    };

    const handleContext = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const action = String(detail.action || '').trim();
      if (action === 'notes.context.clear') {
        clearContext();
        return;
      }
      const withSnapshot = detail.withSnapshot === true || detail.snapshot === true;
      void attachContext(withSnapshot);
    };

    window.addEventListener('glass_notes_entry', handleEntryOpen as any);
    window.addEventListener('glass_notes_checklist', handleChecklistToggle as any);
    window.addEventListener('glass_notes_mistake', handleMistakeToggle as any);
    window.addEventListener('glass_notes_trade_link', handleTradeLink as any);
    window.addEventListener('glass_notes_context', handleContext as any);
    return () => {
      window.removeEventListener('glass_notes_entry', handleEntryOpen as any);
      window.removeEventListener('glass_notes_checklist', handleChecklistToggle as any);
      window.removeEventListener('glass_notes_mistake', handleMistakeToggle as any);
      window.removeEventListener('glass_notes_trade_link', handleTradeLink as any);
      window.removeEventListener('glass_notes_context', handleContext as any);
    };
  }, [activeNote, attachContext, clearContext, ledgerTrades, mapLedgerEntry, removeTradeLink, toggleChecklist, toggleMistakeTag, updateNote]);

  const syncTradeLinks = useCallback(() => {
    if (!activeNote) return;
    const map = new Map(ledgerTrades.map((t) => [String(t?.id || ''), t]));
    const updated = (activeNote.tradeLinks || []).map((link) => {
      const entry = map.get(link.ledgerId);
      if (!entry) return link;
      return mapLedgerEntry(entry) || link;
    });
    updateNote(activeNote.id, { tradeLinks: updated });
  }, [activeNote, ledgerTrades, updateNote]);

  const dateKeyFromMs = (ms: number) => {
    const d = new Date(ms);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getNoteDateMs = (note: NoteEntry) => {
    const dateField = note.fields?.date || note.fields?.week_of || '';
    const parsed = dateField ? Date.parse(String(dateField)) : NaN;
    return Number.isFinite(parsed) ? parsed : note.createdAtMs;
  };

  const getWeekStartMs = (ms: number) => {
    const d = new Date(ms);
    const day = (d.getDay() + 6) % 7; // Monday = 0
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day);
    return d.getTime();
  };

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return notes.filter((note) => {
      if (selectedTemplate !== 'all' && note.templateId !== selectedTemplate) return false;

      if (selectedTags.length > 0) {
        const noteTags = Array.isArray(note.tags) ? note.tags : [];
        const noteTagKeys = new Set(noteTags.map(tagKey));
        const hasAll = selectedTags.every((t) => noteTagKeys.has(tagKey(t)));
        if (!hasAll) return false;
      }

      if (selectedDateKey) {
        const key = dateKeyFromMs(note.createdAtMs);
        if (key !== selectedDateKey) return false;
      }

      if (!query) return true;
      const template = TEMPLATE_BY_ID.get(note.templateId);
      const blob = [
        note.title,
        template?.label || '',
        Object.values(note.fields || {}).join(' '),
        note.body || '',
        (note.tags || []).join(' ')
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(query);
    });
  }, [notes, search, selectedDateKey, selectedTags, selectedTemplate]);

  const renderFieldInput = (field: FieldDef, value: string) => {
    const isMissing = !!field.required && !isFieldFilled(value);
    const baseClass = `w-full bg-black/30 border rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 transition-colors font-mono ${
      isMissing ? 'border-red-500/40' : 'border-white/10'
    }`;

    if (field.type === 'textarea') {
      return (
        <textarea
          value={value}
          onChange={(e) => updateField(field.id, e.target.value)}
          rows={field.rows || 3}
          className={`${baseClass} resize-none`}
          placeholder={field.placeholder}
        />
      );
    }

    if (field.type === 'select') {
      return (
        <select
          value={value}
          onChange={(e) => updateField(field.id, e.target.value)}
          className={baseClass}
        >
          <option value="">Select.</option>
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        value={value}
        onChange={(e) => updateField(field.id, e.target.value)}
        className={baseClass}
        placeholder={field.placeholder}
      />
    );
  };

  const getRequiredStats = (note: NoteEntry) => {
    const template = TEMPLATE_BY_ID.get(note.templateId);
    if (!template) return { total: 0, filled: 0 };
    const required = template.fields.filter((f) => f.required);
    const filled = required.filter((f) => isFieldFilled(note.fields[f.id]));
    return { total: required.length, filled: filled.length };
  };

  const formatDate = (ms: number) => {
    if (!Number.isFinite(ms)) return '';
    return new Date(ms).toLocaleDateString();
  };

  const formatTime = (ms: number | null | undefined) => {
    const n = Number(ms || 0);
    if (!Number.isFinite(n) || n <= 0) return '--';
    try {
      return new Date(n).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '--';
    }
  };

  const formatPnl = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value)) return '--';
    return value >= 0 ? `+$${value.toFixed(2)}` : `-$${Math.abs(value).toFixed(2)}`;
  };

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of notes) {
      const tags = Array.isArray(note.tags) ? note.tags : [];
      for (const tag of tags) {
        const key = tagKey(tag);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    const out = Array.from(counts.entries()).map(([key, count]) => {
      const sample = notes.find((n) => (n.tags || []).some((t) => tagKey(t) === key));
      const label = sample ? (sample.tags || []).find((t) => tagKey(t) === key) || key : key;
      return { key, label, count };
    });
    out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return out;
  }, [notes]);

  const monthLabel = useMemo(() => {
    return calendarMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  }, [calendarMonth]);

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const first = new Date(year, month, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const noteCounts = new Map<string, number>();
    notes.forEach((note) => {
      const key = dateKeyFromMs(note.createdAtMs);
      noteCounts.set(key, (noteCounts.get(key) || 0) + 1);
    });

    const cells: Array<{ key: string; day: number; count: number; inMonth: boolean }> = [];
    for (let i = 0; i < 42; i++) {
      const day = i - startDay + 1;
      if (day < 1 || day > daysInMonth) {
        cells.push({ key: `empty_${i}`, day: 0, count: 0, inMonth: false });
      } else {
        const key = dateKeyFromMs(new Date(year, month, day).getTime());
        cells.push({ key, day, count: noteCounts.get(key) || 0, inMonth: true });
      }
    }
    return cells;
  }, [calendarMonth, notes]);

  const moveMonth = (delta: number) => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const weeklySummaries = useMemo(() => {
    const summaries = new Map<string, {
      weekStartMs: number;
      count: number;
      templateCounts: Record<string, number>;
      tradeCount: number;
      wins: number;
      losses: number;
      breakeven: number;
      pnlSum: number;
      pnlCount: number;
      rSum: number;
      rCount: number;
    }>();

    for (const note of filteredNotes) {
      const dateMs = getNoteDateMs(note);
      const weekStartMs = getWeekStartMs(dateMs);
      const key = dateKeyFromMs(weekStartMs);
      if (!summaries.has(key)) {
        summaries.set(key, {
          weekStartMs,
          count: 0,
          templateCounts: {},
          tradeCount: 0,
          wins: 0,
          losses: 0,
          breakeven: 0,
          pnlSum: 0,
          pnlCount: 0,
          rSum: 0,
          rCount: 0
        });
      }
      const entry = summaries.get(key)!;
      entry.count += 1;
      const templateKey = note.templateId || 'unknown';
      entry.templateCounts[templateKey] = (entry.templateCounts[templateKey] || 0) + 1;

      if (note.templateId === 'post_trade') {
        entry.tradeCount += 1;
        const result = String(note.fields?.result || '').toLowerCase();
        if (result.includes('win')) entry.wins += 1;
        else if (result.includes('loss')) entry.losses += 1;
        else if (result.includes('break')) entry.breakeven += 1;

        const pnlVal = parseNumberFromText(note.fields?.pnl || '');
        if (pnlVal != null) {
          entry.pnlSum += pnlVal;
          entry.pnlCount += 1;
        }
        const rVal = parseNumberFromText(note.fields?.r_multiple || '');
        if (rVal != null) {
          entry.rSum += rVal;
          entry.rCount += 1;
        }
      }
    }

    return Array.from(summaries.values()).sort((a, b) => b.weekStartMs - a.weekStartMs);
  }, [filteredNotes]);

  const summaryLabel = (weekStartMs: number) => {
    const d = new Date(weekStartMs);
    const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `Week of ${label}`;
  };

  const dateKeyFromValue = (value: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return dateKeyFromMs(parsed);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return '';
  };

  const findWeeklyRecapForWeek = (weekStartMs: number) => {
    const key = dateKeyFromMs(weekStartMs);
    return notes.find((note) => {
      if (note.templateId !== 'weekly_recap') return false;
      const weekOf = dateKeyFromValue(note.fields?.week_of || '');
      return weekOf === key;
    });
  };

  const createWeeklyRecapNote = (week: typeof weeklySummaries[number]) => {
    const template = TEMPLATE_BY_ID.get('weekly_recap');
    if (!template) return;
    const note = createNoteFromTemplate(template);
    const weekKey = dateKeyFromMs(week.weekStartMs);
    note.title = `Weekly Recap - ${weekKey}`;
    note.fields = {
      ...note.fields,
      week_of: weekKey,
      wins: String(week.wins),
      losses: String(week.losses),
      best_setup: '',
      biggest_mistake: '',
      improvement: ''
    };
    const winRate = week.tradeCount > 0 ? Math.round((week.wins / week.tradeCount) * 100) : 0;
    const avgR = week.rCount > 0 ? (week.rSum / week.rCount) : null;
    note.body = [
      `Summary for ${summaryLabel(week.weekStartMs)}`,
      `- Notes: ${week.count}`,
      `- Trades: ${week.tradeCount}`,
      `- W/L/BE: ${week.wins}/${week.losses}/${week.breakeven}`,
      `- Win rate: ${week.tradeCount > 0 ? `${winRate}%` : '--'}`,
      `- P&L: ${week.pnlCount > 0 ? formatPnl(week.pnlSum) : '--'}`,
      `- Avg R: ${avgR != null ? avgR.toFixed(2) : '--'}`,
      '',
      'Fill in: Best Setup, Biggest Mistake, and Improvement Focus.'
    ].join('\n');
    note.tags = ['weekly-recap', 'auto'];
    setNotes((prev) => [note, ...prev]);
    setActiveId(note.id);
  };

  useEffect(() => {
    if (!notesLoaded || !autoGenerateRecap) return;
    if (notes.length === 0) return;

    const currentWeekStartMs = getWeekStartMs(Date.now());
    const lastWeekStartMs = getWeekStartMs(currentWeekStartMs - 1);
    const lastWeekKey = dateKeyFromMs(lastWeekStartMs);
    const existingRecap = findWeeklyRecapForWeek(lastWeekStartMs);
    if (existingRecap) return;

    const summary = {
      weekStartMs: lastWeekStartMs,
      count: 0,
      templateCounts: {} as Record<string, number>,
      tradeCount: 0,
      wins: 0,
      losses: 0,
      breakeven: 0,
      pnlSum: 0,
      pnlCount: 0,
      rSum: 0,
      rCount: 0
    };

    for (const note of notes) {
      const dateMs = getNoteDateMs(note);
      const weekStartMs = getWeekStartMs(dateMs);
      if (dateKeyFromMs(weekStartMs) !== lastWeekKey) continue;
      summary.count += 1;
      const templateKey = note.templateId || 'unknown';
      summary.templateCounts[templateKey] = (summary.templateCounts[templateKey] || 0) + 1;

      if (note.templateId === 'post_trade') {
        summary.tradeCount += 1;
        const result = String(note.fields?.result || '').toLowerCase();
        if (result.includes('win')) summary.wins += 1;
        else if (result.includes('loss')) summary.losses += 1;
        else if (result.includes('break')) summary.breakeven += 1;

        const pnlVal = parseNumberFromText(note.fields?.pnl || '');
        if (pnlVal != null) {
          summary.pnlSum += pnlVal;
          summary.pnlCount += 1;
        }
        const rVal = parseNumberFromText(note.fields?.r_multiple || '');
        if (rVal != null) {
          summary.rSum += rVal;
          summary.rCount += 1;
        }
      }
    }

    if (summary.count === 0) return;
    createWeeklyRecapNote(summary);
  }, [autoGenerateRecap, notes, notesLoaded]);

  const textToBase64 = (text: string) => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const saveTextFile = async (content: string, prefix: string, mimeType: string) => {
    const saver = (window as any)?.glass?.saveUserFile;
    if (typeof saver === 'function') {
      const base64 = textToBase64(content);
      return await saver({ data: base64, mimeType, subdir: 'note-exports', prefix });
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ext = mimeType.includes('markdown') ? 'md' : mimeType.includes('csv') ? 'csv' : 'txt';
    a.download = `${prefix}_${Date.now()}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { ok: true };
  };

  const escapeCsv = (value: string) => {
    const raw = String(value ?? '');
    if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  };

  const notesToCsv = (items: NoteEntry[]) => {
    const headers = [
      'id',
      'template',
      'title',
      'tags',
      'createdAt',
      'updatedAt',
      'contextUrl',
      'contextSymbol',
      'contextTimeframe',
      'contextBias',
      'tradeLinks',
      'fields',
      'body'
    ];
    const rows = items.map((note) => {
      const tradeLinks = (note.tradeLinks || []).map((link) => {
        const pnlVal = link.realizedPnl ?? link.pnlEstimate;
        return `${link.symbol || 'UNKNOWN'}:${link.action || ''}:${formatPnl(pnlVal)}`;
      }).join(' | ');
      const fields = Object.entries(note.fields || {}).map(([k, v]) => `${k}=${v}`).join('; ');
      return [
        note.id,
        note.templateId,
        note.title,
        (note.tags || []).join('|'),
        new Date(note.createdAtMs).toISOString(),
        new Date(note.updatedAtMs).toISOString(),
        note.context?.url || '',
        note.context?.symbol || '',
        note.context?.timeframe || '',
        note.context?.sessionBias || '',
        tradeLinks,
        fields,
        note.body || ''
      ].map(escapeCsv).join(',');
    });
    return `${headers.join(',')}\n${rows.join('\n')}`;
  };

  const notesToMarkdown = (items: NoteEntry[]) => {
    return items.map((note) => {
      const lines: string[] = [];
      lines.push(`## ${note.title}`);
      lines.push(`- Template: ${note.templateId}`);
      lines.push(`- Created: ${new Date(note.createdAtMs).toLocaleString()}`);
      lines.push(`- Updated: ${new Date(note.updatedAtMs).toLocaleString()}`);
      if (note.tags && note.tags.length > 0) lines.push(`- Tags: ${note.tags.join(', ')}`);
      if (note.context?.url) {
        lines.push(`- Context: ${note.context.url}`);
      }
      if (note.context?.symbol || note.context?.timeframe || note.context?.sessionBias) {
        lines.push(`- Context Meta: ${[note.context.symbol, note.context.timeframe, note.context.sessionBias].filter(Boolean).join(' | ')}`);
      }
      if (note.tradeLinks && note.tradeLinks.length > 0) {
        lines.push(`- Linked Trades:`);
        note.tradeLinks.forEach((link) => {
          const pnlVal = link.realizedPnl ?? link.pnlEstimate;
          lines.push(`  - ${link.symbol || 'UNKNOWN'} ${link.action || ''} ${formatPnl(pnlVal)}`);
        });
      }
      if (note.fields && Object.keys(note.fields).length > 0) {
        lines.push(`- Fields:`);
        Object.entries(note.fields).forEach(([k, v]) => {
          lines.push(`  - ${k}: ${v}`);
        });
      }
      if (note.body) {
        lines.push('', note.body);
      }
      lines.push('');
      return lines.join('\n');
    }).join('\n');
  };

  const exportNotes = async (format: 'csv' | 'md') => {
    const sourceNotes = exportAll ? notes : filteredNotes;
    if (sourceNotes.length === 0) {
      setExportStatus('No notes to export.');
      return;
    }
    try {
      const content = format === 'csv' ? notesToCsv(sourceNotes) : notesToMarkdown(sourceNotes);
      const mimeType = format === 'csv' ? 'text/csv' : 'text/markdown';
      const prefix = format === 'csv' ? 'notes_export_csv' : 'notes_export_md';
      const res = await saveTextFile(content, prefix, mimeType);
      if (res?.ok) setExportStatus('Export saved.');
      else setExportStatus(res?.error ? String(res.error) : 'Export failed.');
    } catch (e: any) {
      setExportStatus(e?.message ? String(e.message) : 'Export failed.');
    }
  };

  const tradeOptions = useMemo(() => {
    return ledgerTrades.map((entry) => {
      const link = mapLedgerEntry(entry);
      if (!link) return null;
      const labelParts = [
        link.symbol || 'UNKNOWN',
        link.action || '',
        link.status || link.positionStatus || ''
      ].filter(Boolean);
      const pnl = link.realizedPnl ?? link.pnlEstimate;
      const time = formatTime(link.closedAtMs ?? link.openedAtMs);
      const label = `${labelParts.join(' ')} | ${formatPnl(pnl)} | ${time}`;
      return { id: link.ledgerId, label };
    }).filter(Boolean) as Array<{ id: string; label: string }>;
  }, [ledgerTrades]);

  const canAttachContext = !!(currentTab && currentTab.url);

  return (
    <div className="flex h-full w-full text-gray-200">
      <div className="w-72 border-r border-white/5 bg-black/20 flex flex-col">
        <div className="px-4 py-3 border-b border-white/5">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <ClipboardCheck size={12} className="text-yellow-400" />
            Notes
          </div>
          {crossPanelContext?.symbol ? (
            <div className="mt-1 text-[10px] text-gray-500">
              Context: {crossPanelContext.symbol}{crossPanelContext.timeframe ? ` ${String(crossPanelContext.timeframe).toUpperCase()}` : ''}
            </div>
          ) : null}
          <div className="mt-2 flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2 top-2.5 text-gray-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg pl-7 pr-2 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50"
                placeholder="Search notes"
              />
            </div>
            <div className="flex items-center gap-1">
              <Plus size={14} className="text-gray-500" />
              <select
                onChange={(e) => {
                  const value = e.target.value as TemplateId;
                  if (value) {
                    createNote(value);
                    e.target.selectedIndex = 0;
                  }
                }}
                className="bg-black/30 border border-white/10 rounded-lg px-2 py-2 text-[11px] text-gray-200"
              >
                <option value="">New</option>
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Filters</div>
            <select
              value={selectedTemplate}
              onChange={(e) => {
                const v = e.target.value as TemplateId | 'all';
                setSelectedTemplate(v);
              }}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-2 text-[11px] text-gray-200"
            >
              <option value="all">All templates</option>
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>

            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((tag) => {
                  const active = selectedTags.some((t) => tagKey(t) === tag.key);
                  return (
                    <button
                      key={tag.key}
                      type="button"
                      onClick={() => toggleTagFilter(tag.label)}
                      className={`px-2 py-0.5 rounded-full text-[10px] border ${
                        active
                          ? 'bg-blue-500/20 text-blue-200 border-blue-500/40'
                          : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
                      }`}
                      title={`${tag.label} (${tag.count})`}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <button
                type="button"
                onClick={clearFilters}
                className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300"
              >
                Clear filters
              </button>
              <button
                type="button"
                onClick={() => runActionOr('notes.calendar.set_month', { show: !showCalendar }, () => setShowCalendar((prev) => !prev))}
                className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300"
              >
                {showCalendar ? 'Hide calendar' : 'Show calendar'}
              </button>
            </div>
          </div>
        </div>

        {showCalendar && (
          <div className="px-3 py-3 border-b border-white/5">
            <div className="flex items-center justify-between text-[11px] text-gray-300 mb-2">
              <button
                type="button"
                onClick={() => moveMonth(-1)}
                className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10"
              >
                Prev
              </button>
              <div className="font-semibold">{monthLabel}</div>
              <button
                type="button"
                onClick={() => moveMonth(1)}
                className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10"
              >
                Next
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-[9px] text-gray-500 mb-1">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
                <div key={d} className="text-center">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((cell) => {
                const selected = cell.inMonth && selectedDateKey === cell.key;
                const hasNotes = cell.count > 0;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => {
                      if (!cell.inMonth) return;
                      const nextKey = selectedDateKey === cell.key ? '' : cell.key;
                      runActionOr('notes.filters.set', { dateKey: nextKey }, () => setSelectedDateKey(nextKey));
                    }}
                    className={`h-8 rounded-md text-[10px] flex flex-col items-center justify-center ${
                      !cell.inMonth
                        ? 'bg-black/20 text-gray-700 cursor-default'
                        : selected
                          ? 'bg-blue-500/30 text-blue-100 border border-blue-500/40'
                          : hasNotes
                            ? 'bg-white/10 text-gray-200 hover:bg-white/15'
                            : 'bg-black/20 text-gray-500 hover:bg-white/5'
                    }`}
                    title={cell.inMonth ? `${cell.day} (${cell.count} notes)` : ''}
                  >
                    <span>{cell.inMonth ? cell.day : ''}</span>
                    {hasNotes && <span className="text-[8px] text-blue-300">{cell.count}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredNotes.map((note) => {
            const template = TEMPLATE_BY_ID.get(note.templateId);
            const stats = getRequiredStats(note);
            const isActive = note.id === activeId;
            return (
              <button
                key={note.id}
                type="button"
                onClick={() => runActionOr('notes.entry.open', { id: note.id }, () => setActiveId(note.id))}
                className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${
                  isActive ? 'bg-white/10' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-100 truncate">{note.title}</div>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/5 text-gray-400">
                    {template?.label || 'Note'}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-gray-500">
                  <span>{formatDate(note.updatedAtMs)}</span>
                  {stats.total > 0 && (
                    <span className={stats.filled === stats.total ? 'text-emerald-400' : 'text-yellow-400'}>
                      {stats.filled}/{stats.total} required
                    </span>
                  )}
                </div>
                {note.tags && note.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {note.tags.slice(0, 3).map((tag) => (
                      <span
                        key={`${note.id}_${tag}`}
                        className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-gray-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}

          {filteredNotes.length === 0 && (
            <div className="px-4 py-6 text-xs text-gray-500">No notes found.</div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="px-6 py-4 border-b border-white/5 bg-black/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText size={16} className="text-blue-300" />
            <div>
              <div className="text-sm font-semibold text-gray-100">Structured Journal</div>
              <div className="text-[10px] text-gray-500">
                {activeTemplate?.description || 'Organize trades with templates and checklists.'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <button
              type="button"
              onClick={() => runActionOr('notes.summary.set', { show: !showSummary }, () => setShowSummary((prev) => !prev))}
              className={`px-2 py-1 rounded-md border ${
                showSummary ? 'bg-blue-500/20 border-blue-500/40 text-blue-200' : 'bg-white/5 border-white/10 text-gray-300'
              }`}
            >
              {showSummary ? 'Hide Summary' : 'Show Summary'}
            </button>
            <label
              className="flex items-center gap-2 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-gray-300"
              title="Auto-create a recap for the last completed week"
            >
              <input
                type="checkbox"
                checked={autoGenerateRecap}
                onChange={(e) => setAutoGenerateRecap(e.target.checked)}
              />
              Auto recap
            </label>
            <label className="flex items-center gap-2 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-gray-300">
              <input
                type="checkbox"
                checked={exportAll}
                onChange={(e) => setExportAll(e.target.checked)}
              />
              Export all
            </label>
            <button
              type="button"
              onClick={() => void exportNotes('csv')}
              className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 flex items-center gap-1"
              title="Export filtered notes to CSV"
            >
              <Download size={12} /> CSV
            </button>
            <button
              type="button"
              onClick={() => void exportNotes('md')}
              className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 flex items-center gap-1"
              title="Export filtered notes to Markdown"
            >
              <Download size={12} /> MD
            </button>
            <div className="flex items-center gap-1 text-[10px] text-gray-500">
              <Save size={12} />
              {lastSavedAtMs ? `Saved ${new Date(lastSavedAtMs).toLocaleTimeString()}` : 'Auto-saved'}
            </div>
          </div>
        </div>

        {activeNote ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {exportStatus && (
              <div className="text-[10px] text-gray-500">{exportStatus}</div>
            )}

            {showSummary && (
              <div className="bg-black/20 border border-white/10 rounded-lg p-4 space-y-3">
                <div className="text-[11px] text-gray-400 uppercase tracking-wider">Weekly Summary (Filtered)</div>
                {weeklySummaries.length === 0 ? (
                  <div className="text-[11px] text-gray-500">No notes to summarize.</div>
                ) : (
                  <div className="space-y-3">
                    {weeklySummaries.slice(0, 8).map((week) => {
                      const winRate = week.tradeCount > 0 ? Math.round((week.wins / week.tradeCount) * 100) : 0;
                      const avgR = week.rCount > 0 ? (week.rSum / week.rCount) : null;
                      const existingRecap = findWeeklyRecapForWeek(week.weekStartMs);
                      return (
                        <div key={week.weekStartMs} className="border border-white/10 rounded-lg p-3 bg-black/30">
                          <div className="flex items-center justify-between text-[11px] text-gray-300">
                            <span className="font-semibold">{summaryLabel(week.weekStartMs)}</span>
                            <div className="flex items-center gap-2">
                              <span>{week.count} notes</span>
                              {existingRecap ? (
                                <button
                                  type="button"
                                  onClick={() => setActiveId(existingRecap.id)}
                                  className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300"
                                >
                                  Open recap
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => createWeeklyRecapNote(week)}
                                  className="px-2 py-1 rounded-md bg-blue-600/70 hover:bg-blue-600 text-white border border-blue-500/40"
                                >
                                  Create recap
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-gray-400">
                            <div>Trades: {week.tradeCount}</div>
                            <div>W/L/BE: {week.wins}/{week.losses}/{week.breakeven}</div>
                            <div>Win rate: {week.tradeCount > 0 ? `${winRate}%` : '--'}</div>
                            <div>P&L: {week.pnlCount > 0 ? formatPnl(week.pnlSum) : '--'}</div>
                            <div>Avg R: {avgR != null ? avgR.toFixed(2) : '--'}</div>
                            <div>Templates: {Object.keys(week.templateCounts).length}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-3">
              <input
                value={activeNote.title}
                onChange={(e) => updateNote(activeNote.id, { title: e.target.value })}
                className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50"
                placeholder="Note title"
              />
              <button
                onClick={() => deleteNote(activeNote.id)}
                className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-red-500/20 text-gray-300 hover:text-red-200 transition-colors"
                title="Delete note"
              >
                <Trash2 size={14} />
              </button>
            </div>

            <div className="bg-black/20 border border-white/10 rounded-lg p-4 space-y-3">
              <div className="text-[11px] text-gray-400 uppercase tracking-wider">Tags</div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  className="flex-1 min-w-[160px] bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50"
                  placeholder="Add tag and press Enter"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (tagInput.trim()) {
                      addTag(tagInput);
                      setTagInput('');
                    }
                  }}
                  className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-white/10 hover:bg-white/20 text-gray-200"
                >
                  Add
                </button>
              </div>
              {activeNote.tags && activeNote.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {activeNote.tags.map((tag) => (
                    <span
                      key={`${activeNote.id}_${tag}`}
                      className="inline-flex items-center gap-2 px-2 py-1 rounded-full text-[10px] bg-white/10 text-gray-300"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="text-gray-500 hover:text-gray-200"
                        title="Remove tag"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-gray-500">No tags yet.</div>
              )}
            </div>

            <div className="bg-black/20 border border-white/10 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <Link2 size={12} className="text-blue-300" />
                  Context Link
                </div>
                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                  <label className="flex items-center gap-2 select-none">
                    <input
                      type="checkbox"
                      checked={autoLinkNewNotes}
                      onChange={(e) => setAutoLinkNewNotes(e.target.checked)}
                    />
                    Auto-link new notes
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void attachContext(false)}
                  disabled={!canAttachContext || isAttaching}
                  className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50 transition-colors"
                >
                  Attach Current Tab
                </button>
                <button
                  type="button"
                  onClick={() => void attachContext(true)}
                  disabled={!canAttachContext || isAttaching}
                  className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-blue-600/80 hover:bg-blue-600 text-white disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  <Camera size={12} />
                  Attach + Snapshot
                </button>
                {activeNote.context && (
                  <button
                    type="button"
                    onClick={clearContext}
                    className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-red-500/20 text-gray-300 hover:text-red-200 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>

              {activeNote.context ? (
                <div className="grid grid-cols-2 gap-3 text-[11px] text-gray-300">
                  <div className="col-span-2">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">URL</div>
                    <div className="truncate text-blue-300" title={activeNote.context.url || ''}>
                      {activeNote.context.url || '--'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Symbol</div>
                    <div>{activeNote.context.symbol || '--'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Timeframe</div>
                    <div>{activeNote.context.timeframe || '--'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Session Bias</div>
                    <div>{activeNote.context.sessionBias || '--'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Captured</div>
                    <div>{activeNote.context.capturedAtMs ? new Date(activeNote.context.capturedAtMs).toLocaleTimeString() : '--'}</div>
                  </div>
                  {activeNote.context.snapshot && (
                    <div className="col-span-2">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Snapshot</div>
                      <img
                        src={activeNote.context.snapshot}
                        alt="Context snapshot"
                        className="w-full max-h-56 object-cover rounded-lg border border-white/10"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-gray-500">
                  No context linked yet. Attach the current tab to populate symbol, timeframe, and bias.
                </div>
              )}
            </div>

            {activeTemplate && activeTemplate.fields.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                {activeTemplate.fields.map((field) => {
                  const value = activeNote.fields[field.id] || '';
                  const missing = field.required && !isFieldFilled(value);
                  return (
                    <div key={field.id} className={field.type === 'textarea' ? 'col-span-2' : ''}>
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-2">
                        {field.label}
                        {field.required && <span className="text-red-400">*</span>}
                        {missing && <span className="text-[9px] text-red-400">Required</span>}
                      </label>
                      {renderFieldInput(field, value)}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTemplate && activeTemplate.checklist.length > 0 && (
              <div className="bg-black/20 border border-white/10 rounded-lg p-4">
                <div className="text-[11px] text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-3">
                  <ClipboardCheck size={12} className="text-emerald-400" />
                  Checklist
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {activeTemplate.checklist.map((item) => (
                    <label key={item} className="flex items-center gap-2 text-[11px] text-gray-300">
                      <input
                        type="checkbox"
                        checked={!!activeNote.checklist[item]}
                        onChange={() => toggleChecklist(item)}
                      />
                      {item}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {activeNote?.templateId === 'post_trade' && (
              <div className="bg-black/20 border border-white/10 rounded-lg p-4">
                <div className="text-[11px] text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-3">
                  <ClipboardCheck size={12} className="text-yellow-300" />
                  Mistake Tags
                </div>
                <div className="flex flex-wrap gap-2">
                  {MISTAKE_TAXONOMY.map((tag) => {
                    const active = (activeNote.tags || []).some((t) => tagKey(t) === tagKey(tag.id));
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleMistakeTag(tag.id)}
                        className={`px-2 py-1 rounded-full text-[10px] border transition-colors ${
                          active
                            ? 'border-yellow-300/60 bg-yellow-400/10 text-yellow-200'
                            : 'border-white/10 text-gray-400 hover:text-gray-200'
                        }`}
                        title={tag.label}
                      >
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="bg-black/20 border border-white/10 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <ClipboardCheck size={12} className="text-blue-300" />
                  Linked Trades
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void fetchLedgerTrades()}
                    className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={syncTradeLinks}
                    className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300"
                  >
                    Sync Linked
                  </button>
                </div>
              </div>

              {ledgerError && (
                <div className="text-[10px] text-red-400/90 font-mono">{ledgerError}</div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedLedgerId}
                  onChange={(e) => setSelectedLedgerId(e.target.value)}
                  className="min-w-[220px] bg-black/30 border border-white/10 rounded-lg px-2 py-2 text-[11px] text-gray-200"
                >
                  <option value="">Select trade to link</option>
                  {tradeOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={linkTrade}
                  disabled={!selectedLedgerId || ledgerLoading}
                  className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-blue-600/80 hover:bg-blue-600 text-white disabled:opacity-50 transition-colors"
                >
                  Link Trade
                </button>
                <div className="text-[10px] text-gray-500">
                  {ledgerLoading ? 'Loading trades...' : `${tradeOptions.length} trades`}
                </div>
              </div>

              {(activeNote.tradeLinks || []).length === 0 ? (
                <div className="text-[11px] text-gray-500">No linked trades yet.</div>
              ) : (
                <div className="space-y-3">
                  {(activeNote.tradeLinks || []).map((link) => {
                    const pnlValue = link.realizedPnl ?? link.pnlEstimate;
                    const pnlColor = pnlValue != null && Number.isFinite(pnlValue) && pnlValue < 0 ? 'text-red-300' : 'text-emerald-300';
                    const replaySymbol = link.symbol || activeNote.fields?.symbol || activeNote.context?.symbol || '';
                    const replayTimeframe = activeNote.fields?.timeframe || activeNote.context?.timeframe || null;
                    const canReplay = !!onReplayTrade && !!replaySymbol;
                    return (
                      <div key={link.ledgerId} className="border border-white/10 rounded-lg p-3 bg-black/30">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-gray-100">
                            {link.symbol || 'UNKNOWN'} {link.action ? `(${link.action})` : ''}
                          </div>
                          <div className={`text-xs font-semibold ${pnlColor}`}>{formatPnl(pnlValue)}</div>
                          <div className="flex items-center gap-2">
                            {canReplay && (
                              <button
                                type="button"
                                onClick={() =>
                                  onReplayTrade?.({
                                    symbol: replaySymbol,
                                    timeframe: replayTimeframe,
                                    entryPrice: link.entryPrice ?? null,
                                    stopLoss: link.stopLoss ?? null,
                                    takeProfit: link.takeProfit ?? null,
                                    closePrice: link.closePrice ?? null,
                                    action: link.action ?? null,
                                    ledgerId: link.ledgerId,
                                    noteId: activeNote.id
                                  })
                                }
                                className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white/10 hover:bg-white/20 text-gray-200 transition-colors"
                              >
                                Replay
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeTradeLink(link.ledgerId)}
                              className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white/5 hover:bg-red-500/20 text-gray-300 hover:text-red-200 transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-300">
                          <div>Entry: {link.entryPrice != null ? link.entryPrice : '--'}</div>
                          <div>Exit: {link.closePrice != null ? link.closePrice : '--'}</div>
                          <div>SL: {link.stopLoss != null ? link.stopLoss : '--'}</div>
                          <div>TP: {link.takeProfit != null ? link.takeProfit : '--'}</div>
                          <div>Qty: {link.qty != null ? link.qty : '--'}</div>
                          <div>Status: {link.positionStatus || link.status || '--'}</div>
                          <div>Opened: {formatTime(link.openedAtMs)}</div>
                          <div>Closed: {formatTime(link.closedAtMs)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Notes</label>
              <textarea
                value={activeNote.body}
                onChange={(e) => updateNote(activeNote.id, { body: e.target.value })}
                className="w-full min-h-[180px] bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 resize-none"
                placeholder="Add additional context, reflections, or links."
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-sm text-gray-500">
            No note selected.
          </div>
        )}

        <div className="px-4 pb-4">
        </div>
        <div className="p-3 bg-white/5 text-[10px] text-gray-500 text-center border-t border-white/5">
          Notes are stored locally on this device.
        </div>
      </div>
    </div>
  );
};

export default NotesInterface;
