import React from 'react';
import { Copy, Download, Send, Target } from 'lucide-react';
import type { TrainingPackPanelProps } from './types';

const TrainingPackPanel: React.FC<TrainingPackPanelProps> = ({ ctx }) => {
  const {
    trainingEpisodes,
    trainingTrimmed,
    replayEnabled,
    replayBar,
    formatTs,
    copyTrainingJson,
    downloadTrainingJson,
    sendTrainingSummary,
    handleSendToWatchlist,
    watchlistMode,
    setWatchlistMode,
    watchlistApplyToChart,
    setWatchlistApplyToChart,
    watchlistStatus,
    watchlistError,
    sendBacktestSummary,
    onSendTrainingMessage,
    autoSummaryEnabled,
    setAutoSummaryEnabled,
    autoSummaryIntervalMin,
    setAutoSummaryIntervalMin,
    autoSummaryLastSentAt,
    formatAge,
    barsError
  } = ctx;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
      <div className="text-xs uppercase tracking-wider text-gray-400">Training Pack</div>
      <div className="text-[11px] text-gray-500">
        Episodes: {trainingEpisodes.length}
        {trainingTrimmed ? ' (trimmed)' : ''} | Replay locked to {replayEnabled ? formatTs(replayBar?.t || null) : 'live'}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copyTrainingJson}
          className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200 flex items-center gap-1"
        >
          <Copy size={14} /> Copy JSON
        </button>
        <button
          type="button"
          onClick={downloadTrainingJson}
          className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200 flex items-center gap-1"
        >
          <Download size={14} /> Download
        </button>
        <button
          type="button"
          onClick={sendTrainingSummary}
          className="px-2 py-1 rounded-md text-xs bg-emerald-600/80 hover:bg-emerald-600 text-white flex items-center gap-1"
        >
          <Send size={14} /> Send to Agent
        </button>
        <button
          type="button"
          onClick={handleSendToWatchlist}
          className="px-2 py-1 rounded-md text-xs bg-teal-600/80 hover:bg-teal-600 text-white flex items-center gap-1"
        >
          <Target size={14} /> Send to Watchlist
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-300">
        <label className="flex items-center gap-2">
          <span className="text-gray-500">Watchlist mode</span>
          <select
            value={watchlistMode}
            onChange={(e) => setWatchlistMode(e.target.value as 'suggest' | 'paper' | 'live')}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[11px] text-gray-100"
          >
            <option value="suggest">Suggest</option>
            <option value="paper">Paper</option>
            <option value="live">Live</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={watchlistApplyToChart}
            onChange={(e) => setWatchlistApplyToChart(e.target.checked)}
          />
          <span>Apply to chart overlays</span>
        </label>
      </div>
      {watchlistStatus && <div className="text-[11px] text-emerald-300">{watchlistStatus}</div>}
      {watchlistError && <div className="text-[11px] text-red-300">{watchlistError}</div>}
      <div className="mt-3 border-t border-white/10 pt-3 space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-gray-500">Auto Summary</div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            onClick={sendBacktestSummary}
            disabled={!onSendTrainingMessage}
            className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send Summary
          </button>
          <label className="flex items-center gap-2 text-[11px] text-gray-300">
            <input
              type="checkbox"
              checked={autoSummaryEnabled}
              onChange={(e) => setAutoSummaryEnabled(e.target.checked)}
              disabled={!onSendTrainingMessage}
            />
            Auto-send
          </label>
          <div className="flex items-center gap-2 text-[11px] text-gray-300">
            <input
              type="number"
              min={1}
              max={240}
              value={autoSummaryIntervalMin}
              onChange={(e) => {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw)) return;
                setAutoSummaryIntervalMin(Math.max(1, Math.min(240, Math.floor(raw))));
              }}
              className="w-16 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
              disabled={!onSendTrainingMessage}
            />
            <span className="text-gray-500">min</span>
          </div>
          {autoSummaryLastSentAt && (
            <span className="text-[10px] text-gray-500">Last {formatAge(autoSummaryLastSentAt)} ago</span>
          )}
        </div>
        <div className="text-[10px] text-gray-500">
          Sends the summary only when it changes.
        </div>
      </div>
      {barsError && <div className="text-[11px] text-red-400">{barsError}</div>}
    </div>
  );
};

export default React.memo(TrainingPackPanel);

