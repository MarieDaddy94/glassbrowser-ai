import React from 'react';
import type { SignalIntent } from '../../types';

type SignalIntentListProps = {
  intents: SignalIntent[];
  onPauseIntent: (id: string) => void;
  onResumeIntent: (id: string) => void;
};

const formatDue = (ts?: number | null) => {
  if (!ts || !Number.isFinite(ts)) return '--';
  const delta = Math.floor((ts - Date.now()) / 1000);
  if (delta <= 0) return 'due';
  if (delta < 60) return `in ${delta}s`;
  const min = Math.floor(delta / 60);
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  return `in ${hr}h`;
};

const SignalIntentList: React.FC<SignalIntentListProps> = ({ intents, onPauseIntent, onResumeIntent }) => {
  if (!Array.isArray(intents) || intents.length === 0) {
    return <div className="text-[11px] text-gray-500">No signal intents yet.</div>;
  }
  return (
    <div className="space-y-1">
      {intents.slice(0, 8).map((intent) => {
        const active = intent.status === 'active';
        return (
          <div
            key={intent.id}
            className="rounded border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <div className="text-gray-200 truncate">
                {intent.symbol} • {(intent.timeframes || []).join('/')} • {(intent.schedule?.times || []).join(', ') || '--'}
              </div>
              <div className="text-gray-500 truncate">
                {intent.rawPrompt || '--'}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className={`px-1.5 py-0.5 rounded border ${active ? 'border-emerald-400/40 text-emerald-300' : 'border-white/10 text-gray-400'}`}>
                {intent.status}
              </span>
              <span className="text-gray-500">{formatDue(intent.nextDueAtMs)}</span>
              {active ? (
                <button
                  type="button"
                  className="rounded border border-white/10 px-1.5 py-0.5 text-gray-300 hover:text-white"
                  onClick={() => onPauseIntent(intent.id)}
                >
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded border border-white/10 px-1.5 py-0.5 text-gray-300 hover:text-white"
                  onClick={() => onResumeIntent(intent.id)}
                >
                  Resume
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(SignalIntentList);

