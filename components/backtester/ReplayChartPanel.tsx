import React from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { ReplayChartPanelProps } from './types';

const ReplayChartPanel: React.FC<ReplayChartPanelProps> = ({ ctx }) => {
  const {
    replayEnabled,
    runActionOr,
    setReplayEnabled,
    setReplayIndex,
    isPlaying,
    setIsPlaying,
    bars,
    playSpeed,
    setPlaySpeed,
    tieBreaker,
    setTieBreaker,
    replayBar,
    formatTs,
    replayCutoffIndex,
    canvasWrapRef,
    canvasRef,
    handleCanvasClick,
    lastBar,
    formatPrice
  } = ctx;

  return (
    <>
      <div
        className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-3"
        style={{ contentVisibility: 'auto', containIntrinsicSize: '640px' }}
      >
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-300">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={replayEnabled}
              onChange={(e) => runActionOr('backtester.replay.set', { enabled: e.target.checked }, () => setReplayEnabled(e.target.checked))}
            />
            Replay Mode
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => runActionOr('backtester.replay.set', { replayIndex: 0 }, () => setReplayIndex(0))}
              className="p-1 rounded bg-white/10 hover:bg-white/20 text-gray-200"
              title="Jump to start"
            >
              <SkipBack size={14} />
            </button>
            <button
              type="button"
              onClick={() => runActionOr('backtester.replay.play.set', { playing: !isPlaying }, () => setIsPlaying((prev: boolean) => !prev))}
              className="p-1 rounded bg-white/10 hover:bg-white/20 text-gray-200"
              title={isPlaying ? 'Pause replay' : 'Play replay'}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              type="button"
              onClick={() =>
                runActionOr('backtester.replay.step', { stepDelta: 1 }, () => {
                  const maxIndex = Math.max(0, bars.length - 1);
                  setReplayIndex((prev: number) => Math.min(prev + 1, maxIndex));
                })
              }
              className="p-1 rounded bg-white/10 hover:bg-white/20 text-gray-200"
              title="Step forward"
            >
              <SkipForward size={14} />
            </button>
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              Speed
              <input
                type="number"
                min={1}
                max={30}
                value={playSpeed}
                onChange={(e) =>
                  runActionOr(
                    'backtester.replay.set',
                    { playSpeed: Math.max(1, Math.min(30, Number(e.target.value) || 1)) },
                    () => setPlaySpeed(Math.max(1, Math.min(30, Number(e.target.value) || 1)))
                  )
                }
                className="w-16 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
              />
              bars/s
            </div>
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              Tie-breaker
              <select
                value={tieBreaker}
                onChange={(e) => setTieBreaker(e.target.value === 'tp' ? 'tp' : 'sl')}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
              >
                <option value="sl">SL</option>
                <option value="tp">TP</option>
              </select>
            </div>
          </div>
          <div className="text-[11px] text-gray-400">{replayBar ? `Replay: ${formatTs(replayBar.t)}` : 'Replay: --'}</div>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, bars.length - 1)}
          value={replayCutoffIndex}
          onChange={(e) => runActionOr('backtester.replay.set', { replayIndex: Number(e.target.value) }, () => setReplayIndex(Number(e.target.value)))}
          className="w-full accent-emerald-400"
          disabled={bars.length === 0}
        />
      </div>

      <div className="bg-black/60 border border-white/10 rounded-xl p-2">
        <div ref={canvasWrapRef} className="h-[340px] w-full">
          <canvas ref={canvasRef} className="w-full h-full cursor-crosshair" onClick={handleCanvasClick} />
        </div>
        <div className="mt-2 text-[11px] text-gray-500">
          {lastBar ? `Last bar: ${formatTs(lastBar.t)} | Close ${formatPrice(lastBar.c)}` : 'No bars to display.'}
        </div>
      </div>
    </>
  );
};

export default React.memo(ReplayChartPanel);
