import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { buildPerformanceDashboardModel, startResearchSession } from '../services/researchAutopilotService';
import type { PerformanceDashboardModel } from '../types';

type PerformanceDashboardProps = {
  defaultSymbol?: string;
  defaultTimeframe?: string;
  onApplyToBacktester?: (payload: {
    strategy: string;
    params: Record<string, any>;
    symbol?: string;
    timeframe?: string;
    rangeDays?: number;
  }) => void;
  onCreateWatchProfile?: (payload: {
    strategy: string;
    params: Record<string, any>;
    symbol?: string;
    timeframe?: string;
    objectivePresetId?: string | null;
    objectivePresetName?: string | null;
    baselineRunId?: string | null;
    optimizerSessionId?: string | null;
    regimeConstraint?: { mode: 'require' | 'exclude'; keys: string[] } | null;
    mode?: 'suggest' | 'paper' | 'live';
    enabled?: boolean;
  }) => void | Promise<void>;
  onSaveWinnerPreset?: (payload: {
    winnerId?: string | null;
    sessionId?: string | null;
    round?: number | null;
    symbol?: string | null;
    timeframe?: string | null;
    strategy?: string | null;
    params?: Record<string, any> | null;
    presetName?: string | null;
    tags?: string[];
  }) => void | Promise<void>;
  onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
};

const formatNumber = (value?: number | null, digits = 2) => {
  if (!Number.isFinite(Number(value))) return '--';
  return Number(value).toFixed(digits);
};

const formatPct = (value?: number | null) => {
  if (!Number.isFinite(Number(value))) return '--';
  return `${(Number(value) * 100).toFixed(0)}%`;
};

const formatDate = (ts?: number | null) => {
  if (!ts) return '--';
  const date = new Date(ts);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const resolvePrimaryDecision = (
  decisions?: { adopt: number; investigate: number; reject: number },
  fallback?: string | null
) => {
  if (decisions) {
    if (decisions.adopt > 0) return 'adopt';
    if (decisions.investigate > 0) return 'investigate';
    if (decisions.reject > 0) return 'reject';
  }
  return fallback || null;
};

type ChartPoint = {
  ts: number;
  value: number | null;
  rawValue?: number | null;
  sessionId?: string | null;
  decision?: string | null;
};

const formatSessionId = (value?: string | null) => {
  if (!value) return '--';
  const raw = String(value);
  return raw.length <= 6 ? raw : raw.slice(-6);
};

const CHART_WIDTH = 240;

const getHoverIndex = (mouseX: number, plotWidth: number, pointCount: number) => {
  if (pointCount <= 1) return 0;
  const safeWidth = Math.max(1, plotWidth);
  const ratio = Math.max(0, Math.min(1, mouseX / safeWidth));
  return Math.max(0, Math.min(pointCount - 1, Math.round(ratio * (pointCount - 1))));
};

const applySma = (values: Array<number | null>, windowSize: number) => {
  const output: Array<number | null> = [];
  const span = Math.max(1, Math.floor(windowSize));
  for (let idx = 0; idx < values.length; idx += 1) {
    const start = Math.max(0, idx - span + 1);
    const slice = values.slice(start, idx + 1).filter((value) => value != null) as number[];
    if (!slice.length) {
      output.push(null);
      continue;
    }
    const avg = slice.reduce((sum, value) => sum + value, 0) / slice.length;
    output.push(avg);
  }
  return output;
};

const decisionColor = (decision?: string | null) => {
  const key = String(decision || '').toLowerCase();
  if (key === 'adopt') return '#34d399';
  if (key === 'investigate') return '#fbbf24';
  if (key === 'reject') return '#f87171';
  return '#6b7280';
};

const MiniLineChart: React.FC<{
  data: ChartPoint[];
  color?: string;
  height?: number;
  hoverIndex: number | null;
  onHoverIndexChange: (idx: number | null) => void;
  valueFormatter?: (value: number | null) => string;
  label?: string;
  showRawValue?: boolean;
  overlay?: {
    data: ChartPoint[];
    color?: string;
    label?: string;
    valueFormatter?: (value: number | null) => string;
  };
}> = ({ data, color = '#38bdf8', height = 90, hoverIndex, onHoverIndexChange, valueFormatter, label, showRawValue, overlay }) => {
  const width = CHART_WIDTH;
  const values = data.map((item) => (Number.isFinite(Number(item.value)) ? Number(item.value) : null));
  const overlayValues = overlay
    ? overlay.data.map((item) => (Number.isFinite(Number(item.value)) ? Number(item.value) : null))
    : [];
  const valid = [...values, ...overlayValues].filter((value) => value != null) as number[];
  if (valid.length < 2) {
    return <div className="text-[10px] text-gray-500">No chart data.</div>;
  }
  let min = Math.min(...valid);
  let max = Math.max(...valid);
  const range = max - min;
  const pad = range === 0 ? 1 : range * 0.1;
  min -= pad;
  max += pad;

  const positions = values.map((value, idx) => {
    if (value == null) return null;
    const x = (idx / Math.max(1, data.length - 1)) * width;
    const y = height - ((value - min) / (max - min)) * height;
    return { x, y };
  });

  const overlayPositions = overlayValues.map((value, idx) => {
    if (value == null) return null;
    const x = (idx / Math.max(1, data.length - 1)) * width;
    const y = height - ((value - min) / (max - min)) * height;
    return { x, y };
  });

  const points = positions
    .map((point) => (point ? `${point.x},${point.y}` : null))
    .filter(Boolean)
    .join(' ');

  const overlayPoints = overlayPositions
    .map((point) => (point ? `${point.x},${point.y}` : null))
    .filter(Boolean)
    .join(' ');

  const handleMove = (event: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relX = event.clientX - rect.left;
    const idx = getHoverIndex(relX, rect.width, data.length);
    onHoverIndexChange(idx);
  };

  const hover = hoverIndex != null ? data[hoverIndex] : null;
  const hoverValue = hover?.value ?? null;
  const hoverRaw = hover?.rawValue ?? null;
  const hasRaw = showRawValue && Number.isFinite(Number(hoverRaw));
  const overlayHover = overlay && hoverIndex != null ? overlay.data[hoverIndex] : null;
  const overlayHoverValue = overlayHover?.value ?? null;
  const hoverX = hoverIndex != null ? (hoverIndex / Math.max(1, data.length - 1)) * width : null;
  const hoverPct = hoverX != null ? (hoverX / width) * 100 : null;

  return (
    <div className="relative">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onMouseMove={handleMove}
      >
        <rect x="0" y="0" width={width} height={height} fill="transparent" />
        <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
        <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
        <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
        <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
        {overlay && overlayPoints && (
          <polyline
            fill="none"
            stroke={overlay.color || '#a78bfa'}
            strokeWidth="1.5"
            points={overlayPoints}
            strokeDasharray="3,3"
          />
        )}
        {positions.map((point, idx) => {
          if (!point) return null;
          const decision = data[idx]?.decision;
          if (!decision) return null;
          return (
            <circle
              key={`marker_${idx}`}
              cx={point.x}
              cy={point.y}
              r={3}
              fill={decisionColor(decision)}
              stroke="rgba(0,0,0,0.6)"
              strokeWidth="1"
            />
          );
        })}
        {hoverX != null && (
          <line x1={hoverX} y1={0} x2={hoverX} y2={height} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
        )}
      </svg>
      {hoverIndex != null && hoverPct != null && (
        <div
          className="absolute top-1 text-[10px] text-gray-200 bg-black/70 border border-white/10 rounded px-2 py-1"
          style={{ left: `calc(${hoverPct}% + 6px)` }}
        >
          <div>{formatDate(hover?.ts)} | {formatSessionId(hover?.sessionId)}</div>
          {hasRaw && (
            <div>Raw {valueFormatter ? valueFormatter(hoverRaw) : formatNumber(hoverRaw, 2)}</div>
          )}
          <div>{label || 'Value'} {valueFormatter ? valueFormatter(hoverValue) : formatNumber(hoverValue, 2)}</div>
          {overlay && (
            <div>
              {overlay.label || 'Overlay'}{' '}
              {overlay.valueFormatter ? overlay.valueFormatter(overlayHoverValue) : formatNumber(overlayHoverValue, 2)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const MiniBarChart: React.FC<{
  data: ChartPoint[];
  color?: string;
  height?: number;
  hoverIndex: number | null;
  onHoverIndexChange: (idx: number | null) => void;
  valueFormatter?: (value: number | null) => string;
  label?: string;
}> = ({ data, color = '#a78bfa', height = 90, hoverIndex, onHoverIndexChange, valueFormatter, label }) => {
  const width = CHART_WIDTH;
  const valid = data.map((item) => (Number.isFinite(Number(item.value)) ? Number(item.value) : null));
  const max = Math.max(0, ...valid.map((value) => value ?? 0));
  if (valid.filter((value) => value != null).length === 0) {
    return <div className="text-[10px] text-gray-500">No chart data.</div>;
  }

  const handleMove = (event: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relX = event.clientX - rect.left;
    const idx = getHoverIndex(relX, rect.width, data.length);
    onHoverIndexChange(idx);
  };

  const hover = hoverIndex != null ? data[hoverIndex] : null;
  const hoverValue = hover?.value ?? null;
  const hoverX = hoverIndex != null ? (hoverIndex / Math.max(1, data.length - 1)) * width : null;
  const hoverPct = hoverX != null ? (hoverX / width) * 100 : null;

  return (
    <div className="relative">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} onMouseMove={handleMove}>
        <rect x="0" y="0" width={width} height={height} fill="transparent" />
        {data.map((item, idx) => {
          const value = Number.isFinite(Number(item.value)) ? Number(item.value) : 0;
          const barWidth = width / Math.max(1, data.length);
          const barHeight = max > 0 ? (value / max) * height : 0;
          const x = idx * barWidth + 1;
          const y = height - barHeight;
          const highlight = hoverIndex === idx ? 1 : 0.8;
          return (
            <rect
              key={`${item.ts}_${idx}`}
              x={x}
              y={y}
              width={Math.max(1, barWidth - 2)}
              height={barHeight}
              fill={color}
              opacity={highlight}
            />
          );
        })}
        {hoverX != null && (
          <line x1={hoverX} y1={0} x2={hoverX} y2={height} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
        )}
      </svg>
      {hoverIndex != null && hoverPct != null && (
        <div
          className="absolute top-1 text-[10px] text-gray-200 bg-black/70 border border-white/10 rounded px-2 py-1"
          style={{ left: `calc(${hoverPct}% + 6px)` }}
        >
          <div>{formatDate(hover?.ts)} | {formatSessionId(hover?.sessionId)}</div>
          <div>{label || 'Value'} {valueFormatter ? valueFormatter(hoverValue) : formatNumber(hoverValue, 2)}</div>
        </div>
      )}
    </div>
  );
};

const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({
  defaultSymbol,
  defaultTimeframe,
  onApplyToBacktester,
  onCreateWatchProfile,
  onSaveWinnerPreset,
  onRunActionCatalog
}) => {
  const [model, setModel] = useState<PerformanceDashboardModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('latest');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [sessionWindow, setSessionWindow] = useState<number>(10);
  const [smoothSeries, setSmoothSeries] = useState(false);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [targetStatus, setTargetStatus] = useState<string | null>(null);

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

  const showHoverDebug =
    typeof window !== 'undefined' &&
    typeof window.localStorage !== 'undefined' &&
    window.localStorage.getItem('glass_dashboard_debug') === '1';

  const loadSessions = useCallback(async () => {
    const ledger = (window as any)?.glass?.tradeLedger;
    if (!ledger?.listResearchSessions) {
      setError('Research sessions unavailable.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await ledger.listResearchSessions({ limit: 20 });
      const list = Array.isArray(res?.sessions) ? res.sessions : [];
      const sorted = list.slice().sort((a, b) => (Number(b?.updatedAtMs) || 0) - (Number(a?.updatedAtMs) || 0));
      setSessions(sorted);
      if (sorted.length > 0) {
        const fallback = sorted[0];
        if (!selectedSymbol) setSelectedSymbol(String(defaultSymbol || fallback.symbol || '').trim());
        if (!selectedTimeframe) setSelectedTimeframe(String(defaultTimeframe || fallback.timeframe || '').trim());
      }
    } catch (err: any) {
      setError(err?.message ? String(err.message) : 'Failed to load sessions.');
    } finally {
      setLoading(false);
    }
  }, [defaultSymbol, defaultTimeframe, selectedSymbol, selectedTimeframe]);

  const loadFilteredSessions = useCallback(async () => {
    const ledger = (window as any)?.glass?.tradeLedger;
    if (!ledger?.listResearchSessions) return;
    if (!selectedSymbol || !selectedTimeframe) return;
    const res = await ledger.listResearchSessions({
      limit: 10,
      symbol: selectedSymbol,
      timeframe: selectedTimeframe
    });
    const list = Array.isArray(res?.sessions) ? res.sessions : [];
    const sorted = list.slice().sort((a, b) => (Number(b?.updatedAtMs) || 0) - (Number(a?.updatedAtMs) || 0));
    setFilteredSessions(sorted);
    setSelectedSessionId('latest');
  }, [selectedSymbol, selectedTimeframe]);

  const loadDashboard = useCallback(async () => {
    if (!filteredSessions.length) {
      setModel(null);
      return;
    }
    const ledger = (window as any)?.glass?.tradeLedger;
    const session =
      selectedSessionId === 'latest'
        ? filteredSessions[0]
        : filteredSessions.find((entry) => String(entry?.sessionId) === selectedSessionId);
    if (!session?.sessionId) {
      setError('No matching session selected.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let resolvedSession = session;
      if (ledger?.getResearchSession) {
        const res = await ledger.getResearchSession({ sessionId: String(session.sessionId) });
        if (res?.ok && res.session) resolvedSession = res.session;
      }
      setActiveSession(resolvedSession);
      const payload = await buildPerformanceDashboardModel(String(session.sessionId), { sessionLimit: sessionWindow });
      if (!payload) {
        setError('Dashboard model unavailable.');
        setModel(null);
        return;
      }
      setModel(payload);
    } catch (err: any) {
      setError(err?.message ? String(err.message) : 'Failed to load dashboard.');
      setModel(null);
    } finally {
      setLoading(false);
    }
  }, [filteredSessions, selectedSessionId, sessionWindow]);


  const handleHoverIndexChange = useCallback((idx: number | null) => {
    setHoverIndex(idx);
  }, []);

  const clearHover = useCallback(() => {
    setHoverIndex(null);
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    const handler = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.symbol != null) setSelectedSymbol(String(detail.symbol));
      if (detail.timeframe != null) setSelectedTimeframe(String(detail.timeframe));
      if (detail.sessionId != null) setSelectedSessionId(String(detail.sessionId));
      if (detail.sessionWindow != null) {
        const win = Number(detail.sessionWindow);
        if (Number.isFinite(win)) setSessionWindow(win);
      }
      if (detail.smooth != null) setSmoothSeries(!!detail.smooth);
      if (detail.compare != null) setCompareEnabled(!!detail.compare);
    };
    window.addEventListener('glass_dashboard_filters', handler as any);
    return () => window.removeEventListener('glass_dashboard_filters', handler as any);
  }, []);

  useEffect(() => {
    const handler = () => {
      void loadSessions();
    };
    window.addEventListener('glass_dashboard_refresh', handler as any);
    return () => window.removeEventListener('glass_dashboard_refresh', handler as any);
  }, [loadSessions]);

  useEffect(() => {
    if (!selectedSymbol || !selectedTimeframe) return;
    void loadFilteredSessions();
  }, [loadFilteredSessions, selectedSymbol, selectedTimeframe]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);


  useEffect(() => {
    setHoverIndex(null);
  }, [selectedSymbol, selectedTimeframe, selectedSessionId, sessionWindow]);

  useEffect(() => {
    if (hoverIndex == null) return;
    if (hoverIndex >= (model?.sessionSeries?.length || 0)) {
      setHoverIndex(null);
    }
  }, [hoverIndex, model?.sessionSeries?.length]);

  const fetchExperimentNote = useCallback(async (noteId: string) => {
    const ledger = (window as any)?.glass?.tradeLedger;
    if (!ledger?.getExperimentNote) return null;
    const res = await ledger.getExperimentNote({ id: String(noteId) });
    return res?.ok ? res.note : null;
  }, []);

  const applyExperimentNote = useCallback(async (noteId?: string | null) => {
    if (!noteId || !onApplyToBacktester) return;
    const note = await fetchExperimentNote(noteId);
    if (!note?.recommendedParams) return;
    onApplyToBacktester({
      strategy: String(note.strategy || '').trim() || 'RANGE_BREAKOUT',
      params: note.recommendedParams,
      symbol: note.symbol,
      timeframe: note.timeframe,
      rangeDays: note.rangeDays
    });
  }, [fetchExperimentNote, onApplyToBacktester]);

  const promoteExperimentNote = useCallback(async (noteId?: string | null, regimeKey?: string | null) => {
    if (!noteId || !onCreateWatchProfile) return;
    const note = await fetchExperimentNote(noteId);
    if (!note?.recommendedParams) return;
    const constraint = regimeKey ? { mode: 'require' as const, keys: [String(regimeKey)] } : null;
    await onCreateWatchProfile({
      strategy: String(note.strategy || '').trim() || 'RANGE_BREAKOUT',
      params: note.recommendedParams,
      symbol: note.symbol,
      timeframe: note.timeframe,
      objectivePresetId: note.objectivePreset || null,
      objectivePresetName: null,
      baselineRunId: note.baselineRunId || null,
      optimizerSessionId: note.round2SessionId || note.round1SessionId || null,
      regimeConstraint: constraint,
      mode: 'suggest',
      enabled: true
    });
  }, [fetchExperimentNote, onCreateWatchProfile]);

  const savePresetFromNote = useCallback(async (noteId?: string | null, label?: string | null) => {
    if (!noteId || !onSaveWinnerPreset) return;
    const note = await fetchExperimentNote(noteId);
    if (!note) return;
    const round = note.round2SessionId ? 2 : note.round1SessionId ? 1 : null;
    const sessionId = note.round2SessionId || note.round1SessionId || null;
    try {
      await onSaveWinnerPreset({
        sessionId,
        round,
        symbol: note.symbol || null,
        timeframe: note.timeframe || null,
        strategy: note.strategy || null,
        params: note.recommendedParams || null,
        presetName: label || null,
        tags: ['optimizer', 'preset', 'dashboard']
      });
      setTargetStatus(`Saved preset from ${note.id}.`);
    } catch (err: any) {
      setError(err?.message ? String(err.message) : 'Failed to save preset.');
    }
  }, [fetchExperimentNote, onSaveWinnerPreset]);

  const startTargetedAutopilot = useCallback(async (regimeKey: string) => {
    if (!activeSession?.config) {
      setError('Session config unavailable for targeted run.');
      return;
    }
    setError(null);
    setTargetStatus(null);
    try {
      const baseConfig = { ...(activeSession.config || {}) };
      const payload = {
        ...baseConfig,
        symbol: activeSession.symbol,
        timeframe: activeSession.timeframe,
        strategy: activeSession.strategy || baseConfig.strategy,
        objectivePreset: activeSession.objectivePreset || baseConfig.objectivePreset,
        targetRegimeKey: String(regimeKey)
      };
      const newSession = await startResearchSession(payload);
      await loadSessions();
      await loadFilteredSessions();
      setSelectedSessionId(String(newSession.sessionId));
      setTargetStatus(`Started Autopilot targeting ${regimeKey}.`);
    } catch (err: any) {
      setError(err?.message ? String(err.message) : 'Failed to start targeted autopilot.');
    }
  }, [activeSession, loadFilteredSessions, loadSessions]);

  useEffect(() => {
    const handler = (event: any) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const action = String(detail.action || '').trim();
      const noteId = String(detail.experimentNoteId || detail.id || detail.experimentId || '').trim();
      if (action === 'dashboard.action.apply' && noteId) {
        applyExperimentNote(noteId);
        return;
      }
      if (action === 'dashboard.action.promote' && noteId) {
        const regimeKey = detail.regimeKey ? String(detail.regimeKey) : null;
        promoteExperimentNote(noteId, regimeKey);
        return;
      }
      if (action === 'dashboard.action.save_preset' && noteId) {
        const name = detail.name ? String(detail.name) : undefined;
        savePresetFromNote(noteId, name || 'Dashboard Preset');
        return;
      }
      if (action === 'dashboard.autopilot.target') {
        const regimeKey = detail.regimeKey ? String(detail.regimeKey) : '';
        if (regimeKey) startTargetedAutopilot(regimeKey);
      }
    };
    window.addEventListener('glass_dashboard_action', handler as any);
    return () => window.removeEventListener('glass_dashboard_action', handler as any);
  }, [applyExperimentNote, promoteExperimentNote, savePresetFromNote, startTargetedAutopilot]);

  const sessionSeries = model?.sessionSeries || [];
  const sessionPoints = sessionSeries.map((entry) => {
    const decision = resolvePrimaryDecision(entry.decisions);
    return {
      ts: entry.ts,
      sessionId: entry.sessionId || null,
      decision
    };
  });
  const rawScoreValues = sessionSeries.map((entry) => (Number.isFinite(Number(entry.bestScore)) ? Number(entry.bestScore) : null));
  const rawEdgeValues = sessionSeries.map((entry) => (Number.isFinite(Number(entry.bestEdgeMargin)) ? Number(entry.bestEdgeMargin) : null));
  const rawDdValues = sessionSeries.map((entry) => (Number.isFinite(Number(entry.worstDD)) ? Number(entry.worstDD) : null));
  const rawPenaltyValues = sessionSeries.map((entry) => (Number.isFinite(Number(entry.overfitPenalty)) ? Number(entry.overfitPenalty) : null));
  const smoothedScore = smoothSeries ? applySma(rawScoreValues, 3) : rawScoreValues;
  const smoothedEdge = smoothSeries ? applySma(rawEdgeValues, 3) : rawEdgeValues;
  const smoothedDd = smoothSeries ? applySma(rawDdValues, 3) : rawDdValues;
  const smoothedPenalty = smoothSeries ? applySma(rawPenaltyValues, 3) : rawPenaltyValues;

  const scoreSeries = sessionSeries.map((entry, idx) => ({
    ...sessionPoints[idx],
    value: smoothSeries ? smoothedScore[idx] : rawScoreValues[idx],
    rawValue: smoothSeries ? rawScoreValues[idx] : null
  }));
  const edgeSeries = sessionSeries.map((entry, idx) => ({
    ...sessionPoints[idx],
    value: smoothSeries ? smoothedEdge[idx] : rawEdgeValues[idx],
    rawValue: smoothSeries ? rawEdgeValues[idx] : null
  }));
  const ddSeries = sessionSeries.map((entry, idx) => ({
    ...sessionPoints[idx],
    value: smoothSeries ? smoothedDd[idx] : rawDdValues[idx],
    rawValue: smoothSeries ? rawDdValues[idx] : null
  }));
  const penaltySeries = sessionSeries.map((entry, idx) => ({
    ...sessionPoints[idx],
    value: smoothSeries ? smoothedPenalty[idx] : rawPenaltyValues[idx],
    rawValue: smoothSeries ? rawPenaltyValues[idx] : null
  }));
  const robustnessSeries = sessionSeries.map((entry, idx) => ({
    ...sessionPoints[idx],
    value: entry.robustnessPassRate ?? null
  }));

  const globalChampion = model?.globalChampion || null;
  const championsByRegime = model?.championsByRegime || {};
  const regimeFrequency = model?.regimeFrequency || {};
  const regimeRows = Object.entries(regimeFrequency)
    .map(([key, count]) => ({ key, count: Number(count) || 0 }))
    .sort((a, b) => (b.count - a.count) || a.key.localeCompare(b.key))
    .slice(0, 6)
    .map((entry) => ({
      regimeKey: entry.key,
      count: entry.count,
      record: championsByRegime[entry.key]
    }));

  const recentExperiments = model?.recentExperiments || [];
  const experimentsTimeline = useMemo(() => {
    const series = model?.experimentSeries || [];
    return series.slice(-16);
  }, [model?.experimentSeries]);

  const coverageGaps = useMemo(() => {
    const frequency = regimeFrequency || {};
    const champions = championsByRegime || {};
    const ordered = Object.entries(frequency)
      .map(([key, count]) => ({ key, count: Number(count) || 0 }))
      .sort((a, b) => (b.count - a.count) || a.key.localeCompare(b.key));
    const missing: Array<{ key: string; count: number }> = [];
    const brittle: Array<{ key: string; count: number }> = [];
    for (const entry of ordered) {
      const record = champions[entry.key];
      if (!record) {
        missing.push(entry);
      } else if (record?.robustnessWorstCase?.pass === false) {
        brittle.push(entry);
      }
    }
    return {
      missing: missing.slice(0, 4),
      brittle: brittle.slice(0, 4)
    };
  }, [championsByRegime, regimeFrequency]);

  const symbolOptions = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((entry) => {
      if (entry?.symbol) set.add(String(entry.symbol));
    });
    return Array.from(set);
  }, [sessions]);

  const timeframeOptions = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((entry) => {
      if (entry?.timeframe) set.add(String(entry.timeframe));
    });
    return Array.from(set);
  }, [sessions]);

  return (
    <div className="h-full w-full overflow-y-auto p-4 space-y-4 text-gray-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm uppercase tracking-wider text-gray-400">Performance Dashboard</div>
          <div className="text-[11px] text-gray-500">Research autopilot overview</div>
          {showHoverDebug && (
            <div className="text-[10px] text-gray-500">Hover index {hoverIndex ?? '--'}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedSymbol}
            onChange={(e) => runActionOr('dashboard.session.select', { symbol: e.target.value }, () => setSelectedSymbol(e.target.value))}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[11px] text-gray-100"
          >
            {symbolOptions.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>
          <select
            value={selectedTimeframe}
            onChange={(e) => runActionOr('dashboard.session.select', { timeframe: e.target.value }, () => setSelectedTimeframe(e.target.value))}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[11px] text-gray-100"
          >
            {timeframeOptions.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
          <select
            value={selectedSessionId}
            onChange={(e) => runActionOr('dashboard.session.select', { sessionId: e.target.value }, () => setSelectedSessionId(e.target.value))}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[11px] text-gray-100"
          >
            <option value="latest">Latest</option>
            {filteredSessions.map((session) => (
              <option key={session.sessionId} value={String(session.sessionId)}>
                {String(session.sessionId).slice(-6)} | {formatDate(session.updatedAtMs || session.createdAtMs)}
              </option>
            ))}
          </select>
          <select
            value={sessionWindow}
            onChange={(e) => {
              const next = Number(e.target.value);
              runActionOr('dashboard.window.set', { sessionWindow: next }, () => setSessionWindow(next));
            }}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[11px] text-gray-100"
          >
            <option value={10}>Last 10</option>
            <option value={25}>Last 25</option>
            <option value={50}>Last 50</option>
          </select>
          <button
            type="button"
            onClick={() => runActionOr('dashboard.smoothing.set', { smooth: !smoothSeries }, () => setSmoothSeries((prev) => !prev))}
            className="px-2 py-1 rounded-md text-[11px] border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10"
          >
            {smoothSeries ? 'Smoothed' : 'Raw'}
          </button>
          <button
            type="button"
            onClick={() => runActionOr('dashboard.refresh', { atMs: Date.now() }, () => loadSessions())}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-60"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-red-400">{error}</div>}
      {!error && targetStatus && <div className="text-xs text-emerald-300">{targetStatus}</div>}

      {!error && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider text-gray-400">Global Champion</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => runActionOr(
                      'dashboard.action.apply',
                      { experimentNoteId: globalChampion?.experimentNoteId || globalChampion?.experimentId || null },
                      () => applyExperimentNote(globalChampion?.experimentNoteId || globalChampion?.experimentId || null)
                    )}
                    disabled={!onApplyToBacktester || !globalChampion?.experimentNoteId}
                    className="px-2 py-1 rounded-md text-[10px] border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10 disabled:opacity-50"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => runActionOr(
                      'dashboard.action.promote',
                      { experimentNoteId: globalChampion?.experimentNoteId || globalChampion?.experimentId || null, regimeKey: null },
                      () => promoteExperimentNote(globalChampion?.experimentNoteId || globalChampion?.experimentId || null, null)
                    )}
                    disabled={!onCreateWatchProfile || !globalChampion?.experimentNoteId}
                    className="px-2 py-1 rounded-md text-[10px] border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10 disabled:opacity-50"
                  >
                    Promote
                  </button>
                  <button
                    type="button"
                    onClick={() => runActionOr(
                      'dashboard.action.save_preset',
                      {
                        experimentNoteId: globalChampion?.experimentNoteId || globalChampion?.experimentId || null,
                        name: 'Global Champion'
                      },
                      () => savePresetFromNote(globalChampion?.experimentNoteId || globalChampion?.experimentId || null, 'Global Champion')
                    )}
                    disabled={!onSaveWinnerPreset || !globalChampion?.experimentNoteId}
                    className="px-2 py-1 rounded-md text-[10px] border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10 disabled:opacity-50"
                  >
                    Save preset
                  </button>
                </div>
              </div>
              {globalChampion ? (
                <div className="text-[11px] text-gray-300">
                  <div>
                    Decision {String(globalChampion.decision || 'run').toUpperCase()} | Score{' '}
                    {Number.isFinite(Number(globalChampion.score)) ? Number(globalChampion.score).toFixed(3) : '--'}
                  </div>
                  <div>
                    Trades {globalChampion.testMetrics?.tradeCount ?? '--'} | Edge{' '}
                    {formatNumber(globalChampion.testMetrics?.edgeMargin)} | DD{' '}
                    {formatNumber(globalChampion.testMetrics?.maxDrawdown)}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-gray-500">No champion yet.</div>
              )}
            </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
            <div className="text-xs uppercase tracking-wider text-gray-400">Recent Experiments</div>
            {recentExperiments.length > 0 ? (
              <div className="space-y-1 text-[11px] text-gray-300">
                  {recentExperiments.map((note) => (
                    <div key={note.id} className="flex items-center justify-between gap-2">
                      <div className="truncate">
                        {note.id} | {String(note.decision || 'run').toUpperCase()}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => runActionOr(
                            'dashboard.action.apply',
                            { experimentNoteId: note.id },
                            () => applyExperimentNote(note.id)
                          )}
                          disabled={!onApplyToBacktester}
                          className="px-2 py-1 rounded-md text-[10px] border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10 disabled:opacity-50"
                        >
                          Apply
                        </button>
                        <span className="text-[10px] text-gray-500">{note.timeframe || '--'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-gray-500">No experiment notes yet.</div>
              )}
            </div>

          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
            <div className="text-xs uppercase tracking-wider text-gray-400">Champions by Regime</div>
            {regimeRows.length === 0 ? (
              <div className="text-[11px] text-gray-500">No regime champions yet.</div>
            ) : (
              <div className="space-y-2 text-[11px] text-gray-300">
                {regimeRows.map((row) => {
                  const record = row.record || {};
                  const decision = String(record.decision || 'run').toUpperCase();
                  return (
                    <div key={row.regimeKey} className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-gray-300">
                          {row.regimeKey} <span className="text-[10px] text-gray-500">x{row.count}</span>
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {decision} | Score {formatNumber(record.score, 3)} | Trades {record.testMetrics?.tradeCount ?? '--'} | Edge{' '}
                          {formatNumber(record.testMetrics?.edgeMargin)} | DD {formatNumber(record.testMetrics?.maxDrawdown)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => runActionOr(
                            'dashboard.action.apply',
                            { experimentNoteId: record.experimentNoteId || null },
                            () => applyExperimentNote(record.experimentNoteId || null)
                          )}
                          disabled={!onApplyToBacktester || !record.experimentNoteId}
                          className="px-2 py-1 rounded-md text-[10px] border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10 disabled:opacity-50"
                        >
                          Apply
                        </button>
                        <button
                          type="button"
                          onClick={() => runActionOr(
                            'dashboard.action.promote',
                            { experimentNoteId: record.experimentNoteId || null, regimeKey: row.regimeKey },
                            () => promoteExperimentNote(record.experimentNoteId || null, row.regimeKey)
                          )}
                          disabled={!onCreateWatchProfile || !record.experimentNoteId}
                          className="px-2 py-1 rounded-md text-[10px] border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10 disabled:opacity-50"
                        >
                          Promote
                        </button>
                        <button
                          type="button"
                          onClick={() => runActionOr(
                            'dashboard.action.save_preset',
                            { experimentNoteId: record.experimentNoteId || null, name: row.regimeKey },
                            () => savePresetFromNote(record.experimentNoteId || null, row.regimeKey)
                          )}
                          disabled={!onSaveWinnerPreset || !record.experimentNoteId}
                          className="px-2 py-1 rounded-md text-[10px] border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10 disabled:opacity-50"
                        >
                          Save preset
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" onMouseLeave={clearHover}>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider text-gray-400">Best Score</div>
                <div className="text-[10px] text-gray-500">Last {formatNumber(rawScoreValues.at(-1), 3)}</div>
              </div>
              <MiniLineChart
                data={scoreSeries}
                color="#38bdf8"
                hoverIndex={hoverIndex}
                onHoverIndexChange={handleHoverIndexChange}
                label="Score"
                valueFormatter={(value) => formatNumber(value, 3)}
                showRawValue={smoothSeries}
              />
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider text-gray-400">Edge Margin</div>
                <div className="text-[10px] text-gray-500">Last {formatNumber(rawEdgeValues.at(-1), 3)}</div>
              </div>
              <MiniLineChart
                data={edgeSeries}
                color="#22d3ee"
                hoverIndex={hoverIndex}
                onHoverIndexChange={handleHoverIndexChange}
                label="Edge"
                valueFormatter={(value) => formatNumber(value, 3)}
                showRawValue={smoothSeries}
              />
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider text-gray-400">Worst Drawdown</div>
                <div className="text-[10px] text-gray-500">Last {formatNumber(rawDdValues.at(-1), 2)}</div>
              </div>
              <MiniLineChart
                data={ddSeries}
                color="#f97316"
                hoverIndex={hoverIndex}
                onHoverIndexChange={handleHoverIndexChange}
                label="DD"
                valueFormatter={(value) => formatNumber(value, 2)}
                showRawValue={smoothSeries}
              />
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider text-gray-400">Robustness Pass Rate</div>
                <div className="text-[10px] text-gray-500">Last {formatPct(robustnessSeries.at(-1)?.value)}</div>
              </div>
              <MiniBarChart
                data={robustnessSeries}
                color="#a78bfa"
                hoverIndex={hoverIndex}
                onHoverIndexChange={handleHoverIndexChange}
                label="Robust"
                valueFormatter={(value) => formatPct(value)}
              />
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider text-gray-400">Stability Penalty</div>
                <div className="text-[10px] text-gray-500">Last {formatNumber(rawPenaltyValues.at(-1), 3)}</div>
              </div>
              <MiniLineChart
                data={penaltySeries}
                color="#facc15"
                hoverIndex={hoverIndex}
                onHoverIndexChange={handleHoverIndexChange}
                label="Penalty"
                valueFormatter={(value) => formatNumber(value, 3)}
                showRawValue={smoothSeries}
                overlay={{
                  data: robustnessSeries,
                  color: '#a78bfa',
                  label: 'Robust',
                  valueFormatter: (value) => formatPct(value)
                }}
              />
            </div>
            <div className="lg:col-span-2 flex flex-wrap gap-3 text-[10px] text-gray-400">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Adopt
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                Investigate
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                Reject
              </span>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
            <div className="text-xs uppercase tracking-wider text-gray-400">Coverage Gaps</div>
            {coverageGaps.missing.length === 0 && coverageGaps.brittle.length === 0 ? (
              <div className="text-[11px] text-gray-500">No coverage gaps detected.</div>
            ) : (
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 text-[11px] text-gray-300">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Missing Champions</div>
                  {coverageGaps.missing.length === 0 ? (
                    <div className="text-gray-500">None</div>
                  ) : (
                    <div className="space-y-1">
                      {coverageGaps.missing.map((entry) => (
                        <div key={`missing_${entry.key}`} className="flex items-center justify-between gap-2">
                          <span>{entry.key}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">x{entry.count}</span>
                            <button
                              type="button"
                              onClick={() => runActionOr(
                                'dashboard.autopilot.target',
                                { regimeKey: entry.key },
                                () => startTargetedAutopilot(entry.key)
                              )}
                              className="px-2 py-0.5 rounded-md text-[10px] border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10"
                            >
                              Target
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Brittle Champions</div>
                  {coverageGaps.brittle.length === 0 ? (
                    <div className="text-gray-500">None</div>
                  ) : (
                    <div className="space-y-1">
                      {coverageGaps.brittle.map((entry) => (
                        <div key={`brittle_${entry.key}`} className="flex items-center justify-between gap-2">
                          <span>{entry.key}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">x{entry.count}</span>
                            <button
                              type="button"
                              onClick={() => runActionOr(
                                'dashboard.autopilot.target',
                                { regimeKey: entry.key },
                                () => startTargetedAutopilot(entry.key)
                              )}
                              className="px-2 py-0.5 rounded-md text-[10px] border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10"
                            >
                              Target
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="text-[10px] text-gray-500">
              Target these regimes in the next Autopilot run.
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
            <div className="text-xs uppercase tracking-wider text-gray-400">Experiment Timeline</div>
            {experimentsTimeline.length === 0 ? (
              <div className="text-[11px] text-gray-500">No experiment activity yet.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {experimentsTimeline.map((entry) => {
                  const decision = String(entry.decision || '').toLowerCase();
                  const color =
                    decision === 'adopt'
                      ? 'bg-emerald-400'
                      : decision === 'reject'
                        ? 'bg-red-400'
                        : decision === 'investigate'
                          ? 'bg-amber-400'
                          : 'bg-gray-500';
                  return (
                    <div
                      key={`${entry.ts}_${decision}`}
                      title={`${formatDate(entry.ts)} | ${decision || 'run'}`}
                      className={`h-3 w-3 rounded-full ${color}`}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceDashboard;
