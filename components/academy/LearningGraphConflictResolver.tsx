import React, { useMemo, useState } from 'react';
import type { LessonConflictResolution } from '../../types';

type ConflictEntry = {
  conflictId: string;
  lessonAId: string;
  lessonBId: string;
  confidence?: number | null;
  reason?: string | null;
  policy?: LessonConflictResolution | null;
};

type Props = {
  conflicts: ConflictEntry[];
  onResolve: (policy: LessonConflictResolution) => void;
};

const asText = (value: any) => String(value || '').trim();

const LearningGraphConflictResolver: React.FC<Props> = ({ conflicts, onResolve }) => {
  const [activeConflictId, setActiveConflictId] = useState<string>('');
  const [policyType, setPolicyType] = useState<LessonConflictResolution['policyType']>('unresolved');
  const [precedence, setPrecedence] = useState<'lessonA_wins' | 'lessonB_wins' | ''>('');
  const [trigger, setTrigger] = useState<string>('');
  const [note, setNote] = useState<string>('');

  const active = useMemo(
    () => conflicts.find((entry) => String(entry.conflictId) === String(activeConflictId)) || conflicts[0] || null,
    [activeConflictId, conflicts]
  );

  React.useEffect(() => {
    if (!active) return;
    if (active.conflictId === activeConflictId) return;
    setActiveConflictId(active.conflictId);
    const existing = active.policy || null;
    if (existing) {
      setPolicyType(existing.policyType || 'unresolved');
      setPrecedence(existing.precedence || '');
      setTrigger(asText(existing.condition?.trigger));
      setNote(asText(existing.note));
      return;
    }
    setPolicyType('unresolved');
    setPrecedence('');
    setTrigger('');
    setNote('');
  }, [active, activeConflictId]);

  if (!active) {
    return (
      <div className="rounded border border-white/10 bg-black/30 p-2 text-[11px] text-gray-500">
        No lesson conflicts for this selection.
      </div>
    );
  }

  return (
    <div className="rounded border border-rose-400/30 bg-rose-500/10 p-2 space-y-2 text-[11px]">
      <div className="text-[10px] uppercase tracking-wider text-rose-200">Conflict Resolver</div>
      <label className="flex flex-col gap-1 text-gray-300">
        Conflict
        <select
          value={active.conflictId}
          onChange={(e) => setActiveConflictId(e.target.value)}
          className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
        >
          {conflicts.map((entry) => (
            <option key={entry.conflictId} value={entry.conflictId}>
              {entry.lessonAId} vs {entry.lessonBId}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-gray-300">
          Policy
          <select
            value={policyType}
            onChange={(e) => setPolicyType(e.target.value as LessonConflictResolution['policyType'])}
            className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
          >
            <option value="unresolved">Unresolved</option>
            <option value="conditional_override">Conditional override</option>
            <option value="precedence">Precedence</option>
            <option value="scope_split">Scope split</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-gray-300">
          Precedence
          <select
            value={precedence}
            onChange={(e) => setPrecedence(e.target.value as 'lessonA_wins' | 'lessonB_wins' | '')}
            className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
            disabled={policyType !== 'precedence'}
          >
            <option value="">None</option>
            <option value="lessonA_wins">Lesson A wins</option>
            <option value="lessonB_wins">Lesson B wins</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-gray-300">
        Trigger / Condition
        <input
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
          placeholder="e.g. only when 5m closes back above reclaim zone"
          className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
          disabled={policyType !== 'conditional_override'}
        />
      </label>
      <label className="flex flex-col gap-1 text-gray-300">
        Note
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional resolver note"
          className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
        />
      </label>
      <div className="flex items-center justify-between gap-2 text-[10px] text-rose-100">
        <span>Reason: {active.reason || '--'} • Confidence: {Number.isFinite(Number(active.confidence)) ? Number(active.confidence).toFixed(2) : '--'}</span>
        <button
          type="button"
          onClick={() => {
            const now = Date.now();
            onResolve({
              conflictId: active.conflictId,
              lessonAId: active.lessonAId,
              lessonBId: active.lessonBId,
              policyType,
              precedence: precedence || null,
              condition: policyType === 'conditional_override' ? { trigger: trigger || null } : null,
              note: note || null,
              updatedAtMs: now,
              createdAtMs: active.policy?.createdAtMs || now,
              source: 'learning_graph_conflict_resolver'
            });
          }}
          className="px-2 py-1 rounded border border-rose-300/50 text-rose-100 hover:bg-rose-500/20"
        >
          Apply Policy
        </button>
      </div>
    </div>
  );
};

export default LearningGraphConflictResolver;
