import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layers, Plus, RefreshCw, Trash2, Play } from 'lucide-react';
import { runBacktestOptimization } from '../services/backtestResearchService';
import { buildEvidenceCardFromLibraryEntry } from '../services/evidenceCard';
import { buildEvidenceCardFromSignal } from '../services/evidenceCard';
import { normalizeSymbolKey, normalizeTimeframeKey } from '../services/symbols';
import {
  CrossPanelContext,
  ExecutionPlaybook,
  RegimeBlockState,
  RegimeSnapshot,
  SetupLibraryEntry,
  SetupPerformance,
  SetupSignal,
  SetupSignalTransition,
  SetupWatcher
} from '../types';

interface SetupsInterfaceProps {
  isConnected: boolean;
  watchers: SetupWatcher[];
  signals: SetupSignal[];
  libraryEntries?: SetupLibraryEntry[];
  regimes?: Record<string, RegimeSnapshot>;
  regimeBlocks?: Record<string, RegimeBlockState>;
  performanceByWatcher?: Record<string, SetupPerformance>;
  performanceByLibrary?: Record<string, SetupPerformance>;
  performanceByMode?: Record<string, SetupPerformance>;
  performanceBySymbol?: Record<string, SetupPerformance>;
  performanceSummary?: SetupPerformance | null;
  performanceUpdatedAtMs?: number | null;
  performanceError?: string | null;
  onCreateWatcher?: (input: {
    symbol: string;
    timeframe: string;
    strategy: SetupWatcher['strategy'];
    params?: Record<string, any>;
    playbook?: ExecutionPlaybook | null;
    mode?: SetupWatcher['mode'];
    enabled?: boolean;
    library?: SetupLibraryEntry | null;
    regime?: SetupWatcher['regime'];
  }) => SetupWatcher | null | void;
  playbookStatusByWatcher?: Record<string, {
    stepsTotal?: number;
    stepsDone?: number;
    breakevenDone?: boolean;
    trailActive?: boolean;
    lastActionAtMs?: number | null;
    openedAtMs?: number | null;
    positionId?: string | null;
  }>;
  onUpdateWatcher?: (id: string, patch: Partial<SetupWatcher>) => void;
  onRemoveWatcher?: (id: string) => void;
  onClearSignals?: () => void;
  onFocusChart?: (symbol: string, timeframe?: string) => void;
  onApplyToBacktester?: (payload: { strategy: string; params: Record<string, any>; symbol?: string; timeframe?: string }) => void;
  onExplainSignal?: (signalId: string, profileId?: string | null) => void;
  onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
  crossPanelContext?: CrossPanelContext | null;
}

const STRATEGIES: Array<SetupWatcher['strategy']> = [
  'RANGE_BREAKOUT',
  'BREAK_RETEST',
  'FVG_RETRACE',
  'TREND_PULLBACK',
  'MEAN_REVERSION'
];

const MODES: Array<SetupWatcher['mode']> = ['suggest', 'paper', 'live'];

const REGIME_CREATE_OPTIONS: Array<{ value: 'default' | SetupWatcher['regime']; label: string }> = [
  { value: 'default', label: 'Default (strategy)' },
  { value: 'any', label: 'Any regime' },
  { value: 'trend', label: 'Trend' },
  { value: 'range', label: 'Range' },
  { value: 'breakout', label: 'Breakout' }
];

const REGIME_OPTIONS: Array<{ value: SetupWatcher['regime']; label: string }> = [
  { value: 'any', label: 'Any regime' },
  { value: 'trend', label: 'Trend' },
  { value: 'range', label: 'Range' },
  { value: 'breakout', label: 'Breakout' }
];

type PlaybookDraftStep = {
  id: string;
  rr: string;
  qtyPct: string;
};

type PlaybookDraft = {
  enabled: boolean;
  steps: PlaybookDraftStep[];
  breakevenAtR: string;
  trailEnabled: boolean;
  trailActivationR: string;
  trailOffsetR: string;
};

const emptyPlaybookDraft: PlaybookDraft = {
  enabled: false,
  steps: [],
  breakevenAtR: '',
  trailEnabled: false,
  trailActivationR: '',
  trailOffsetR: ''
};

const formatDraftNumber = (value: any) => {
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : '';
};

const draftFromPlaybook = (playbook?: ExecutionPlaybook | null): PlaybookDraft => {
  if (!playbook) return { ...emptyPlaybookDraft };
  const steps = Array.isArray(playbook.steps)
    ? playbook.steps.map((step, index) => ({
        id: String(step?.id || `step_${index + 1}`),
        rr: formatDraftNumber(step?.rr),
        qtyPct: formatDraftNumber(step?.qtyPct)
      }))
    : [];
  return {
    enabled: playbook.enabled !== false,
    steps,
    breakevenAtR: formatDraftNumber(playbook.breakevenAtR),
    trailEnabled: !!playbook.trail,
    trailActivationR: formatDraftNumber(playbook.trail?.activationR),
    trailOffsetR: formatDraftNumber(playbook.trail?.offsetR)
  };
};

const buildPlaybookFromDraft = (draft: PlaybookDraft): ExecutionPlaybook | null => {
  if (!draft.enabled) return null;
  const toNumber = (value: string) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };
  const steps = draft.steps
    .map((step) => {
      const rr = toNumber(step.rr);
      const qtyPct = toNumber(step.qtyPct);
      if (!rr || rr <= 0 || !qtyPct || qtyPct <= 0) return null;
      return { id: step.id, rr, qtyPct };
    })
    .filter(Boolean) as ExecutionPlaybook['steps'];
  const breakevenAtR = toNumber(draft.breakevenAtR);
  const trailActivation = toNumber(draft.trailActivationR);
  const trailOffset = toNumber(draft.trailOffsetR);
  const trail =
    draft.trailEnabled && ((trailActivation != null && trailActivation > 0) || (trailOffset != null && trailOffset > 0))
      ? {
          activationR: trailActivation != null && trailActivation > 0 ? trailActivation : undefined,
          offsetR: trailOffset != null && trailOffset > 0 ? trailOffset : undefined
        }
      : null;
  if (steps.length === 0 && !(breakevenAtR != null && breakevenAtR > 0) && !trail) return null;
  return {
    enabled: true,
    steps,
    breakevenAtR: breakevenAtR != null && breakevenAtR > 0 ? breakevenAtR : undefined,
    trail
  };
};

const buildRegimeKey = (symbol: string, timeframe: string) => {
  const sym = normalizeSymbolKey(symbol);
  const tf = normalizeTimeframeKey(timeframe);
  if (!sym || !tf) return '';
  return `${sym}:${tf}`;
};

const formatAge = (ms?: number | null) => {
  if (!ms || !Number.isFinite(ms)) return '--';
  const delta = Math.max(0, Date.now() - ms);
  const seconds = Math.max(1, Math.floor(delta / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
};

const isSetupSignalDebugEnabled = () => {
  try {
    const raw = localStorage.getItem('glass_setup_signal_debug');
    return raw === '1' || raw === 'true';
  } catch {
    return false;
  }
};

const resolveSignalStatus = (signal?: SetupSignal | null) => {
  const raw = String(signal?.payload?.status || signal?.payload?.signalType || '').trim();
  return raw || 'setup_ready';
};

const formatSignalStatus = (status: string) => {
  switch (status) {
    case 'setup_detected':
      return 'DETECTED';
    case 'setup_ready':
      return 'READY';
    case 'entry_confirmed':
      return 'CONFIRMED';
    case 'triggered':
      return 'TRIGGERED';
    case 'invalidated':
      return 'INVALID';
    default:
      return status.toUpperCase();
  }
};

const getSignalStatusClass = (status: string) => {
  switch (status) {
    case 'entry_confirmed':
      return 'bg-emerald-500/20 text-emerald-200';
    case 'setup_ready':
      return 'bg-cyan-500/20 text-cyan-200';
    case 'setup_detected':
      return 'bg-slate-500/20 text-slate-200';
    case 'triggered':
      return 'bg-amber-500/20 text-amber-200';
    case 'invalidated':
      return 'bg-red-500/20 text-red-200';
    default:
      return 'bg-white/10 text-gray-200';
  }
};

const formatPrice = (value: any) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '--';
  const abs = Math.abs(num);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return num.toFixed(decimals).replace(/\.?0+$/, '');
};

type PlaybookEditorProps = {
  draft: PlaybookDraft;
  onChange: (draft: PlaybookDraft) => void;
};

const PlaybookEditor: React.FC<PlaybookEditorProps> = ({ draft, onChange }) => {
  const updateDraft = (patch: Partial<PlaybookDraft>) => {
    onChange({ ...draft, ...patch });
  };

  const updateStep = (id: string, patch: Partial<PlaybookDraftStep>) => {
    const next = draft.steps.map((step) => (step.id === id ? { ...step, ...patch } : step));
    updateDraft({ steps: next });
  };

  const removeStep = (id: string) => {
    updateDraft({ steps: draft.steps.filter((step) => step.id !== id) });
  };

  const addStep = () => {
    const id = `step_${Date.now().toString(16)}`;
    updateDraft({ steps: [...draft.steps, { id, rr: '', qtyPct: '' }] });
  };

  return (
    <div className="rounded-lg border border-white/10 bg-black/40 p-3 space-y-3">
      <label className="flex items-center gap-2 text-[11px] text-gray-300">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => updateDraft({ enabled: e.target.checked })}
        />
        Enable playbook
      </label>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <label className="flex flex-col gap-1">
          Breakeven at R
          <input
            value={draft.breakevenAtR}
            onChange={(e) => updateDraft({ breakevenAtR: e.target.value })}
            placeholder="1"
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
          />
        </label>
        <label className="flex items-center gap-2 text-[11px] text-gray-300">
          <input
            type="checkbox"
            checked={draft.trailEnabled}
            onChange={(e) => updateDraft({ trailEnabled: e.target.checked })}
          />
          Trail stop
        </label>
        <label className="flex flex-col gap-1">
          Trail activation R
          <input
            value={draft.trailActivationR}
            onChange={(e) => updateDraft({ trailActivationR: e.target.value })}
            placeholder="2"
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            disabled={!draft.trailEnabled}
          />
        </label>
        <label className="flex flex-col gap-1">
          Trail offset R
          <input
            value={draft.trailOffsetR}
            onChange={(e) => updateDraft({ trailOffsetR: e.target.value })}
            placeholder="0.8"
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            disabled={!draft.trailEnabled}
          />
        </label>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-gray-400">
          <span>TP Steps</span>
          <button
            type="button"
            onClick={addStep}
            className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] text-gray-200 hover:bg-white/10"
          >
            + Step
          </button>
        </div>
        {draft.steps.length === 0 ? (
          <div className="text-[11px] text-gray-500">No steps configured.</div>
        ) : (
          draft.steps.map((step, index) => (
            <div key={step.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
              <input
                value={step.rr}
                onChange={(e) => updateStep(step.id, { rr: e.target.value })}
                placeholder={`RR ${index + 1}`}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
              />
              <input
                value={step.qtyPct}
                onChange={(e) => updateStep(step.id, { qtyPct: e.target.value })}
                placeholder="Qty %"
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
              />
              <button
                type="button"
                onClick={() => removeStep(step.id)}
                className="px-2 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-200 text-[10px]"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const SetupsInterface: React.FC<SetupsInterfaceProps> = ({
  isConnected,
  watchers,
  signals,
  libraryEntries,
  regimes,
  regimeBlocks,
  performanceByWatcher,
  performanceByLibrary,
  performanceByMode,
  performanceBySymbol,
  performanceSummary,
  performanceUpdatedAtMs,
  performanceError,
  playbookStatusByWatcher,
  onCreateWatcher,
  onUpdateWatcher,
  onRemoveWatcher,
  onClearSignals,
  onFocusChart,
  onApplyToBacktester,
  onExplainSignal,
  onRunActionCatalog,
  crossPanelContext
}) => {
  const library = Array.isArray(libraryEntries) ? libraryEntries : [];
  const [symbolInput, setSymbolInput] = useState('');
  const [timeframeInput, setTimeframeInput] = useState('15m');
  const [strategyInput, setStrategyInput] = useState<SetupWatcher['strategy']>('RANGE_BREAKOUT');
  const [modeInput, setModeInput] = useState<SetupWatcher['mode']>('suggest');
  const [regimeInput, setRegimeInput] = useState<'default' | SetupWatcher['regime']>('default');
  const [paramsInput, setParamsInput] = useState('');
  const [enabledInput, setEnabledInput] = useState(true);
  const [playbookDraft, setPlaybookDraft] = useState<PlaybookDraft>({ ...emptyPlaybookDraft });
  const [playbookCreateOpen, setPlaybookCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const [replayRangeDays, setReplayRangeDays] = useState(90);
  const [replayBusyById, setReplayBusyById] = useState<Record<string, boolean>>({});
  const [replayErrorById, setReplayErrorById] = useState<Record<string, string>>({});
  const [replayResultById, setReplayResultById] = useState<Record<string, any>>({});
  const [playbookEditOpenById, setPlaybookEditOpenById] = useState<Record<string, boolean>>({});
  const [playbookEditDraftById, setPlaybookEditDraftById] = useState<Record<string, PlaybookDraft>>({});
  const [playbookEditErrorById, setPlaybookEditErrorById] = useState<Record<string, string>>({});

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

  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterTimeframe, setFilterTimeframe] = useState('');
  const [filterStrategy, setFilterStrategy] = useState('');
  const [filterReadyOnly, setFilterReadyOnly] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [compareKeys, setCompareKeys] = useState<string[]>([]);
  const [debugEnabled, setDebugEnabled] = useState(() => isSetupSignalDebugEnabled());
  const [transitionProfileId, setTransitionProfileId] = useState('');
  const [transitionSignalId, setTransitionSignalId] = useState('');
  const [transitionSymbol, setTransitionSymbol] = useState('');
  const [transitionTimeframe, setTransitionTimeframe] = useState('');
  const [transitionLimit, setTransitionLimit] = useState(50);
  const [transitionEntries, setTransitionEntries] = useState<SetupSignalTransition[]>([]);
  const [transitionLoading, setTransitionLoading] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const watchersRef = useRef<SetupWatcher[]>(Array.isArray(watchers) ? watchers : []);
  const handleReplayWatcherRef = useRef<((watcher: SetupWatcher) => Promise<void> | void) | null>(null);
  const togglePlaybookEditorRef = useRef<((watcher: SetupWatcher) => void) | null>(null);
  const handlePlaybookSaveEventRef = useRef<((event: any) => void) | null>(null);
  const handlePlaybookResetEventRef = useRef<((event: any) => void) | null>(null);
  const handlePlaybookCreateToggleRef = useRef<((event: any) => void) | null>(null);
  const handleApplyToBacktesterRef = useRef<((watcher: SetupWatcher) => void) | null>(null);

  const filteredWatchers = useMemo(() => {
    const sym = normalizeSymbolKey(filterSymbol);
    const tf = normalizeTimeframeKey(filterTimeframe);
    const strat = String(filterStrategy || '').trim().toUpperCase();
    return (watchers || []).filter((watcher) => {
      if (sym && normalizeSymbolKey(watcher.symbol) !== sym) return false;
      if (tf && normalizeTimeframeKey(watcher.timeframe) !== tf) return false;
      if (strat && String(watcher.strategy).toUpperCase() !== strat) return false;
      return true;
    });
  }, [filterStrategy, filterSymbol, filterTimeframe, watchers]);

  const filteredSignals = useMemo(() => {
    const sym = normalizeSymbolKey(filterSymbol);
    const tf = normalizeTimeframeKey(filterTimeframe);
    const strat = String(filterStrategy || '').trim().toUpperCase();
    return (signals || [])
      .filter((signal) => {
        if (!signal) return false;
        if (sym && normalizeSymbolKey(signal.symbol) !== sym) return false;
        if (tf && normalizeTimeframeKey(signal.timeframe) !== tf) return false;
        if (strat && String(signal.payload?.strategy || '').toUpperCase() !== strat) return false;
        if (filterReadyOnly) {
          const status = resolveSignalStatus(signal);
          if (status !== 'setup_ready' && status !== 'entry_confirmed') return false;
        }
        return true;
      })
        .sort((a, b) => (b.ts || 0) - (a.ts || 0));
    }, [filterReadyOnly, filterStrategy, filterSymbol, filterTimeframe, signals]);

  useEffect(() => {
    watchersRef.current = Array.isArray(watchers) ? watchers : [];
  }, [watchers]);

  useEffect(() => {
    setDebugEnabled(isSetupSignalDebugEnabled());
  }, [signals?.length]);

  useEffect(() => {
    if (transitionSymbol || transitionTimeframe) return;
    const first = filteredSignals[0];
    if (first?.symbol) setTransitionSymbol(first.symbol);
    if (first?.timeframe) setTransitionTimeframe(first.timeframe);
  }, [filteredSignals, transitionSymbol, transitionTimeframe]);

  useEffect(() => {
    const contextSymbol = String(crossPanelContext?.symbol || '').trim();
    if (!contextSymbol) return;
    if (String(symbolInput || '').trim()) return;
    setSymbolInput(contextSymbol);
    const contextTimeframe = String(crossPanelContext?.timeframe || '').trim();
    if (contextTimeframe) {
      setTimeframeInput(contextTimeframe);
    }
  }, [crossPanelContext?.symbol, crossPanelContext?.timeframe, symbolInput]);

  useEffect(() => {
    const handler = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.clear) {
        setFilterSymbol('');
        setFilterTimeframe('');
        setFilterStrategy('');
        setFilterReadyOnly(false);
        setLibrarySearch('');
        return;
      }
      if (detail.symbol != null) setFilterSymbol(String(detail.symbol));
      if (detail.timeframe != null) setFilterTimeframe(String(detail.timeframe));
      if (detail.strategy != null) setFilterStrategy(String(detail.strategy));
      if (detail.readyOnly != null) setFilterReadyOnly(!!detail.readyOnly);
      if (detail.search != null) setLibrarySearch(String(detail.search));
    };
    window.addEventListener('glass_setups_filters', handler as any);
    return () => window.removeEventListener('glass_setups_filters', handler as any);
  }, []);

  useEffect(() => {
    const normalizeCompareKey = (raw: any) => String(raw || '').trim();

    const handleLibraryFilters = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.clear) {
        setLibrarySearch('');
        return;
      }
      if (detail.search != null) setLibrarySearch(String(detail.search));
    };

    const handleCompare = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.clear) {
        setCompareKeys([]);
        return;
      }
      const keys = Array.isArray(detail.keys)
        ? detail.keys.map(normalizeCompareKey).filter(Boolean)
        : [];
      if (keys.length > 0) {
        const unique = Array.from(new Set(keys)).slice(0, MAX_COMPARE);
        setCompareKeys(unique);
        return;
      }
      const key = normalizeCompareKey(detail.key);
      if (!key) return;
      const mode = String(detail.mode || 'toggle').trim().toLowerCase();
      setCompareKeys((prev) => {
        const exists = prev.includes(key);
        if (mode === 'remove') return prev.filter((item) => item !== key);
        if (mode === 'add') {
          if (exists || prev.length >= MAX_COMPARE) return prev;
          return [...prev, key];
        }
        if (exists) return prev.filter((item) => item !== key);
        if (prev.length >= MAX_COMPARE) return prev;
        return [...prev, key];
      });
    };

    const handlePlaybookDraft = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const targetId = detail.watcherId ? String(detail.watcherId) : detail.id ? String(detail.id) : '';
      if (detail.reset) {
        if (targetId) {
          setPlaybookEditDraftById((prev) => ({ ...prev, [targetId]: { ...emptyPlaybookDraft } }));
        } else {
          setPlaybookDraft({ ...emptyPlaybookDraft });
        }
        return;
      }
      const baseDraft = detail.playbook ? draftFromPlaybook(detail.playbook) : null;
      const stepList = Array.isArray(detail.steps) ? detail.steps : null;
      const patch = {
        enabled: detail.enabled,
        breakevenAtR: detail.breakevenAtR,
        trailEnabled: detail.trailEnabled,
        trailActivationR: detail.trailActivationR,
        trailOffsetR: detail.trailOffsetR
      };
      const mergeDraft = (prev: PlaybookDraft) => {
        let next: PlaybookDraft = baseDraft ? { ...baseDraft } : { ...prev };
        if (patch.enabled != null) next.enabled = !!patch.enabled;
        if (patch.breakevenAtR != null) next.breakevenAtR = String(patch.breakevenAtR);
        if (patch.trailEnabled != null) next.trailEnabled = !!patch.trailEnabled;
        if (patch.trailActivationR != null) next.trailActivationR = String(patch.trailActivationR);
        if (patch.trailOffsetR != null) next.trailOffsetR = String(patch.trailOffsetR);
        if (stepList) {
          next.steps = stepList.map((step: any, idx: number) => ({
            id: String(step?.id || `step_${idx + 1}`),
            rr: step?.rr != null ? String(step.rr) : '',
            qtyPct: step?.qtyPct != null ? String(step.qtyPct) : ''
          }));
        }
        return next;
      };
      if (targetId) {
        setPlaybookEditDraftById((prev) => ({ ...prev, [targetId]: mergeDraft(prev[targetId] || { ...emptyPlaybookDraft }) }));
      } else {
        setPlaybookDraft((prev) => mergeDraft(prev));
      }
    };

    const handleDebugFilters = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.clear) {
        setTransitionSymbol('');
        setTransitionTimeframe('');
        setTransitionProfileId('');
        setTransitionSignalId('');
        return;
      }
      if (detail.symbol != null) setTransitionSymbol(String(detail.symbol));
      if (detail.timeframe != null) setTransitionTimeframe(String(detail.timeframe));
      if (detail.profileId != null) setTransitionProfileId(String(detail.profileId));
      if (detail.signalId != null) setTransitionSignalId(String(detail.signalId));
      if (detail.limit != null && Number.isFinite(Number(detail.limit))) {
        setTransitionLimit(Math.max(1, Math.min(500, Math.floor(Number(detail.limit)))));
      }
    };

    const handleCreateForm = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.reset) {
        setSymbolInput('');
        setTimeframeInput('15m');
        setStrategyInput('RANGE_BREAKOUT');
        setModeInput('suggest');
        setRegimeInput('default');
        setParamsInput('');
        setEnabledInput(true);
        setPlaybookDraft({ ...emptyPlaybookDraft });
        return;
      }
      if (detail.symbol != null) setSymbolInput(String(detail.symbol));
      if (detail.timeframe != null) setTimeframeInput(String(detail.timeframe));
      if (detail.strategy != null) setStrategyInput(String(detail.strategy).trim().toUpperCase() as SetupWatcher['strategy']);
      if (detail.mode != null) {
        const modeRaw = String(detail.mode).trim().toLowerCase();
        if (modeRaw === 'suggest' || modeRaw === 'paper' || modeRaw === 'live') setModeInput(modeRaw as SetupWatcher['mode']);
      }
      if (detail.regime != null) {
        const regimeRaw = String(detail.regime).trim().toLowerCase();
        if (regimeRaw === 'default' || regimeRaw === 'any' || regimeRaw === 'trend' || regimeRaw === 'range' || regimeRaw === 'breakout') {
          setRegimeInput(regimeRaw as any);
        }
      }
      if (detail.enabled != null) setEnabledInput(!!detail.enabled);
      if (detail.params != null) {
        if (typeof detail.params === 'string') {
          setParamsInput(detail.params);
        } else {
          try {
            setParamsInput(JSON.stringify(detail.params, null, 2));
          } catch {
            setParamsInput(String(detail.params));
          }
        }
      }
      if (detail.playbook) setPlaybookDraft(draftFromPlaybook(detail.playbook));
    };

    const handleReplayRange = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const raw = Number(detail.rangeDays);
      if (Number.isFinite(raw)) {
        setReplayRangeDays(Math.max(1, Math.min(10000, Math.floor(raw))));
      }
    };

    const handlePlaybookEditor = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const watcherId = String(detail.watcherId || detail.id || '').trim();
      if (!watcherId) return;
      const watcher = (watchersRef.current || []).find((item) => item.id === watcherId);
      const toggleEditor = togglePlaybookEditorRef.current;
      if (watcher && toggleEditor) toggleEditor(watcher);
    };

    const handleApplyToBacktesterEvent = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const watcherId = String(detail.watcherId || detail.id || '').trim();
      const watcher = watcherId ? (watchersRef.current || []).find((item) => item.id === watcherId) : null;
      if (watcher) {
        const applyToBacktester = handleApplyToBacktesterRef.current;
        if (applyToBacktester) applyToBacktester(watcher);
        return;
      }
      if (detail.strategy && detail.params) {
        onApplyToBacktester?.({
          strategy: String(detail.strategy),
          params: detail.params as Record<string, any>,
          symbol: detail.symbol ? String(detail.symbol) : undefined,
          timeframe: detail.timeframe ? String(detail.timeframe) : undefined
        });
      }
    };

    const handleReplayRun = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const watcherId = String(detail.watcherId || detail.id || '').trim();
      if (!watcherId) return;
      const watcher = (watchersRef.current || []).find((item) => item.id === watcherId);
      const replayWatcher = handleReplayWatcherRef.current;
      if (watcher && replayWatcher) void replayWatcher(watcher);
    };

    const handlePlaybookSaveEventProxy = (event: any) => {
      handlePlaybookSaveEventRef.current?.(event);
    };
    const handlePlaybookResetEventProxy = (event: any) => {
      handlePlaybookResetEventRef.current?.(event);
    };
    const handlePlaybookCreateToggleProxy = (event: any) => {
      handlePlaybookCreateToggleRef.current?.(event);
    };

    window.addEventListener('glass_setups_library_filters', handleLibraryFilters as any);
    window.addEventListener('glass_setups_compare', handleCompare as any);
    window.addEventListener('glass_setups_playbook_draft', handlePlaybookDraft as any);
    window.addEventListener('glass_setups_playbook_editor', handlePlaybookEditor as any);
    window.addEventListener('glass_setups_playbook_save', handlePlaybookSaveEventProxy as any);
    window.addEventListener('glass_setups_playbook_reset', handlePlaybookResetEventProxy as any);
    window.addEventListener('glass_setups_playbook_create_toggle', handlePlaybookCreateToggleProxy as any);
    window.addEventListener('glass_setups_debug_filters', handleDebugFilters as any);
    window.addEventListener('glass_setups_create_form', handleCreateForm as any);
    window.addEventListener('glass_setups_replay_range', handleReplayRange as any);
    window.addEventListener('glass_setups_apply_backtester', handleApplyToBacktesterEvent as any);
    window.addEventListener('glass_setups_replay_run', handleReplayRun as any);
    return () => {
      window.removeEventListener('glass_setups_library_filters', handleLibraryFilters as any);
      window.removeEventListener('glass_setups_compare', handleCompare as any);
      window.removeEventListener('glass_setups_playbook_draft', handlePlaybookDraft as any);
      window.removeEventListener('glass_setups_playbook_editor', handlePlaybookEditor as any);
      window.removeEventListener('glass_setups_playbook_save', handlePlaybookSaveEventProxy as any);
      window.removeEventListener('glass_setups_playbook_reset', handlePlaybookResetEventProxy as any);
      window.removeEventListener('glass_setups_playbook_create_toggle', handlePlaybookCreateToggleProxy as any);
      window.removeEventListener('glass_setups_debug_filters', handleDebugFilters as any);
      window.removeEventListener('glass_setups_create_form', handleCreateForm as any);
      window.removeEventListener('glass_setups_replay_range', handleReplayRange as any);
      window.removeEventListener('glass_setups_apply_backtester', handleApplyToBacktesterEvent as any);
      window.removeEventListener('glass_setups_replay_run', handleReplayRun as any);
    };
  }, [
    onApplyToBacktester
  ]);

  const normalizeTransition = useCallback((raw: any): SetupSignalTransition | null => {
    if (!raw || typeof raw !== 'object') return null;
    const payload = raw.payload && typeof raw.payload === 'object' ? raw.payload : raw;
    const signalId = String(payload.signalId || raw.signalId || '').trim();
    if (!signalId) return null;
    const id = String(payload.id || raw.id || raw.key || signalId).trim();
    const symbol = String(payload.symbol || raw.symbol || '').trim();
    const timeframe = String(payload.timeframe || raw.timeframe || '').trim();
    if (!symbol || !timeframe) return null;
    const ts = Number(payload.ts || raw.updatedAtMs || raw.createdAtMs || 0);
    const fromStatus = String(payload.fromStatus || 'setup_ready').trim() || 'setup_ready';
    const toStatus = String(payload.toStatus || 'setup_ready').trim() || 'setup_ready';
    const reasonCodes = Array.isArray(payload.reasonCodes) ? payload.reasonCodes : [];
    return {
      id,
      signalId,
      profileId: payload.profileId ? String(payload.profileId) : null,
      symbol,
      timeframe,
      signalType: payload.signalType ? String(payload.signalType) : null,
      ts: Number.isFinite(ts) ? ts : 0,
      fromStatus: fromStatus as SetupSignalTransition['fromStatus'],
      toStatus: toStatus as SetupSignalTransition['toStatus'],
      reasonCodes,
      note: payload.note ? String(payload.note) : null,
      details: payload.details && typeof payload.details === 'object' ? payload.details : null
    };
  }, []);

  const loadTransitions = useCallback(async () => {
    if (!debugEnabled) return;
    const ledger = window.glass?.tradeLedger;
    if (!ledger?.listAgentMemory) {
      setTransitionError('Agent memory unavailable.');
      return;
    }
    setTransitionLoading(true);
    setTransitionError(null);
    try {
      const args: any = { limit: transitionLimit, kind: 'setup_signal_transition' };
      if (transitionSymbol) args.symbol = transitionSymbol;
      if (transitionTimeframe) args.timeframe = transitionTimeframe;
      if (transitionProfileId) args.tags = [`profile:${transitionProfileId}`];
      const res = await ledger.listAgentMemory(args);
      if (!res?.ok || !Array.isArray(res.memories)) {
        setTransitionError(res?.error ? String(res.error) : 'Failed to load transitions.');
        setTransitionEntries([]);
        return;
      }
      let entries = res.memories.map(normalizeTransition).filter(Boolean) as SetupSignalTransition[];
      if (transitionSignalId) {
        const target = String(transitionSignalId).trim();
        entries = entries.filter((entry) => entry.signalId === target);
      }
      entries.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      setTransitionEntries(entries);
    } catch (err: any) {
      setTransitionError(err?.message ? String(err.message) : 'Failed to load transitions.');
      setTransitionEntries([]);
    } finally {
      setTransitionLoading(false);
    }
  }, [debugEnabled, normalizeTransition, transitionLimit, transitionProfileId, transitionSignalId, transitionSymbol, transitionTimeframe]);

  const handleClearTransitions = useCallback(() => {
    setTransitionProfileId('');
    setTransitionSignalId('');
    setTransitionSymbol('');
    setTransitionTimeframe('');
  }, []);

  const handleExplainTransition = useCallback((entry: SetupSignalTransition) => {
    if (!onExplainSignal) return;
    onExplainSignal(entry.signalId, entry.profileId);
  }, [onExplainSignal]);

  useEffect(() => {
    if (!debugEnabled) return;
    void loadTransitions();
  }, [debugEnabled, loadTransitions]);

  const filteredLibrary = useMemo(() => {
    const sym = normalizeSymbolKey(filterSymbol);
    const tf = normalizeTimeframeKey(filterTimeframe);
    const strat = String(filterStrategy || '').trim().toUpperCase();
    const search = String(librarySearch || '').trim().toLowerCase();
    return (library || [])
      .filter((entry) => {
        if (!entry) return false;
        if (sym && normalizeSymbolKey(entry.symbol) !== sym) return false;
        if (tf && normalizeTimeframeKey(entry.timeframe) !== tf) return false;
        if (strat && String(entry.strategy).toUpperCase() !== strat) return false;
        if (search) {
          const haystack = [
            entry.symbol,
            entry.timeframe,
            entry.strategy,
            entry.tier,
            entry.winRateTier,
            entry.source,
            JSON.stringify(entry.params || {})
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(search)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.score || 0) - (a.score || 0));
  }, [filterStrategy, filterSymbol, filterTimeframe, library, librarySearch]);

  const libraryByKey = useMemo(() => {
    const map = new Map<string, SetupLibraryEntry>();
    for (const entry of library) {
      if (entry?.key) map.set(entry.key, entry);
    }
    return map;
  }, [library]);

  useEffect(() => {
    setCompareKeys((prev) => prev.filter((key) => libraryByKey.has(key)));
  }, [libraryByKey]);

  const compareEntries = useMemo(() => {
    return compareKeys.map((key) => libraryByKey.get(key)).filter(Boolean) as SetupLibraryEntry[];
  }, [compareKeys, libraryByKey]);

  const buildParamGrid = (params?: Record<string, any>) => {
    const grid: Record<string, any> = {};
    if (!params || typeof params !== 'object') return grid;
    for (const [key, value] of Object.entries(params)) {
      if (value == null) continue;
      grid[key] = Array.isArray(value) ? value : [value];
    }
    return grid;
  };

  const formatPercent = (value: any) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '--';
    return `${(num * 100).toFixed(1)}%`;
  };

  const formatRatio = (value: any) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '--';
    return num.toFixed(2);
  };

  const formatPnl = (value: any) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '--';
    return `${num >= 0 ? '+' : '-'}${Math.abs(num).toFixed(2)}`;
  };

  const formatSignedPct = (value: any) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '--';
    return `${num >= 0 ? '+' : ''}${num.toFixed(3)}%`;
  };

  const formatDeltaPct = (value: any) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '--';
    return `${num >= 0 ? '+' : ''}${(num * 100).toFixed(1)}%`;
  };

  const MAX_COMPARE = 3;

  const isCompareSelected = useCallback(
    (entry: SetupLibraryEntry) => compareKeys.includes(entry.key),
    [compareKeys]
  );

  const toggleCompareEntry = useCallback((entry: SetupLibraryEntry) => {
    if (!entry?.key) return;
    runActionOr('setups.compare.toggle', { key: entry.key, mode: 'toggle' }, () => {
      setCompareKeys((prev) => {
        if (!entry?.key) return prev;
        if (prev.includes(entry.key)) return prev.filter((key) => key !== entry.key);
        if (prev.length >= MAX_COMPARE) return prev;
        return [...prev, entry.key];
      });
    });
  }, [runActionOr]);

  const formatDelta = (value: any) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '--';
    return `${num >= 0 ? '+' : ''}${num.toFixed(2)}`;
  };

  const formatDrawdown = (value: any) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '--';
    return `-${Math.abs(num).toFixed(2)}`;
  };

  const getDriftBadge = (drift?: SetupPerformance['drift'] | null) => {
    if (!drift) return null;
    const status = drift.status || 'ok';
    const label = `DRIFT ${status.toUpperCase()}`;
    const className =
      status === 'poor'
        ? 'bg-red-500/20 text-red-200'
        : status === 'warn'
          ? 'bg-amber-500/20 text-amber-200'
          : 'bg-emerald-500/20 text-emerald-200';
    return { label, className };
  };

  const formatPf = (value: any) => {
    if (value == null) return '--';
    if (value === Infinity) return '∞';
    const num = Number(value);
    if (!Number.isFinite(num)) return '--';
    return num.toFixed(2);
  };

  const formatR = (value: any) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '--';
    return `${num.toFixed(2)}R`;
  };

  const formatRValue = (value: any) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    return num.toFixed(2).replace(/\.?0+$/, '');
  };

  const getPlaybookSummary = (playbook?: ExecutionPlaybook | null) => {
    if (!playbook || playbook.enabled === false) return '';
    const parts: string[] = [];
    const steps = Array.isArray(playbook.steps) ? playbook.steps : [];
    if (steps.length > 0) parts.push(`Steps ${steps.length}`);
    if (playbook.breakevenAtR != null && Number.isFinite(Number(playbook.breakevenAtR))) {
      parts.push(`BE@${formatRValue(playbook.breakevenAtR)}R`);
    }
    if (playbook.trail && (playbook.trail.activationR != null || playbook.trail.offsetR != null)) {
      const act = playbook.trail.activationR != null ? formatRValue(playbook.trail.activationR) : '';
      const off = playbook.trail.offsetR != null ? formatRValue(playbook.trail.offsetR) : '';
      const label = [act ? `act ${act}R` : '', off ? `off ${off}R` : ''].filter(Boolean).join(' ');
      parts.push(label ? `Trail ${label}` : 'Trail');
    }
    return parts.join(' | ');
  };

  const modePerformance = useMemo(() => {
    const entries = performanceByMode ? Object.entries(performanceByMode) : [];
    return entries
      .map(([mode, perf]) => ({ mode, perf }))
      .sort((a, b) => (b.perf.trades || 0) - (a.perf.trades || 0));
  }, [performanceByMode]);

  const symbolPerformance = useMemo(() => {
    const entries = performanceBySymbol ? Object.entries(performanceBySymbol) : [];
    return entries
      .map(([key, perf]) => ({ key, perf }))
      .sort((a, b) => (b.perf.trades || 0) - (a.perf.trades || 0));
  }, [performanceBySymbol]);

  const driftAlerts = useMemo(() => {
    const items: Array<{
      key: string;
      scope: 'watcher' | 'library';
      label: string;
      drift: SetupPerformance['drift'];
      trades: number;
    }> = [];
    for (const watcher of watchers || []) {
      const perf = performanceByWatcher?.[watcher.id];
      if (!perf?.drift || perf.drift.status === 'ok') continue;
      items.push({
        key: `watcher:${watcher.id}`,
        scope: 'watcher',
        label: `${watcher.symbol} ${watcher.timeframe} ${watcher.strategy}`,
        drift: perf.drift,
        trades: perf.trades || 0
      });
    }
    for (const entry of library || []) {
      const perf = performanceByLibrary?.[entry.key];
      if (!perf?.drift || perf.drift.status === 'ok') continue;
      items.push({
        key: `library:${entry.key}`,
        scope: 'library',
        label: `${entry.symbol} ${entry.timeframe} ${entry.strategy}`,
        drift: perf.drift,
        trades: perf.trades || 0
      });
    }
    return items.sort((a, b) => {
      const rank = (status?: string) => (status === 'poor' ? 2 : status === 'warn' ? 1 : 0);
      const diff = rank(b.drift?.status) - rank(a.drift?.status);
      if (diff !== 0) return diff;
      return (b.trades || 0) - (a.trades || 0);
    });
  }, [library, performanceByLibrary, performanceByWatcher, watchers]);

  const appendAuditEvent = async (event: {
    eventType: string;
    level?: 'info' | 'warn' | 'error';
    symbol?: string | null;
    runId?: string | null;
    payload?: Record<string, any> | null;
  }) => {
    const ledger = (window as any)?.glass?.tradeLedger;
    if (!ledger?.append) return;
    const entry = {
      kind: 'audit_event',
      schemaVersion: 'audit_v1',
      eventType: String(event.eventType || '').trim(),
      level: event.level || 'info',
      symbol: event.symbol || null,
      runId: event.runId || null,
      payload: event.payload || null,
      source: 'setups'
    };
    try {
      await ledger.append(entry);
    } catch {
      // ignore audit failures
    }
  };

  const handleReplayWatcher = async (watcher: SetupWatcher) => {
    const id = watcher.id;
    setReplayBusyById((prev) => ({ ...prev, [id]: true }));
    setReplayErrorById((prev) => ({ ...prev, [id]: '' }));
    void appendAuditEvent({
      eventType: 'setup_replay_start',
      symbol: watcher.symbol || null,
      payload: {
        watcherId: watcher.id,
        strategy: watcher.strategy,
        timeframe: watcher.timeframe,
        rangeDays: replayRangeDays,
        params: watcher.params || {}
      }
    });
    try {
      const res = await runBacktestOptimization({
        symbol: watcher.symbol,
        timeframe: watcher.timeframe,
        strategy: watcher.strategy,
        rangeDays: replayRangeDays,
        maxCombos: 1,
        paramGrid: buildParamGrid(watcher.params || {})
      });
      if (!res?.ok) {
        setReplayErrorById((prev) => ({ ...prev, [id]: res?.error ? String(res.error) : 'Replay failed.' }));
        void appendAuditEvent({
          eventType: 'setup_replay_failed',
          level: 'warn',
          symbol: watcher.symbol || null,
          runId: res?.runId || null,
          payload: {
            watcherId: watcher.id,
            strategy: watcher.strategy,
            timeframe: watcher.timeframe,
            error: res?.error ? String(res.error) : 'Replay failed.'
          }
        });
        return;
      }
      setReplayResultById((prev) => ({ ...prev, [id]: res }));
      void appendAuditEvent({
        eventType: 'setup_replay_ok',
        symbol: watcher.symbol || null,
        runId: res?.runId || null,
        payload: {
          watcherId: watcher.id,
          strategy: watcher.strategy,
          timeframe: watcher.timeframe,
          rangeDays: res.rangeDays,
          bars: res.bars,
          combosTested: res.combosTested,
          best: res.bestConfig
            ? {
              params: res.bestConfig.params,
              stats: res.bestConfig.stats,
              performance: res.bestConfig.performance
            }
            : null,
          summary: res.summary || null
        }
      });
    } catch (err: any) {
      setReplayErrorById((prev) => ({ ...prev, [id]: err?.message ? String(err.message) : 'Replay failed.' }));
      void appendAuditEvent({
        eventType: 'setup_replay_failed',
        level: 'error',
        symbol: watcher.symbol || null,
        payload: {
          watcherId: watcher.id,
          strategy: watcher.strategy,
          timeframe: watcher.timeframe,
          error: err?.message ? String(err.message) : 'Replay failed.'
        }
      });
    } finally {
      setReplayBusyById((prev) => ({ ...prev, [id]: false }));
    }
  };
  handleReplayWatcherRef.current = handleReplayWatcher;

  const togglePlaybookEditor = (watcher: SetupWatcher) => {
    const id = watcher.id;
    setPlaybookEditOpenById((prev) => {
      const nextOpen = !prev[id];
      return { ...prev, [id]: nextOpen };
    });
    setPlaybookEditDraftById((prev) => {
      if (prev[id]) return prev;
      return { ...prev, [id]: draftFromPlaybook(watcher.playbook) };
    });
    setPlaybookEditErrorById((prev) => ({ ...prev, [id]: '' }));
  };
  togglePlaybookEditorRef.current = togglePlaybookEditor;

  const handleSavePlaybook = (watcher: SetupWatcher) => {
    const id = watcher.id;
    const draft = playbookEditDraftById[id] || draftFromPlaybook(watcher.playbook);
    const playbook = buildPlaybookFromDraft(draft);
    if (draft.enabled && !playbook) {
      setPlaybookEditErrorById((prev) => ({ ...prev, [id]: 'Playbook enabled but missing valid steps or rules.' }));
      return;
    }
    onUpdateWatcher?.(id, { playbook });
    setPlaybookEditErrorById((prev) => ({ ...prev, [id]: '' }));
    setPlaybookEditOpenById((prev) => ({ ...prev, [id]: false }));
  };

  const handleResetPlaybook = (watcher: SetupWatcher) => {
    const id = watcher.id;
    setPlaybookEditDraftById((prev) => ({ ...prev, [id]: draftFromPlaybook(watcher.playbook) }));
    setPlaybookEditErrorById((prev) => ({ ...prev, [id]: '' }));
  };

  const handlePlaybookSaveEvent = useCallback((event: any) => {
    const detail = event?.detail;
    if (!detail || typeof detail !== 'object') return;
    const watcherId = String(detail.watcherId || detail.id || '').trim();
    if (!watcherId) return;
    const watcher = watchers.find((entry) => entry.id === watcherId);
    if (!watcher) return;
    if (detail.playbook && typeof detail.playbook === 'object') {
      onUpdateWatcher?.(watcherId, { playbook: detail.playbook });
      setPlaybookEditErrorById((prev) => ({ ...prev, [watcherId]: '' }));
      setPlaybookEditOpenById((prev) => ({ ...prev, [watcherId]: false }));
      return;
    }
    handleSavePlaybook(watcher);
  }, [handleSavePlaybook, onUpdateWatcher, watchers]);
  handlePlaybookSaveEventRef.current = handlePlaybookSaveEvent;

  const handlePlaybookResetEvent = useCallback((event: any) => {
    const detail = event?.detail;
    if (!detail || typeof detail !== 'object') return;
    const watcherId = String(detail.watcherId || detail.id || '').trim();
    if (!watcherId) return;
    const watcher = watchers.find((entry) => entry.id === watcherId);
    if (!watcher) return;
    handleResetPlaybook(watcher);
  }, [handleResetPlaybook, watchers]);
  handlePlaybookResetEventRef.current = handlePlaybookResetEvent;

  const handlePlaybookCreateToggle = useCallback((event: any) => {
    const detail = event?.detail;
    if (!detail || typeof detail !== 'object') {
      setPlaybookCreateOpen((prev) => !prev);
      return;
    }
    if (typeof detail.open === 'boolean') {
      setPlaybookCreateOpen(detail.open);
    } else {
      setPlaybookCreateOpen((prev) => !prev);
    }
    if (detail.reset) setPlaybookDraft({ ...emptyPlaybookDraft });
  }, []);
  handlePlaybookCreateToggleRef.current = handlePlaybookCreateToggle;

  const handleCreateWatcher = () => {
    setCreateError(null);
    setCreateStatus(null);
    const symbol = String(symbolInput || '').trim();
    const timeframe = String(timeframeInput || '').trim();
    if (!symbol || !timeframe) {
      setCreateError('Symbol and timeframe are required.');
      return;
    }
    let params: Record<string, any> | undefined;
    if (paramsInput.trim()) {
      try {
        const parsed = JSON.parse(paramsInput);
        if (parsed && typeof parsed === 'object') params = parsed;
      } catch {
        setCreateError('Params must be valid JSON.');
        return;
      }
    }
    const playbook = buildPlaybookFromDraft(playbookDraft);
    if (playbookDraft.enabled && !playbook) {
      setCreateError('Playbook enabled but missing valid steps or rules.');
      return;
    }
    const regime = regimeInput === 'default' ? undefined : regimeInput;
    const created = onCreateWatcher?.({
      symbol,
      timeframe,
      strategy: strategyInput,
      params,
      playbook,
      mode: modeInput,
      enabled: enabledInput,
      regime
    });
    setCreateStatus(created ? `Watcher ${created.id} created.` : 'Watcher created.');
    setSymbolInput('');
    setParamsInput('');
    setPlaybookDraft({ ...emptyPlaybookDraft });
    setPlaybookCreateOpen(false);
  };

  const handleCreateFromLibrary = (entry: SetupLibraryEntry) => {
    if (!entry) return;
    const created = onCreateWatcher?.({
      symbol: entry.symbol,
      timeframe: entry.timeframe,
      strategy: entry.strategy,
      params: entry.params || {},
      mode: modeInput,
      enabled: true,
      library: entry,
      regime: regimeInput === 'default' ? undefined : regimeInput
    });
    setCreateStatus(created ? `Watcher ${created.id} created.` : 'Watcher created.');
  };

  const handleToggleWatcher = (watcher: SetupWatcher) => {
    onUpdateWatcher?.(watcher.id, { enabled: !watcher.enabled });
  };

  const handleModeChange = (watcher: SetupWatcher, mode: SetupWatcher['mode']) => {
    onUpdateWatcher?.(watcher.id, { mode });
  };

  const handleRegimeChange = (watcher: SetupWatcher, regime: SetupWatcher['regime']) => {
    onUpdateWatcher?.(watcher.id, { regime });
  };

  const handleApplyToBacktester = (watcher: SetupWatcher) => {
    onApplyToBacktester?.({
      strategy: watcher.strategy,
      params: watcher.params || {},
      symbol: watcher.symbol,
      timeframe: watcher.timeframe
    });
  };
  handleApplyToBacktesterRef.current = handleApplyToBacktester;

  return (
    <div className="flex flex-col h-full w-full text-gray-200 bg-[#050505] overflow-hidden min-h-0">
      <div className="px-4 py-4 border-b border-white/5 bg-gradient-to-r from-teal-900/20 to-black">
        <div className="flex items-center gap-2 text-teal-300 text-xs uppercase tracking-wider font-bold">
          <Layers size={14} />
          <span>Setups</span>
          <span
            className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-mono ${
              isConnected ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'
            }`}
          >
            {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
          <button
            type="button"
            onClick={onClearSignals}
            className="ml-auto px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/5 text-[11px]"
          >
            <span className="inline-flex items-center gap-1">
              <RefreshCw size={12} />
              Clear Signals
            </span>
          </button>
        </div>
        {crossPanelContext?.symbol ? (
          <div className="mt-1 text-[10px] text-gray-500">
            Context: {crossPanelContext.symbol}{crossPanelContext.timeframe ? ` ${String(crossPanelContext.timeframe).toUpperCase()}` : ''}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 min-h-0">
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-3">
          <div className="text-xs uppercase tracking-wider text-gray-400">Create Watcher</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="flex flex-col gap-1">
              Symbol
              <input
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                placeholder="XAUUSD"
              />
            </label>
            <label className="flex flex-col gap-1">
              Timeframe
              <input
                value={timeframeInput}
                onChange={(e) => setTimeframeInput(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                placeholder="15m"
              />
            </label>
            <label className="flex flex-col gap-1">
              Strategy
              <select
                value={strategyInput}
                onChange={(e) => setStrategyInput(e.target.value as SetupWatcher['strategy'])}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
              >
                {STRATEGIES.map((strategy) => (
                  <option key={strategy} value={strategy}>
                    {strategy.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Mode
              <select
                value={modeInput}
                onChange={(e) => setModeInput(e.target.value as SetupWatcher['mode'])}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
              >
                {MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Regime Gate
              <select
                value={regimeInput}
                onChange={(e) => setRegimeInput(e.target.value as 'default' | SetupWatcher['regime'])}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
              >
                {REGIME_CREATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={enabledInput}
              onChange={(e) => setEnabledInput(e.target.checked)}
            />
            Enabled
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Params (JSON)
            <textarea
              value={paramsInput}
              onChange={(e) => setParamsInput(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100 min-h-[64px]"
              placeholder='{"atrMult":1.5,"rr":2}'
            />
          </label>
          <div className="rounded-lg border border-white/10 bg-black/20 p-2 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-gray-400">Playbook</div>
              <button
                type="button"
                onClick={() => runActionOr('setups.playbook.create.toggle', { open: !playbookCreateOpen }, () => setPlaybookCreateOpen((prev) => !prev))}
                className="px-2 py-1 rounded-md text-[10px] bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10"
              >
                {playbookCreateOpen ? 'Hide' : 'Edit'}
              </button>
            </div>
            {playbookDraft.enabled && (
              <div className="text-[11px] text-gray-500">
                {getPlaybookSummary(buildPlaybookFromDraft(playbookDraft)) || 'Playbook enabled (incomplete).'}
              </div>
            )}
            {playbookCreateOpen && (
              <PlaybookEditor draft={playbookDraft} onChange={setPlaybookDraft} />
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCreateWatcher}
              className="px-3 py-1.5 rounded-md text-xs bg-teal-500/80 hover:bg-teal-500 text-white flex items-center gap-1"
            >
              <Plus size={14} /> Add Watcher
            </button>
            {createError && <span className="text-[11px] text-red-300">{createError}</span>}
            {createStatus && <span className="text-[11px] text-emerald-300">{createStatus}</span>}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-gray-400">Active Watchers</div>
            <div className="text-[10px] text-gray-500">{filteredWatchers.length} shown</div>
          </div>
          <div className="text-[10px] text-gray-500">
            Signals update when the Native Chart is streaming the same symbol/timeframe.
          </div>
          {performanceError ? (
            <div className="text-[10px] text-red-300">
              Live performance unavailable: {performanceError}
            </div>
          ) : performanceUpdatedAtMs ? (
            <div className="text-[10px] text-gray-500">
              Live performance updated {formatAge(performanceUpdatedAtMs)} ago.
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
            <span>Replay range</span>
            <input
              type="number"
              min={7}
              max={10000}
              value={String(replayRangeDays)}
              onChange={(e) => setReplayRangeDays(Number(e.target.value || 0))}
              className="w-20 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            />
            <span>days</span>
            <span className="text-gray-500">Uses broker history to replay the watcher params.</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <label className="flex flex-col gap-1">
              Filter Symbol
              <input
                value={filterSymbol}
                onChange={(e) => setFilterSymbol(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
              />
            </label>
            <label className="flex flex-col gap-1">
              Filter Timeframe
              <input
                value={filterTimeframe}
                onChange={(e) => setFilterTimeframe(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
              />
            </label>
            <label className="flex flex-col gap-1">
              Filter Strategy
              <input
                value={filterStrategy}
                onChange={(e) => setFilterStrategy(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
              />
            </label>
          </div>
          <div className="space-y-2">
            {filteredWatchers.length === 0 ? (
              <div className="text-[11px] text-gray-500">No watchers match the filters.</div>
            ) : (
              filteredWatchers.map((watcher) => {
                const replay = replayResultById[watcher.id];
                const replayError = replayErrorById[watcher.id];
                const replayBusy = Boolean(replayBusyById[watcher.id]);
                const best = replay?.bestConfig;
                const stats = best?.stats;
                const performance = best?.performance;
                const livePerf = performanceByWatcher?.[watcher.id];
                const drift = livePerf?.drift || null;
                const driftBadge = getDriftBadge(drift);
                const playbook = watcher.playbook;
                const playbookEnabled = !!playbook && playbook.enabled !== false;
                const playbookStatus = playbookStatusByWatcher?.[watcher.id];
                const stepsTotal = playbookEnabled && Array.isArray(playbook?.steps) ? playbook.steps.length : 0;
                const stepsDone = Number(playbookStatus?.stepsDone || 0);
                const playbookBadge = playbookEnabled
                  ? (stepsTotal > 0 ? `PB ${stepsDone}/${stepsTotal}` : 'PB')
                  : '';
                const beConfigured = playbookEnabled && playbook?.breakevenAtR != null;
                const trailConfigured = playbookEnabled && playbook?.trail != null;
                const beLabel = beConfigured
                  ? (playbookStatus?.breakevenDone ? 'BE' : `BE@${formatRValue(playbook?.breakevenAtR)}R`)
                  : '';
                const trailLabel = trailConfigured
                  ? (playbookStatus?.trailActive ? 'TRAIL' : `TRL@${formatRValue(playbook?.trail?.activationR ?? 1)}R`)
                  : '';
                const playbookSummary = playbookEnabled ? getPlaybookSummary(playbook) : '';
                const editOpen = !!playbookEditOpenById[watcher.id];
                const editDraft = playbookEditDraftById[watcher.id] || draftFromPlaybook(watcher.playbook);
                const editError = playbookEditErrorById[watcher.id];
                const regimeKey = buildRegimeKey(watcher.symbol, watcher.timeframe);
                const regimeState = regimeKey && regimes ? regimes[regimeKey] : null;
                const regimeLabel = regimeState?.label || '';
                const regimeBlock = regimeBlocks?.[watcher.id];
                const regimeBlocked = regimeBlock?.blocked;
                const regimeBlockedLabel = regimeBlocked
                  ? `Blocked (Regime: ${regimeBlock?.currentRegimeKey || 'n/a'})`
                  : '';
                const gateLabel = watcher.regime || 'any';
                const driftLabel = drift
                  ? [
                      `Drift ${drift.status.toUpperCase()}`,
                      drift.winRateDelta != null ? `WR ${formatDeltaPct(drift.winRateDelta)}` : '',
                      drift.profitFactorDelta != null ? `PF ${formatDelta(drift.profitFactorDelta)}` : ''
                    ].filter(Boolean).join(' ')
                  : '';
                const ddLabel =
                  livePerf?.maxDrawdown != null && Number.isFinite(Number(livePerf.maxDrawdown))
                    ? `DD ${formatDrawdown(livePerf.maxDrawdown)}`
                    : '';
                const slipPctLabel =
                  livePerf?.slippagePctAvg != null && Number.isFinite(Number(livePerf.slippagePctAvg))
                    ? formatSignedPct(livePerf.slippagePctAvg)
                    : '';
                const slipLabel =
                  livePerf?.slippageAvg != null && Number.isFinite(Number(livePerf.slippageAvg))
                    ? `Slip ${formatPnl(livePerf.slippageAvg)}${slipPctLabel ? ` ${slipPctLabel}` : ''}`
                    : '';
                return (
                  <div key={watcher.id} className="border border-white/10 rounded-lg p-2 text-[11px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-teal-200 font-semibold">{watcher.symbol}</span>
                      <span className="text-gray-400">{watcher.timeframe}</span>
                      <span className="text-gray-400">{watcher.strategy}</span>
                      {regimeLabel && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200">
                          regime {regimeLabel}
                        </span>
                      )}
                      {driftBadge && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${driftBadge.className}`}>
                          {driftBadge.label}
                        </span>
                      )}
                      {playbookBadge && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-200">
                          {playbookBadge}
                        </span>
                      )}
                      {beLabel && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-200">
                          {beLabel}
                        </span>
                      )}
                      {trailLabel && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-200">
                          {trailLabel}
                        </span>
                      )}
                      {regimeBlocked && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-200">
                          {regimeBlockedLabel}
                        </span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${watcher.enabled ? 'bg-green-500/15 text-green-300' : 'bg-white/5 text-gray-400'}`}>
                        {watcher.enabled ? 'ON' : 'OFF'}
                      </span>
                      <span className="text-gray-500">gate {gateLabel}</span>
                      <span className="text-gray-500">{watcher.mode}</span>
                      <span className="text-gray-500">{watcher.lastSignalType ? `last ${watcher.lastSignalType}` : 'no signal'}</span>
                      <span className="text-gray-500">{formatAge(watcher.updatedAtMs || watcher.createdAtMs)} ago</span>
                    </div>
                    {livePerf && (
                      <div className="mt-1 text-[11px] text-gray-500">
                        {[
                          `Live ${livePerf.trades} trades`,
                          `WR ${formatPercent(livePerf.winRate)}`,
                          `PnL ${formatPnl(livePerf.netPnl)}`,
                          `PF ${formatPf(livePerf.profitFactor)}`,
                          ddLabel,
                          slipLabel,
                          driftLabel,
                          livePerf.lastClosedAtMs ? `last ${formatAge(livePerf.lastClosedAtMs)} ago` : ''
                        ].filter(Boolean).join(' | ')}
                      </div>
                    )}
                    {playbookSummary && (
                      <div className="mt-1 text-[11px] text-gray-500">
                        Playbook: {playbookSummary}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleWatcher(watcher)}
                        className="px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
                      >
                        {watcher.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <select
                        value={watcher.mode}
                        onChange={(e) => handleModeChange(watcher, e.target.value as SetupWatcher['mode'])}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-100"
                      >
                        {MODES.map((mode) => (
                          <option key={mode} value={mode}>
                            {mode}
                          </option>
                        ))}
                      </select>
                      <select
                        value={watcher.regime || 'any'}
                        onChange={(e) => handleRegimeChange(watcher, e.target.value as SetupWatcher['regime'])}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-100"
                      >
                        {REGIME_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => onFocusChart?.(watcher.symbol, watcher.timeframe)}
                        className="px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
                      >
                        To Chart
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyToBacktester(watcher)}
                        className="px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
                      >
                        To Backtester
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveWatcher?.(watcher.id)}
                        className="px-2 py-1 rounded-md text-[10px] bg-red-500/10 hover:bg-red-500/20 text-red-200 inline-flex items-center gap-1"
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReplayWatcher(watcher)}
                        disabled={replayBusy}
                        className="px-2 py-1 rounded-md text-[10px] bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-200 inline-flex items-center gap-1 disabled:opacity-60"
                      >
                        <Play size={12} />
                        {replayBusy ? 'Replaying...' : 'Replay'}
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePlaybookEditor(watcher)}
                        className="px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
                      >
                        {editOpen ? 'Hide Playbook' : 'Edit Playbook'}
                      </button>
                    </div>
                    {editOpen && (
                      <div className="mt-2 space-y-2">
                        <PlaybookEditor
                          draft={editDraft}
                          onChange={(next) => setPlaybookEditDraftById((prev) => ({ ...prev, [watcher.id]: next }))}
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSavePlaybook(watcher)}
                            className="px-3 py-1.5 rounded-md text-[10px] bg-teal-500/80 hover:bg-teal-500 text-white"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResetPlaybook(watcher)}
                            className="px-3 py-1.5 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
                          >
                            Reset
                          </button>
                          {editError && <span className="text-[11px] text-red-300">{editError}</span>}
                        </div>
                      </div>
                    )}
                    {replayError && (
                      <div className="mt-2 text-[11px] text-red-300">
                        Replay failed: {replayError}
                      </div>
                    )}
                    {replay?.ok && best && (
                      <div className="mt-2 text-[11px] text-gray-400 grid grid-cols-2 gap-2">
                        <div>Trades: {stats?.total ?? '--'}</div>
                        <div>Win rate: {formatPercent(stats?.winRate)}</div>
                        <div>Expectancy: {formatR(stats?.expectancy)}</div>
                        <div>Profit factor: {formatRatio(stats?.profitFactor)}</div>
                        <div>Net R: {formatR(performance?.netR)}</div>
                        <div>Max DD: {formatR(performance?.maxDrawdown)}</div>
                      </div>
                    )}
                    {replay?.ok && replay?.summary && (
                      <div className="mt-2 text-[11px] text-gray-500">
                        {replay.summary}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {performanceSummary && (
          <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-gray-400">Overall Performance</div>
              <div className="text-[10px] text-gray-500">Reconciled trades</div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
              <span className="text-emerald-200 font-semibold">Trades {performanceSummary.trades}</span>
              <span>WR {formatPercent(performanceSummary.winRate)}</span>
              <span>PF {formatPf(performanceSummary.profitFactor)}</span>
              <span>PnL {formatPnl(performanceSummary.netPnl)}</span>
              {performanceSummary.maxDrawdown != null && (
                <span>DD {formatDrawdown(performanceSummary.maxDrawdown)}</span>
              )}
              {performanceSummary.slippageAvg != null && (
                <span>
                  Slip {formatPnl(performanceSummary.slippageAvg)}
                  {performanceSummary.slippagePctAvg != null ? ` ${formatSignedPct(performanceSummary.slippagePctAvg)}` : ''}
                </span>
              )}
            </div>
          </div>
        )}

        {driftAlerts.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-gray-400">Performance Alerts</div>
              <div className="text-[10px] text-gray-500">{driftAlerts.length} flagged</div>
            </div>
            <div className="space-y-2">
              {driftAlerts.slice(0, 6).map((alert) => {
                const badge = getDriftBadge(alert.drift);
                return (
                  <div key={alert.key} className="border border-white/10 rounded-lg p-2 text-[11px] flex flex-wrap items-center gap-2">
                    {badge && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${badge.className}`}>
                        {badge.label}
                      </span>
                    )}
                    <span className="text-gray-300">{alert.label}</span>
                    <span className="text-gray-500">Trades {alert.trades}</span>
                    {alert.drift?.winRateDelta != null && (
                      <span className="text-gray-500">WR {formatDeltaPct(alert.drift.winRateDelta)}</span>
                    )}
                    {alert.drift?.profitFactorDelta != null && (
                      <span className="text-gray-500">PF {formatDelta(alert.drift.profitFactorDelta)}</span>
                    )}
                    <span className="text-[10px] text-gray-500 uppercase">{alert.scope}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {modePerformance.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-gray-400">Mode Performance</div>
              <div className="text-[10px] text-gray-500">{modePerformance.length} modes</div>
            </div>
            <div className="space-y-2">
              {modePerformance.slice(0, 6).map(({ mode, perf }) => (
                <div key={mode} className="border border-white/10 rounded-lg p-2 text-[11px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-emerald-200 font-semibold">{mode}</span>
                    <span className="text-gray-500">Trades {perf.trades}</span>
                    <span className="text-gray-500">WR {formatPercent(perf.winRate)}</span>
                    <span className="text-gray-500">PnL {formatPnl(perf.netPnl)}</span>
                    <span className="text-gray-500">PF {formatPf(perf.profitFactor)}</span>
                    {perf.maxDrawdown != null && (
                      <span className="text-gray-500">DD {formatDrawdown(perf.maxDrawdown)}</span>
                    )}
                    {perf.slippageAvg != null && (
                      <span className="text-gray-500">
                        Slip {formatPnl(perf.slippageAvg)}
                        {perf.slippagePctAvg != null ? ` ${formatSignedPct(perf.slippagePctAvg)}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {symbolPerformance.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-gray-400">Symbol Performance</div>
              <div className="text-[10px] text-gray-500">{symbolPerformance.length} symbols</div>
            </div>
            <div className="space-y-2">
              {symbolPerformance.slice(0, 6).map(({ key, perf }) => {
                const [symbol, tf] = String(key || '').split(':');
                return (
                  <div key={key} className="border border-white/10 rounded-lg p-2 text-[11px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-teal-200 font-semibold">{symbol || perf.symbol}</span>
                      <span className="text-gray-400">{tf || perf.timeframe || ''}</span>
                      <span className="text-gray-500">Trades {perf.trades}</span>
                      <span className="text-gray-500">WR {formatPercent(perf.winRate)}</span>
                      <span className="text-gray-500">PnL {formatPnl(perf.netPnl)}</span>
                      <span className="text-gray-500">PF {formatPf(perf.profitFactor)}</span>
                      {perf.maxDrawdown != null && (
                        <span className="text-gray-500">DD {formatDrawdown(perf.maxDrawdown)}</span>
                      )}
                      {perf.slippageAvg != null && (
                        <span className="text-gray-500">
                          Slip {formatPnl(perf.slippageAvg)}
                          {perf.slippagePctAvg != null ? ` ${formatSignedPct(perf.slippagePctAvg)}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-gray-400">Setup Library</div>
            <div className="text-[10px] text-gray-500">{filteredLibrary.length} shown</div>
          </div>
          <div className="text-[10px] text-gray-500">
            Tiered best configs saved from backtest optimization runs.
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
            <input
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              className="flex-1 min-w-[180px] bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
              placeholder="Search library (symbol, params, tier...)"
            />
            <span>Max compare {MAX_COMPARE}</span>
            {compareKeys.length > 0 && (
              <button
                type="button"
                onClick={() => runActionOr('setups.compare.toggle', { clear: true }, () => setCompareKeys([]))}
                className="px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
              >
                Clear compare
              </button>
            )}
          </div>
          {compareEntries.length > 1 && (
            <div className="rounded-lg border border-white/10 bg-black/40 p-2 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-gray-400">Compare</div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {compareEntries.map((entry) => {
                  const stats = entry.stats || {};
                  const perf = entry.performance || {};
                  const livePerf = performanceByLibrary?.[entry.key];
                  const evidence = entry.evidence || buildEvidenceCardFromLibraryEntry(entry);
                  const evidenceLine = evidence
                    ? [
                        evidence.bias ? `Bias ${evidence.bias}` : '',
                        evidence.setup ? `Setup ${evidence.setup}` : '',
                        evidence.invalidation ? `Inv ${evidence.invalidation}` : '',
                        evidence.confidence?.score != null
                          ? `Conf ${Math.round(Number(evidence.confidence.score) * 100)}%`
                          : ''
                      ].filter(Boolean).join(' | ')
                    : '';
                  return (
                    <div key={entry.key} className="border border-white/10 rounded-lg p-2 text-[11px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-emerald-200 font-semibold">{entry.symbol}</span>
                        <span className="text-gray-400">{entry.timeframe}</span>
                        <span className="text-gray-400">{entry.strategy}</span>
                        <span className="text-gray-500">Score {entry.score}</span>
                      </div>
                      <div className="mt-1 text-gray-500">
                        Trades {stats.total ?? '--'} | WR {formatPercent(stats.winRate)} | PF {formatRatio(stats.profitFactor)} | Net {formatR(perf.netR)}
                      </div>
                      {evidenceLine && (
                        <div className="mt-1 text-gray-500">
                          {evidenceLine}
                        </div>
                      )}
                      {livePerf && (
                        <div className="mt-1 text-gray-500">
                          Live {livePerf.trades} | WR {formatPercent(livePerf.winRate)} | PnL {formatPnl(livePerf.netPnl)} | PF {formatPf(livePerf.profitFactor)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="space-y-2">
            {filteredLibrary.length === 0 ? (
              <div className="text-[11px] text-gray-500">No library entries match the filters.</div>
            ) : (
              filteredLibrary.map((entry) => {
                const stats = entry.stats || {};
                const perf = entry.performance || {};
                const livePerf = performanceByLibrary?.[entry.key];
                const drift = livePerf?.drift || null;
                const driftBadge = getDriftBadge(drift);
                const driftLabel = drift
                  ? [
                      `Drift ${drift.status.toUpperCase()}`,
                      drift.winRateDelta != null ? `WR ${formatDeltaPct(drift.winRateDelta)}` : '',
                      drift.profitFactorDelta != null ? `PF ${formatDelta(drift.profitFactorDelta)}` : ''
                    ].filter(Boolean).join(' ')
                  : '';
                const ddLabel =
                  livePerf?.maxDrawdown != null && Number.isFinite(Number(livePerf.maxDrawdown))
                    ? `DD ${formatDrawdown(livePerf.maxDrawdown)}`
                    : '';
                const slipPctLabel =
                  livePerf?.slippagePctAvg != null && Number.isFinite(Number(livePerf.slippagePctAvg))
                    ? formatSignedPct(livePerf.slippagePctAvg)
                    : '';
                const slipLabel =
                  livePerf?.slippageAvg != null && Number.isFinite(Number(livePerf.slippageAvg))
                    ? `Slip ${formatPnl(livePerf.slippageAvg)}${slipPctLabel ? ` ${slipPctLabel}` : ''}`
                    : '';
                const evidence = entry.evidence || buildEvidenceCardFromLibraryEntry(entry);
                const evidenceLine = evidence
                  ? [
                      evidence.bias ? `Bias ${evidence.bias}` : '',
                      evidence.setup ? `Setup ${evidence.setup}` : '',
                      evidence.invalidation ? `Inv ${evidence.invalidation}` : '',
                      evidence.confidence?.score != null
                        ? `Conf ${Math.round(Number(evidence.confidence.score) * 100)}%`
                        : ''
                    ].filter(Boolean).join(' | ')
                  : '';
                const compareSelected = isCompareSelected(entry);
                return (
                  <div key={entry.key} className="border border-white/10 rounded-lg p-2 text-[11px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-emerald-200 font-semibold">{entry.tier}</span>
                      <span className="text-gray-400">{entry.winRateTier}</span>
                      {driftBadge && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${driftBadge.className}`}>
                          {driftBadge.label}
                        </span>
                      )}
                      <span className="text-gray-300">{entry.symbol}</span>
                      <span className="text-gray-400">{entry.timeframe}</span>
                      <span className="text-gray-400">{entry.strategy}</span>
                      <span className="text-gray-500">Score {entry.score}</span>
                    </div>
                    <div className="mt-1 text-gray-500">
                      Trades {stats.total ?? '--'} | WR {formatPercent(stats.winRate)} | PF {formatRatio(stats.profitFactor)} | Net {formatR(perf.netR)}
                    </div>
                    {evidenceLine && (
                      <div className="mt-1 text-gray-500">
                        {evidenceLine}
                      </div>
                    )}
                    {livePerf && (
                      <div className="mt-1 text-gray-500">
                        {[
                          `Live ${livePerf.trades} trades`,
                          `WR ${formatPercent(livePerf.winRate)}`,
                          `PnL ${formatPnl(livePerf.netPnl)}`,
                          `PF ${formatPf(livePerf.profitFactor)}`,
                          ddLabel,
                          slipLabel,
                          driftLabel
                        ].filter(Boolean).join(' | ')}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCreateFromLibrary(entry)}
                        className="px-2 py-1 rounded-md text-[10px] bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-200"
                      >
                        Add Watcher
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCompareEntry(entry)}
                        className={`px-2 py-1 rounded-md text-[10px] ${compareSelected ? 'bg-emerald-500/30 text-emerald-200' : 'bg-white/10 hover:bg-white/20 text-gray-200'}`}
                      >
                        {compareSelected ? 'Selected' : 'Compare'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onFocusChart?.(entry.symbol, entry.timeframe)}
                        className="px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
                      >
                        To Chart
                      </button>
                      <button
                        type="button"
                        onClick={() => onApplyToBacktester?.({
                          strategy: entry.strategy,
                          params: entry.params || {},
                          symbol: entry.symbol,
                          timeframe: entry.timeframe
                        })}
                        className="px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
                      >
                        To Backtester
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-gray-400">Recent Signals</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => runActionOr('setups.filters.set', { readyOnly: !filterReadyOnly }, () => setFilterReadyOnly((prev) => !prev))}
                className={`px-2 py-1 rounded border text-[10px] ${
                  filterReadyOnly ? 'border-emerald-400/40 text-emerald-200' : 'border-white/10 text-gray-400 hover:text-gray-200'
                }`}
              >
                Ready/Confirmed
              </button>
              <div className="text-[10px] text-gray-500">{filteredSignals.length} total</div>
            </div>
          </div>
          <div className="space-y-2 pr-2">
            {filteredSignals.length === 0 ? (
              <div className="text-[11px] text-gray-500">No signals yet for the current filters.</div>
            ) : (
              filteredSignals.slice(0, 50).map((signal) => (
                <div key={signal.id} className="border border-white/10 rounded-lg p-2 text-[11px]">
                  <div className="flex flex-wrap items-center gap-2">
                    {(() => {
                      const status = resolveSignalStatus(signal);
                      return (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] ${getSignalStatusClass(status)}`}>
                          {formatSignalStatus(status)}
                        </span>
                      );
                    })()}
                    <span className="text-gray-400">{signal.payload?.side || '--'}</span>
                    <span className="text-gray-300">{signal.symbol}</span>
                    <span className="text-gray-400">{signal.timeframe}</span>
                    <span className="text-gray-400">{signal.payload?.strategy || '--'}</span>
                    <span className="text-gray-500">
                      {Number.isFinite(Number(signal.strength)) ? `${Math.round(Number(signal.strength) * 100)}%` : '--'}
                    </span>
                    <span className="text-gray-500">{formatAge(signal.ts)} ago</span>
                  </div>
                  <div className="mt-1 text-gray-500">
                    Entry {formatPrice(signal.payload?.details?.entryPrice)} | SL {formatPrice(signal.payload?.details?.stopLoss)} | TP {formatPrice(signal.payload?.details?.takeProfit)}
                  </div>
                  {(() => {
                    const evidence =
                      signal.payload?.evidence ||
                      buildEvidenceCardFromSignal({
                        strategy: signal.payload?.strategy,
                        signalType: signal.payload?.signalType,
                        side: signal.payload?.side || null,
                        details: signal.payload?.details || null,
                        reasonCodes: signal.reasonCodes || [],
                        strength: signal.strength,
                        regime: signal.payload?.details?.regime ? String(signal.payload.details.regime) : null,
                        createdAtMs: signal.ts || Date.now()
                      });
                    if (!evidence) return null;
                    const lines = [
                      evidence.bias ? `Bias ${evidence.bias}` : '',
                      evidence.setup ? `Setup ${evidence.setup}` : '',
                      evidence.invalidation ? `Inv ${evidence.invalidation}` : '',
                      evidence.confidence?.score != null
                        ? `Conf ${Math.round(Number(evidence.confidence.score) * 100)}%`
                        : ''
                    ].filter(Boolean);
                    if (lines.length === 0) return null;
                    return (
                      <div className="mt-1 text-gray-500">
                        {lines.join(' | ')}
                      </div>
                    );
                  })()}
                </div>
              ))
            )}
          </div>
        </div>
        {debugEnabled && (
          <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-gray-400">Lifecycle Replay (debug)</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClearTransitions}
                  className="px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDebugEnabled(isSetupSignalDebugEnabled());
                    void loadTransitions();
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
                >
                  <RefreshCw size={12} />
                  Refresh
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] text-gray-400">
              <input
                value={transitionProfileId}
                onChange={(e) => setTransitionProfileId(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                placeholder="Profile ID (optional)"
              />
              <input
                value={transitionSignalId}
                onChange={(e) => setTransitionSignalId(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                placeholder="Signal ID (optional)"
              />
              <input
                value={transitionSymbol}
                onChange={(e) => setTransitionSymbol(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                placeholder="Symbol"
              />
              <input
                value={transitionTimeframe}
                onChange={(e) => setTransitionTimeframe(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                placeholder="Timeframe"
              />
              <input
                type="number"
                min={10}
                max={200}
                value={transitionLimit}
                onChange={(e) => setTransitionLimit(Number(e.target.value) || 50)}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                placeholder="Limit"
              />
            </div>
            {transitionError && <div className="text-[10px] text-red-400">{transitionError}</div>}
            {transitionLoading ? (
              <div className="text-[11px] text-gray-500">Loading transitions...</div>
            ) : (
              <div className="space-y-2 pr-2">
                {transitionEntries.length === 0 ? (
                  <div className="text-[11px] text-gray-500">No lifecycle transitions found.</div>
                ) : (
                  transitionEntries.slice(0, transitionLimit).map((entry) => (
                    <div key={entry.id} className="border border-white/10 rounded-lg p-2 text-[11px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-gray-300">{entry.symbol}</span>
                        <span className="text-gray-400">{entry.timeframe}</span>
                        <span className="text-gray-500">{entry.signalType || '--'}</span>
                        <span className="text-gray-400">{entry.fromStatus} → {entry.toStatus}</span>
                        <span className="text-gray-500">{formatAge(entry.ts)} ago</span>
                      </div>
                      <div className="mt-1 text-gray-500">
                        {entry.note ? `Note: ${entry.note}` : 'Note: --'}
                        {entry.reasonCodes && entry.reasonCodes.length > 0 ? ` | Reasons: ${entry.reasonCodes.join(', ')}` : ''}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] text-gray-600">Signal {entry.signalId}</span>
                        {onExplainSignal && (
                          <button
                            type="button"
                            onClick={() => handleExplainTransition(entry)}
                            className="px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
                          >
                            Explain
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SetupsInterface;
