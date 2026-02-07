import React from 'react';

type OnboardingGateProps = {
  open: boolean;
  startupPhase?: 'booting' | 'restoring' | 'settled';
  openaiReady: boolean;
  openaiState?: 'ready' | 'assumed_ready' | 'missing' | 'unknown';
  tradeLockerReady: boolean;
  tradeLockerState?: 'ready' | 'assumed_ready' | 'missing' | 'unknown';
  openaiBlockedReason?: string | null;
  tradeLockerBlockedReason?: string | null;
  mt5Available: boolean;
  onOpenSettings: () => void;
  onOpenTradeLocker: () => void;
  onOpenMt5: () => void;
  onRefresh: () => void;
};

const StatusPill: React.FC<{ state: 'ready' | 'assumed_ready' | 'missing' | 'unknown' | 'blocked'; label?: string }> = ({ state, label }) => {
  const text =
    label ||
    (state === 'ready'
      ? 'READY'
      : state === 'assumed_ready'
        ? 'RESTORED'
        : state === 'unknown'
          ? 'CHECKING'
        : state === 'blocked'
          ? 'BLOCKED'
          : 'MISSING');
  const isGood = state === 'ready' || state === 'assumed_ready';
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
        isGood ? 'border-emerald-400/50 text-emerald-100 bg-emerald-500/10' : 'border-amber-400/50 text-amber-100 bg-amber-500/10'
      }`}
    >
      {text}
    </span>
  );
};

const OnboardingGate: React.FC<OnboardingGateProps> = ({
  open,
  startupPhase = 'settled',
  openaiReady,
  openaiState = 'missing',
  tradeLockerReady,
  tradeLockerState = 'missing',
  openaiBlockedReason,
  tradeLockerBlockedReason,
  mt5Available,
  onOpenSettings,
  onOpenTradeLocker,
  onOpenMt5,
  onRefresh
}) => {
  if (!open) return null;
  const openaiBlocked = !!String(openaiBlockedReason || '').trim();
  const tradeLockerBlocked = !!String(tradeLockerBlockedReason || '').trim();
  const openaiPillState = openaiBlocked ? 'blocked' : openaiState;
  const tradeLockerPillState = tradeLockerBlocked ? 'blocked' : tradeLockerState;

  return (
    <div className="fixed top-16 left-1/2 z-[48] w-full max-w-3xl -translate-x-1/2 px-4 pointer-events-none">
      <div className="pointer-events-auto rounded-xl border border-amber-400/20 bg-[#0b0b0b]/95 shadow-2xl p-4">
        <div className="text-sm font-semibold text-white">Setup Check</div>
        <div className="text-xs text-gray-400 mt-1">
          Startup checks found missing or blocked dependencies. The app remains usable.
          {startupPhase !== 'settled' ? ' Restoring saved sign-in state...' : ''}
        </div>

        <div className="mt-4 space-y-3 text-xs">
          <div className="flex items-start justify-between gap-4 border border-white/10 rounded-lg p-3 bg-white/5">
            <div>
              <div className="text-sm text-white">OpenAI API key</div>
              {openaiBlocked ? (
                <div className="text-[11px] text-rose-300 mt-1">
                  OpenAI check blocked: {openaiBlockedReason}
                </div>
              ) : (
                <div className="text-[11px] text-gray-400 mt-1">
                  {openaiReady ? 'Loaded from secure storage.' : 'Required for GPT agents and signals.'}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <StatusPill state={openaiPillState} />
              <button
                type="button"
                onClick={onOpenSettings}
                className="px-2.5 py-1 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/10"
              >
                Open Settings
              </button>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 border border-white/10 rounded-lg p-3 bg-white/5">
            <div>
              <div className="text-sm text-white">TradeLocker account</div>
              {tradeLockerBlocked ? (
                <div className="text-[11px] text-rose-300 mt-1">
                  TradeLocker check blocked: {tradeLockerBlockedReason}
                </div>
              ) : (
                <div className="text-[11px] text-gray-400 mt-1">
                  {tradeLockerReady ? 'Saved credentials found. Auto-restore will run on startup.' : 'Set server, email, and select an account.'}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <StatusPill state={tradeLockerPillState} />
              <button
                type="button"
                onClick={onOpenSettings}
                className="px-2.5 py-1 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/10"
              >
                Settings
              </button>
              <button
                type="button"
                onClick={onOpenTradeLocker}
                className="px-2.5 py-1 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/10"
              >
                TradeLocker
              </button>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 border border-white/10 rounded-lg p-3 bg-white/5">
            <div>
              <div className="text-sm text-white">MT5 bridge (Coinexx)</div>
              <div className="text-[11px] text-gray-400 mt-1">
                Auto-connect uses the local bridge. Keep MT5 terminal running with the bridge enabled.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill state={mt5Available ? 'ready' : 'missing'} label={mt5Available ? 'READY' : 'UNAVAILABLE'} />
              <button
                type="button"
                onClick={onOpenMt5}
                className="px-2.5 py-1 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/10"
              >
                MT5 Panel
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="px-3 py-2 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 text-xs"
            >
              Recheck
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingGate;
