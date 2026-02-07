import React from 'react';
import { Clipboard } from 'lucide-react';
import type { SignalWarmupSectionProps } from './types';

const SignalAndWarmupSection: React.FC<SignalWarmupSectionProps> = ({ ctx }) => {
  const {
    onSignalTelegramChange,
    signalTelegramResolved,
    signalTelegramMissing,
    handleSignalTelegramPaste,
    signalTelegramStatuses,
    toggleList,
    parseNumberInput,
    DEFAULT_SIGNAL_TELEGRAM_SETTINGS,
    onSignalSnapshotWarmupChange,
    signalSnapshotWarmupResolved,
    signalSnapshotWarmupTimeoutSec,
    DEFAULT_SIGNAL_SNAPSHOT_WARMUP_SETTINGS,
    secretsError,
  } = ctx;

  return (
    <>
      {onSignalTelegramChange && (
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Signal Telegram</label>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-500">Route signal alerts to Telegram.</span>
            <button
              type="button"
              onClick={() => onSignalTelegramChange({ enabled: !signalTelegramResolved.enabled })}
              className={`px-2 py-1 rounded border text-[11px] ${signalTelegramResolved.enabled ? 'border-emerald-400/60 text-emerald-100 bg-emerald-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}
            >
              {signalTelegramResolved.enabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <input
                type="password"
                value={signalTelegramResolved.botToken}
                onChange={(e) => onSignalTelegramChange({ botToken: e.target.value })}
                onContextMenu={(e) => {
                  e.preventDefault();
                  void handleSignalTelegramPaste('botToken');
                }}
                placeholder="Bot Token"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 pr-9 text-sm text-gray-100 focus:outline-none focus:border-cyan-400/60 transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => void handleSignalTelegramPaste('botToken')}
                className="absolute right-2 top-2 text-gray-500 hover:text-gray-200"
                title="Paste from clipboard"
              >
                <Clipboard size={14} />
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                value={signalTelegramResolved.chatId}
                onChange={(e) => onSignalTelegramChange({ chatId: e.target.value })}
                onContextMenu={(e) => {
                  e.preventDefault();
                  void handleSignalTelegramPaste('chatId');
                }}
                placeholder="Chat ID"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 pr-9 text-sm text-gray-100 focus:outline-none focus:border-cyan-400/60 transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => void handleSignalTelegramPaste('chatId')}
                className="absolute right-2 top-2 text-gray-500 hover:text-gray-200"
                title="Paste from clipboard"
              >
                <Clipboard size={14} />
              </button>
            </div>
          </div>
          {signalTelegramMissing && (
            <div className="text-[11px] text-amber-300">Bot token and chat id required to send.</div>
          )}
          <div className="text-[11px] text-gray-500">Send on status:</div>
          <div className="flex flex-wrap gap-2">
            {signalTelegramStatuses.map((status: any) => {
              const active = signalTelegramResolved.sendOn.includes(status);
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => onSignalTelegramChange({ sendOn: toggleList(signalTelegramResolved.sendOn, status) })}
                  className={`px-2 py-1 rounded border text-[11px] ${active ? 'border-cyan-400/60 text-cyan-100 bg-cyan-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}
                >
                  {status}
                </button>
              );
            })}
          </div>
          <div className="mt-2 border-t border-white/5 pt-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-gray-500">Alerts (auto push)</span>
              <button
                type="button"
                onClick={() => onSignalTelegramChange({ alertsEnabled: !signalTelegramResolved.alertsEnabled })}
                className={`px-2 py-1 rounded border text-[11px] ${signalTelegramResolved.alertsEnabled ? 'border-emerald-400/60 text-emerald-100 bg-emerald-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}
              >
                {signalTelegramResolved.alertsEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onSignalTelegramChange({ alertTrades: !signalTelegramResolved.alertTrades })} className={`px-2 py-1 rounded border text-[11px] ${signalTelegramResolved.alertTrades ? 'border-cyan-400/60 text-cyan-100 bg-cyan-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>Trades</button>
              <button type="button" onClick={() => onSignalTelegramChange({ alertTpSl: !signalTelegramResolved.alertTpSl })} className={`px-2 py-1 rounded border text-[11px] ${signalTelegramResolved.alertTpSl ? 'border-cyan-400/60 text-cyan-100 bg-cyan-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>TP/SL</button>
              <button type="button" onClick={() => onSignalTelegramChange({ alertDrawdown: !signalTelegramResolved.alertDrawdown })} className={`px-2 py-1 rounded border text-[11px] ${signalTelegramResolved.alertDrawdown ? 'border-amber-400/60 text-amber-100 bg-amber-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>Drawdown</button>
              <button type="button" onClick={() => onSignalTelegramChange({ alertAgentConfidence: !signalTelegramResolved.alertAgentConfidence })} className={`px-2 py-1 rounded border text-[11px] ${signalTelegramResolved.alertAgentConfidence ? 'border-amber-400/60 text-amber-100 bg-amber-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>Agent Confidence</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Confidence drop %</label>
                <input
                  type="number"
                  step="1"
                  value={signalTelegramResolved.alertConfidenceDrop ?? ''}
                  onChange={(e) => {
                    const value = parseNumberInput(e.target.value);
                    onSignalTelegramChange({ alertConfidenceDrop: value == null ? DEFAULT_SIGNAL_TELEGRAM_SETTINGS.alertConfidenceDrop : value });
                  }}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-cyan-400/60 transition-colors font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Drawdown %</label>
                <input
                  type="number"
                  step="1"
                  value={signalTelegramResolved.alertDrawdownPct ?? ''}
                  onChange={(e) => {
                    const value = parseNumberInput(e.target.value);
                    onSignalTelegramChange({ alertDrawdownPct: value == null ? DEFAULT_SIGNAL_TELEGRAM_SETTINGS.alertDrawdownPct : value });
                  }}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-cyan-400/60 transition-colors font-mono"
                />
              </div>
            </div>
          </div>
          <div className="mt-2 border-t border-white/5 pt-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-gray-500">Command center (remote actions)</span>
              <button
                type="button"
                onClick={() => onSignalTelegramChange({ commandsEnabled: !signalTelegramResolved.commandsEnabled })}
                className={`px-2 py-1 rounded border text-[11px] ${signalTelegramResolved.commandsEnabled ? 'border-emerald-400/60 text-emerald-100 bg-emerald-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}
              >
                {signalTelegramResolved.commandsEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-gray-500 uppercase">Mode</span>
              <button type="button" onClick={() => onSignalTelegramChange({ commandMode: 'read' })} className={`px-2 py-1 rounded border text-[11px] ${signalTelegramResolved.commandMode === 'read' ? 'border-cyan-400/60 text-cyan-100 bg-cyan-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>READ</button>
              <button type="button" onClick={() => onSignalTelegramChange({ commandMode: 'manage' })} className={`px-2 py-1 rounded border text-[11px] ${signalTelegramResolved.commandMode === 'manage' ? 'border-amber-400/60 text-amber-100 bg-amber-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>MANAGE</button>
            </div>
            <input
              type="text"
              value={signalTelegramResolved.commandPassphrase || ''}
              onChange={(e) => onSignalTelegramChange({ commandPassphrase: e.target.value })}
              placeholder="Passphrase (optional)"
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-cyan-400/60 transition-colors font-mono"
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onSignalTelegramChange({ allowChart: !signalTelegramResolved.allowChart })} className={`px-2 py-1 rounded border text-[11px] ${signalTelegramResolved.allowChart ? 'border-cyan-400/60 text-cyan-100 bg-cyan-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>Chart</button>
              <button type="button" onClick={() => onSignalTelegramChange({ allowStatus: !signalTelegramResolved.allowStatus })} className={`px-2 py-1 rounded border text-[11px] ${signalTelegramResolved.allowStatus ? 'border-cyan-400/60 text-cyan-100 bg-cyan-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>Status</button>
              <button type="button" onClick={() => onSignalTelegramChange({ allowManage: !signalTelegramResolved.allowManage })} className={`px-2 py-1 rounded border text-[11px] ${signalTelegramResolved.allowManage ? 'border-amber-400/60 text-amber-100 bg-amber-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>Manage</button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-gray-500">Inline signal actions</span>
              <button type="button" onClick={() => onSignalTelegramChange({ inlineActionsEnabled: !signalTelegramResolved.inlineActionsEnabled })} className={`px-2 py-1 rounded border text-[11px] ${signalTelegramResolved.inlineActionsEnabled ? 'border-cyan-400/60 text-cyan-100 bg-cyan-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>{signalTelegramResolved.inlineActionsEnabled ? 'ON' : 'OFF'}</button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-gray-500">Confirmations</span>
              <button type="button" onClick={() => onSignalTelegramChange({ confirmationsEnabled: !signalTelegramResolved.confirmationsEnabled })} className={`px-2 py-1 rounded border text-[11px] ${signalTelegramResolved.confirmationsEnabled ? 'border-emerald-400/60 text-emerald-100 bg-emerald-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>{signalTelegramResolved.confirmationsEnabled ? 'ON' : 'OFF'}</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Confirm timeout (sec)</label>
                <input
                  type="number"
                  step="1"
                  value={signalTelegramResolved.confirmationTimeoutSec ?? ''}
                  onChange={(e) => {
                    const value = parseNumberInput(e.target.value);
                    onSignalTelegramChange({ confirmationTimeoutSec: value == null ? DEFAULT_SIGNAL_TELEGRAM_SETTINGS.confirmationTimeoutSec : value });
                  }}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-cyan-400/60 transition-colors font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Inline notes</label>
                <div className="text-[10px] text-gray-500 pt-2">Inline actions require MANAGE + Manage enabled.</div>
              </div>
            </div>
            {signalTelegramResolved.commandMode === 'manage' && !signalTelegramResolved.commandPassphrase ? (
              <div className="text-[10px] text-amber-300">Add a passphrase before enabling manage actions.</div>
            ) : null}
          </div>
          <div className="mt-2 border-t border-white/5 pt-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-gray-500">Digests</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onSignalTelegramChange({ digestDailyEnabled: !signalTelegramResolved.digestDailyEnabled })} className={`px-2 py-1 rounded border text-[11px] ${signalTelegramResolved.digestDailyEnabled ? 'border-cyan-400/60 text-cyan-100 bg-cyan-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>Daily</button>
                <button type="button" onClick={() => onSignalTelegramChange({ digestWeeklyEnabled: !signalTelegramResolved.digestWeeklyEnabled })} className={`px-2 py-1 rounded border text-[11px] ${signalTelegramResolved.digestWeeklyEnabled ? 'border-cyan-400/60 text-cyan-100 bg-cyan-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>Weekly</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Daily hour (local)</label>
                <input
                  type="number"
                  step="1"
                  value={signalTelegramResolved.digestHourLocal ?? ''}
                  onChange={(e) => {
                    const value = parseNumberInput(e.target.value);
                    onSignalTelegramChange({ digestHourLocal: value == null ? DEFAULT_SIGNAL_TELEGRAM_SETTINGS.digestHourLocal : value });
                  }}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-cyan-400/60 transition-colors font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Weekly day (0-6)</label>
                <input
                  type="number"
                  step="1"
                  value={signalTelegramResolved.digestWeeklyDay ?? ''}
                  onChange={(e) => {
                    const value = parseNumberInput(e.target.value);
                    onSignalTelegramChange({ digestWeeklyDay: value == null ? DEFAULT_SIGNAL_TELEGRAM_SETTINGS.digestWeeklyDay : value });
                  }}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-cyan-400/60 transition-colors font-mono"
                />
              </div>
            </div>
            <div className="text-[10px] text-gray-500">Weekly day uses 0=Sun, 1=Mon, ... 6=Sat.</div>
          </div>
        </div>
      )}

      {onSignalSnapshotWarmupChange && (
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Signal Snapshot Warm-up</label>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Default bars</label>
              <input type="number" step="1" min={30} value={signalSnapshotWarmupResolved.barsDefault ?? ''} onChange={(e) => {
                const value = parseNumberInput(e.target.value);
                onSignalSnapshotWarmupChange({ barsDefault: value == null ? DEFAULT_SIGNAL_SNAPSHOT_WARMUP_SETTINGS.barsDefault : value });
              }} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-cyan-400/60 transition-colors font-mono" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">1D bars</label>
              <input type="number" step="1" min={10} value={signalSnapshotWarmupResolved.bars1d ?? ''} onChange={(e) => {
                const value = parseNumberInput(e.target.value);
                onSignalSnapshotWarmupChange({ bars1d: value == null ? DEFAULT_SIGNAL_SNAPSHOT_WARMUP_SETTINGS.bars1d : value });
              }} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-cyan-400/60 transition-colors font-mono" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">1W bars</label>
              <input type="number" step="1" min={4} value={signalSnapshotWarmupResolved.bars1w ?? ''} onChange={(e) => {
                const value = parseNumberInput(e.target.value);
                onSignalSnapshotWarmupChange({ bars1w: value == null ? DEFAULT_SIGNAL_SNAPSHOT_WARMUP_SETTINGS.bars1w : value });
              }} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-cyan-400/60 transition-colors font-mono" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Warm-up timeout (sec)</label>
              <input type="number" step="1" min={10} value={signalSnapshotWarmupTimeoutSec ?? ''} onChange={(e) => {
                const value = parseNumberInput(e.target.value);
                onSignalSnapshotWarmupChange({ timeoutMs: value == null ? DEFAULT_SIGNAL_SNAPSHOT_WARMUP_SETTINGS.timeoutMs : Math.max(1000, Math.round(value * 1000)) });
              }} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-cyan-400/60 transition-colors font-mono" />
            </div>
          </div>
          <div className="text-[10px] text-gray-500">Signals wait until each timeframe meets these bars (then scans run).</div>
        </div>
      )}

      {secretsError && <div className="text-[10px] text-red-400">{secretsError}</div>}
    </>
  );
};

export default React.memo(SignalAndWarmupSection);
