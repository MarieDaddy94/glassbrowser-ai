import React, { useEffect, useMemo, useState } from 'react';
import type { SignalIntent } from '../../types';
import { parseSignalIntentPrompt, validateSignalIntentDraft } from '../../services/signalIntentParser';

type SignalIntentComposerProps = {
  open: boolean;
  onClose: () => void;
  agents: Array<{ id: string; name?: string | null }>;
  knownSymbols: string[];
  defaultSymbol?: string | null;
  defaultTimeframes?: string[] | null;
  onAssistParse?: (input: {
    prompt: string;
    agentId: string;
    knownSymbols: string[];
    defaultSymbol?: string | null;
    defaultTimeframes?: string[] | null;
  }) => Promise<Partial<SignalIntent> | null>;
  onCreateIntent: (intent: Partial<SignalIntent>) => Promise<{ ok: boolean; error?: string }> | { ok: boolean; error?: string };
};

const rowClass = 'w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-gray-100';

const SignalIntentComposer: React.FC<SignalIntentComposerProps> = ({
  open,
  onClose,
  agents,
  knownSymbols,
  defaultSymbol,
  defaultTimeframes,
  onAssistParse,
  onCreateIntent
}) => {
  const [agentId, setAgentId] = useState<string>(() => String(agents[0]?.id || '').trim());
  const [prompt, setPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [assisting, setAssisting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assistantNotes, setAssistantNotes] = useState<string | null>(null);
  const [assistantDraft, setAssistantDraft] = useState<Partial<SignalIntent> | null>(null);
  const [symbolOverride, setSymbolOverride] = useState('');
  const [timeframesOverride, setTimeframesOverride] = useState('');
  const [scheduleTimesOverride, setScheduleTimesOverride] = useState('');
  const [timezoneOverride, setTimezoneOverride] = useState('');
  const [probabilityOverride, setProbabilityOverride] = useState('');
  const [targetPointsOverride, setTargetPointsOverride] = useState('');
  const [strategyOverride, setStrategyOverride] = useState<string>('');
  const [weekdaysOverride, setWeekdaysOverride] = useState<number[]>([]);

  useEffect(() => {
    if (agentId) return;
    const first = String(agents[0]?.id || '').trim();
    if (first) setAgentId(first);
  }, [agentId, agents]);

  const parse = useMemo(
    () =>
      parseSignalIntentPrompt({
        prompt,
        agentId,
        knownSymbols,
        defaultSymbol,
        defaultTimeframes
      }),
    [agentId, defaultSymbol, defaultTimeframes, knownSymbols, prompt]
  );

  const draftMerged = useMemo(() => {
    const base = { ...parse.draft, ...(assistantDraft || {}) };
    const next: Partial<SignalIntent> = {
      ...base
    };
    const symbol = String(symbolOverride || '').trim();
    if (symbol) next.symbol = symbol;
    const timeframes = String(timeframesOverride || '')
      .split(/[,\s/]+/g)
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    if (timeframes.length > 0) next.timeframes = timeframes;
    const times = String(scheduleTimesOverride || '')
      .split(/[,\s]+/g)
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    const timezone = String(timezoneOverride || '').trim();
    const schedule = {
      ...(next.schedule || parse.draft.schedule || { timezone: 'America/New_York', times: [], weekdays: [1, 2, 3, 4, 5] }),
      timezone: timezone || next.schedule?.timezone || 'America/New_York',
      times: times.length > 0 ? times : (next.schedule?.times || []),
      weekdays: weekdaysOverride.length > 0 ? weekdaysOverride : (next.schedule?.weekdays || [1, 2, 3, 4, 5])
    };
    next.schedule = schedule;

    const probability = Number(probabilityOverride);
    if (Number.isFinite(probability)) next.probabilityMin = probability;
    const targetPoints = Number(targetPointsOverride);
    if (Number.isFinite(targetPoints)) next.targetPoints = targetPoints;
    if (strategyOverride) next.strategyMode = strategyOverride as SignalIntent['strategyMode'];
    return next;
  }, [
    assistantDraft,
    parse.draft,
    probabilityOverride,
    scheduleTimesOverride,
    strategyOverride,
    symbolOverride,
    targetPointsOverride,
    timeframesOverride,
    timezoneOverride,
    weekdaysOverride
  ]);

  const parsedWithOverrides = useMemo(() => {
    return validateSignalIntentDraft(draftMerged, {
      baseWarnings: parse.warnings,
      preferredConfidence: draftMerged.parseConfidence ?? parse.confidence
    });
  }, [draftMerged, parse.confidence, parse.warnings]);

  if (!open) return null;

  const runAssistParse = async () => {
    if (!onAssistParse || !prompt.trim() || !agentId.trim()) return;
    setAssisting(true);
    try {
      const assisted = await onAssistParse({
        prompt,
        agentId,
        knownSymbols,
        defaultSymbol,
        defaultTimeframes
      });
      if (assisted && typeof assisted === 'object') {
        setAssistantDraft(assisted);
        setAssistantNotes('LLM extraction applied. Review parsed fields before activation.');
      } else {
        setAssistantNotes('LLM extraction unavailable. Using deterministic parser only.');
      }
    } catch (err: any) {
      setAssistantNotes(err?.message ? String(err.message) : 'LLM parse assist failed.');
    } finally {
      setAssisting(false);
    }
  };

  const toggleWeekday = (day: number) => {
    setWeekdaysOverride((prev) => {
      const has = prev.includes(day);
      if (has) return prev.filter((entry) => entry !== day);
      return [...prev, day].sort((a, b) => a - b);
    });
  };

  const submit = async () => {
    if (!parsedWithOverrides.ok || parsedWithOverrides.needsConfirmation) {
      setError(parsedWithOverrides.errors.join(' ') || parsedWithOverrides.warnings.join(' ') || 'Intent needs confirmation.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await onCreateIntent(parsedWithOverrides.draft);
      if (!result?.ok) {
        setError(result?.error || 'Failed to create intent.');
        return;
      }
      setPrompt('');
      setAssistantDraft(null);
      setAssistantNotes(null);
      setSymbolOverride('');
      setTimeframesOverride('');
      setScheduleTimesOverride('');
      setTimezoneOverride('');
      setProbabilityOverride('');
      setTargetPointsOverride('');
      setStrategyOverride('');
      setWeekdaysOverride([]);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-lg border border-white/10 bg-[#090909] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
          <div>
            <div className="text-sm font-semibold text-white">Agent Intent</div>
            <div className="text-[11px] text-gray-400">Create schedule-based signal intent (suggest-only)</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-white/10 px-2 py-1 text-xs text-gray-300 hover:text-white"
          >
            Close
          </button>
        </div>
        <div className="space-y-3 px-4 py-3 text-xs">
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-gray-400">Agent</label>
            <select value={agentId} onChange={(e) => setAgentId(String(e.target.value || ''))} className={rowClass}>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name || agent.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-gray-400">Intent Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className={rowClass}
              placeholder="Example: At 8:30am weekdays look for a quick 10 point scalp on NAS100 5m."
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-[11px] text-gray-500">Hybrid parse: deterministic validator + optional LLM extraction.</div>
              <button
                type="button"
                onClick={() => {
                  void runAssistParse();
                }}
                disabled={!onAssistParse || assisting || !prompt.trim()}
                className={`rounded border px-2 py-1 text-[11px] ${
                  onAssistParse && !assisting && prompt.trim()
                    ? 'border-cyan-400/60 text-cyan-100 hover:bg-cyan-500/10'
                    : 'border-white/10 text-gray-500 cursor-not-allowed'
                }`}
              >
                {assisting ? 'Assisting...' : 'Assist Parse'}
              </button>
            </div>
            {assistantNotes ? <div className="mt-1 text-[11px] text-cyan-300">{assistantNotes}</div> : null}
          </div>

          <div className="rounded border border-white/10 bg-white/5 p-2">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Parsed Preview</div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>Symbol: <span className="text-gray-200">{parsedWithOverrides.draft.symbol || '--'}</span></div>
              <div>Mode: <span className="text-gray-200">{parsedWithOverrides.draft.strategyMode || '--'}</span></div>
              <div>Timeframes: <span className="text-gray-200">{(parsedWithOverrides.draft.timeframes || []).join('/') || '--'}</span></div>
              <div>Target Points: <span className="text-gray-200">{parsedWithOverrides.draft.targetPoints ?? '--'}</span></div>
              <div>Schedule: <span className="text-gray-200">{(parsedWithOverrides.draft.schedule?.times || []).join(', ') || '--'}</span></div>
              <div>Timezone: <span className="text-gray-200">{parsedWithOverrides.draft.schedule?.timezone || '--'}</span></div>
              <div>Confidence: <span className="text-gray-200">{Math.round(Number(parsedWithOverrides.confidence || 0) * 100)}%</span></div>
              <div>Status: <span className="text-gray-200">{parsedWithOverrides.draft.status || '--'}</span></div>
            </div>
            {parsedWithOverrides.warnings.length > 0 && (
              <div className="mt-2 text-amber-300">
                {parsedWithOverrides.warnings.join(' ')}
              </div>
            )}
            {parsedWithOverrides.errors.length > 0 && (
              <div className="mt-2 text-rose-300">
                {parsedWithOverrides.errors.join(' ')}
              </div>
            )}
          </div>
          <div className="rounded border border-white/10 bg-black/30 p-2">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-2">Manual Adjustments</div>
            <div className="grid grid-cols-2 gap-2">
              <input
                className={rowClass}
                value={symbolOverride}
                onChange={(e) => setSymbolOverride(e.target.value)}
                placeholder={`Symbol (${parsedWithOverrides.draft.symbol || '--'})`}
              />
              <input
                className={rowClass}
                value={timeframesOverride}
                onChange={(e) => setTimeframesOverride(e.target.value)}
                placeholder={`Timeframes comma-separated (${(parsedWithOverrides.draft.timeframes || []).join(',') || '5m'})`}
              />
              <input
                className={rowClass}
                value={scheduleTimesOverride}
                onChange={(e) => setScheduleTimesOverride(e.target.value)}
                placeholder={`Schedule times HH:mm (${(parsedWithOverrides.draft.schedule?.times || []).join(',') || '--'})`}
              />
              <input
                className={rowClass}
                value={timezoneOverride}
                onChange={(e) => setTimezoneOverride(e.target.value)}
                placeholder={`Timezone (${parsedWithOverrides.draft.schedule?.timezone || 'America/New_York'})`}
              />
              <input
                className={rowClass}
                value={probabilityOverride}
                onChange={(e) => setProbabilityOverride(e.target.value)}
                placeholder={`Min probability (${parsedWithOverrides.draft.probabilityMin ?? '--'})`}
              />
              <input
                className={rowClass}
                value={targetPointsOverride}
                onChange={(e) => setTargetPointsOverride(e.target.value)}
                placeholder={`Target points (${parsedWithOverrides.draft.targetPoints ?? '--'})`}
              />
              <select
                className={rowClass}
                value={strategyOverride}
                onChange={(e) => setStrategyOverride(String(e.target.value || ''))}
              >
                <option value="">Strategy mode (auto)</option>
                <option value="scalp">scalp</option>
                <option value="day">day</option>
                <option value="swing">swing</option>
              </select>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
              <span className="text-gray-400">Weekdays:</span>
              {[
                { id: 1, label: 'Mon' },
                { id: 2, label: 'Tue' },
                { id: 3, label: 'Wed' },
                { id: 4, label: 'Thu' },
                { id: 5, label: 'Fri' }
              ].map((entry) => {
                const active = weekdaysOverride.includes(entry.id);
                return (
                  <button
                    type="button"
                    key={entry.id}
                    onClick={() => toggleWeekday(entry.id)}
                    className={`rounded border px-2 py-0.5 ${
                      active ? 'border-cyan-400/70 text-cyan-100' : 'border-white/10 text-gray-400'
                    }`}
                  >
                    {entry.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded border border-white/10 bg-black/30 p-2">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Intent Chat Preview</div>
            <div className="space-y-1 max-h-28 overflow-auto text-[11px]">
              <div className="text-gray-300"><span className="text-gray-500">user:</span> {prompt || '--'}</div>
              <div className="text-cyan-200 whitespace-pre-wrap">
                <span className="text-gray-500">assistant:</span>{' '}
                {[
                  `Draft ${parsedWithOverrides.draft.status || 'draft'} for ${parsedWithOverrides.draft.symbol || '--'} ${(parsedWithOverrides.draft.timeframes || []).join('/') || '--'}.`,
                  `Schedule ${(parsedWithOverrides.draft.schedule?.times || []).join(', ') || '--'} ${parsedWithOverrides.draft.schedule?.timezone || ''}`.trim(),
                  parsedWithOverrides.warnings.length > 0 ? parsedWithOverrides.warnings.join(' ') : ''
                ]
                  .filter(Boolean)
                  .join('\n')}
              </div>
            </div>
          </div>
          {error && <div className="text-rose-300">{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !parsedWithOverrides.ok || parsedWithOverrides.needsConfirmation}
            onClick={() => {
              void submit();
            }}
            className={`rounded border px-3 py-1.5 text-xs ${
              !saving && parsedWithOverrides.ok && !parsedWithOverrides.needsConfirmation
                ? 'border-cyan-400/60 text-cyan-100 hover:bg-cyan-500/10'
                : 'border-white/10 text-gray-500 cursor-not-allowed'
            }`}
          >
            {saving ? 'Saving...' : 'Create Intent'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(SignalIntentComposer);
