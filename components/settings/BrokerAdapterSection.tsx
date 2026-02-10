import React from 'react';
import { Link2, Lock } from 'lucide-react';
import type { BrokerAdapterSectionProps } from './types';

const BrokerAdapterSection: React.FC<BrokerAdapterSectionProps> = ({ ctx }) => {
  const {
    brokerStatusMeta,
    brokerError,
    brokerActiveId,
    activeBroker,
    brokerList,
    handleBrokerSelect,
    brokerCaps,
    refreshBrokerInfo,
    brokerStatus,
    parseNumberInput,

    tlStatusMeta,
    electronBridgeAvailable,
    tlBridgeAvailable,
    tlEncryptionAvailable,
    tlLastError,
    tlActiveProfileId,
    handleTradeLockerProfileSelect,
    tlProfiles,
    upsertTradeLockerProfile,
    handleTradeLockerProfileRemove,
    tlEnv,
    setTlEnv,
    tlServer,
    setTlServer,
    tlEmail,
    setTlEmail,
    tlHasSavedPassword,
    tlShowPassword,
    setTlShowPassword,
    tlPassword,
    setTlPassword,
    tlHasSavedDeveloperKey,
    tlShowDeveloperKey,
    setTlShowDeveloperKey,
    tlDeveloperKey,
    setTlDeveloperKey,
    tlRememberPassword,
    setTlRememberPassword,
    tlRememberDeveloperKey,
    setTlRememberDeveloperKey,
    tlAutoConnect,
    setTlAutoConnect,
    tlConnected,
    tlConnecting,
    handleTradeLockerConnect,
    handleTradeLockerDisconnect,
    handleTradeLockerRefreshAccounts,
    handleTradeLockerClearSecrets,
    tlSelectedAccountId,
    handleTradeLockerAccountSelected,
    tlAccounts,
    tlSelectedAccNum,
    tlDefaultOrderQty,
    setTlDefaultOrderQty,
    tlDefaultOrderType,
    setTlDefaultOrderType,
    tlTradingEnabled,
    handleTradingToggle,
    tlAutoPilotEnabled,
    handleAutoPilotToggle,
    tlStreamingEnabled,
    setTlStreamingEnabled,
    tlStreamingUrl,
    setTlStreamingUrl,
    tlStreamingAutoReconnect,
    setTlStreamingAutoReconnect,
    tlStreamingSubscribe,
    setTlStreamingSubscribe,
    tlDebugEnabled,
    setTlDebugEnabled,
    tlDebugMaxBytesMb,
    setTlDebugMaxBytesMb,
    tlDebugMaxFiles,
    setTlDebugMaxFiles,
    tlDebugTextLimit,
    setTlDebugTextLimit,

    brokerLinkDraft,
    setBrokerLinkDraft,
    brokerLinkSymbolMapText,
    setBrokerLinkSymbolMapText,
  } = ctx;

  return (
    <>
      <div className="pt-2 border-t border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <Lock size={12} className="text-blue-300" />
            Broker Adapter
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono">
            <span className={`w-2 h-2 rounded-full ${brokerStatusMeta.dot}`} />
            <span>{brokerStatusMeta.label}</span>
          </div>
        </div>

        {brokerError ? (
          <div className="text-[10px] text-red-400/90 font-mono bg-black/20 border border-red-500/20 rounded-lg p-2">{brokerError}</div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Active Broker</label>
            <select
              value={brokerActiveId || activeBroker?.id || ''}
              onChange={(e) => handleBrokerSelect(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 transition-colors font-mono"
            >
              {brokerList.length === 0 ? (
                <option value="">(none)</option>
              ) : (
                brokerList.map((broker: any) => (
                  <option key={broker.id} value={broker.id}>{broker.label || broker.id}</option>
                ))
              )}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Capabilities</label>
            <div className="min-h-[36px] rounded-lg bg-black/30 border border-white/10 px-2 py-1 text-[10px] text-gray-300 flex flex-wrap gap-1 items-center">
              {brokerCaps.length > 0 ? (
                brokerCaps.map((cap: any) => <span key={cap} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 uppercase">{cap}</span>)
              ) : (
                <span className="text-gray-500">None</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-[10px] text-gray-500">
          <div className="font-mono">Kind: {activeBroker?.kind || '--'}{activeBroker?.id ? ` | ID ${activeBroker.id}` : ''}</div>
          <button onClick={() => void refreshBrokerInfo()} className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300" title="Refresh broker status">Refresh</button>
        </div>

        {brokerStatus?.lastError ? (
          <div className="text-[10px] text-red-400/90 font-mono bg-black/20 border border-red-500/20 rounded-lg p-2">{String(brokerStatus.lastError)}</div>
        ) : null}
        {activeBroker?.id === 'sim' ? (
          <div className="text-[10px] text-gray-500">
            Sim/Paper is a stub adapter (no live data/execution yet). Switch back to TradeLocker for broker data.
          </div>
        ) : null}
      </div>

      <div className="pt-2 border-t border-white/5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <Lock size={12} className="text-purple-400" />
            TradeLocker
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono">
            <span className={`w-2 h-2 rounded-full ${tlStatusMeta.dot}`} />
            <span>{tlStatusMeta.label}</span>
          </div>
        </div>

        <div className="text-[10px] text-gray-600 font-mono flex justify-between">
          <span>Electron: {electronBridgeAvailable ? 'OK' : 'MISSING'}</span>
          <span>TradeLocker IPC: {tlBridgeAvailable ? 'OK' : 'MISSING'}</span>
        </div>

        {!tlEncryptionAvailable && (
          <div className="text-[10px] text-yellow-400/90">Secret storage encryption is not available on this machine; passwords won’t be saved.</div>
        )}

        {tlLastError && (
          <div className="text-[10px] text-red-400/90 font-mono bg-black/20 border border-red-500/20 rounded-lg p-2">{tlLastError}</div>
        )}

        <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Saved Logins</div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={tlActiveProfileId} onChange={(e) => handleTradeLockerProfileSelect(e.target.value)} className="flex-1 min-w-[180px] bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono">
              <option value="">Select saved login…</option>
              {tlProfiles.map((profile: any) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                  {Number.isFinite(Number(profile?.accountId)) && Number(profile.accountId) > 0
                    ? ` • acct ${Number(profile.accountId)}${Number.isFinite(Number(profile?.accNum)) && Number(profile.accNum) > 0 ? `/${Number(profile.accNum)}` : ''}`
                    : ''}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => upsertTradeLockerProfile({ setActive: true })} className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-white/10 hover:bg-white/15 text-gray-100 transition-colors">Save Login</button>
            <button type="button" onClick={() => handleTradeLockerProfileRemove(tlActiveProfileId)} disabled={!tlActiveProfileId} className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-white/10 hover:bg-white/15 text-gray-100 transition-colors disabled:opacity-40">Remove</button>
          </div>
          <div className="text-[10px] text-gray-500">
            Profiles store env/server/email plus the selected account. Passwords and developer keys stay in encrypted storage when "Remember" is enabled.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Environment</label>
            <select value={tlEnv} onChange={(e) => setTlEnv(e.target.value === 'live' ? 'live' : 'demo')} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono">
              <option value="demo">demo</option>
              <option value="live">live</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Server</label>
            <input type="text" value={tlServer} onChange={(e) => setTlServer(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono" placeholder="Your broker server (e.g., GATESFX)" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Email</label>
          <input type="text" value={tlEmail} onChange={(e) => setTlEmail(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono" placeholder="email@example.com" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Password {tlHasSavedPassword ? <span className="text-green-500/70">(saved)</span> : null}</label>
            <div className="relative">
              <input type={tlShowPassword ? 'text' : 'password'} value={tlPassword} onChange={(e) => setTlPassword(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 pr-9 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono" placeholder={tlHasSavedPassword ? 'Leave blank to use saved' : '••••••••'} />
              <button type="button" onClick={() => setTlShowPassword((v: boolean) => !v)} className="absolute right-2 top-2 text-gray-500 hover:text-gray-200" title={tlShowPassword ? 'Hide' : 'Show'}>
                {tlShowPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Developer Key (optional) {tlHasSavedDeveloperKey ? <span className="text-green-500/70">(saved)</span> : null}</label>
            <div className="relative">
              <input type={tlShowDeveloperKey ? 'text' : 'password'} value={tlDeveloperKey} onChange={(e) => setTlDeveloperKey(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 pr-9 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono" placeholder={tlHasSavedDeveloperKey ? 'Leave blank to use saved' : 'tl-... (optional)'} />
              <button type="button" onClick={() => setTlShowDeveloperKey((v: boolean) => !v)} className="absolute right-2 top-2 text-gray-500 hover:text-gray-200" title={tlShowDeveloperKey ? 'Hide' : 'Show'}>
                {tlShowDeveloperKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-[11px] text-gray-400">
          <label className="flex items-center gap-2 select-none"><input type="checkbox" checked={tlRememberPassword} onChange={(e) => setTlRememberPassword(e.target.checked)} />Remember password (encrypted)</label>
          <label className="flex items-center gap-2 select-none"><input type="checkbox" checked={tlRememberDeveloperKey} onChange={(e) => setTlRememberDeveloperKey(e.target.checked)} />Remember developer key (encrypted)</label>
        </div>

        <div className="flex items-center justify-between gap-3 text-[11px] text-gray-400">
          <label className="flex items-center gap-2 select-none"><input type="checkbox" checked={tlAutoConnect} onChange={(e) => setTlAutoConnect(e.target.checked)} />Auto-connect on launch</label>
          {tlAutoConnect && !tlHasSavedPassword && <span className="text-[10px] text-yellow-400/90 font-mono">Requires saved password</span>}
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={handleTradeLockerConnect} disabled={tlConnecting || tlConnected} className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-purple-600/80 hover:bg-purple-600 text-white transition-colors disabled:opacity-40">Connect</button>
          <button type="button" onClick={handleTradeLockerDisconnect} disabled={!tlConnected} className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-white/10 hover:bg-white/15 text-gray-100 transition-colors disabled:opacity-40">Disconnect</button>
          <button type="button" onClick={handleTradeLockerRefreshAccounts} disabled={!tlConnected} className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-white/10 hover:bg-white/15 text-gray-100 transition-colors disabled:opacity-40">Accounts</button>
          <button type="button" onClick={handleTradeLockerClearSecrets} className="ml-auto px-3 py-2 rounded-lg text-[11px] font-semibold bg-white/10 hover:bg-white/15 text-gray-100 transition-colors" title="Clear saved TradeLocker password/developer key">Clear Saved</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Account</label>
            <select value={tlSelectedAccountId} onChange={(e) => handleTradeLockerAccountSelected(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono">
              <option value="">Select account…</option>
              {tlAccounts.map((a: any) => (
                <option key={String(a?.id)} value={String(a?.id)}>{String(a?.name || a?.id)} {a?.currency ? `(${a.currency})` : ''}</option>
              ))}
            </select>
            <div className="text-[10px] text-gray-600 font-mono">accNum: {tlSelectedAccNum || '--'}</div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Default Qty (lots)</label>
            <input type="number" min={0.01} step={0.01} value={tlDefaultOrderQty} onChange={(e) => setTlDefaultOrderQty(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono" />
            <div className="text-[10px] text-gray-600 font-mono">Order type: {tlDefaultOrderType.toUpperCase()}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-[11px] text-gray-400 select-none"><input type="checkbox" checked={tlTradingEnabled} onChange={(e) => handleTradingToggle(e.target.checked)} />Enable trading (place/close)</label>
          <label className="flex items-center gap-2 text-[11px] text-gray-400 select-none"><input type="checkbox" checked={tlAutoPilotEnabled} onChange={(e) => handleAutoPilotToggle(e.target.checked)} />Allow AutoPilot execution</label>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Default Order Type</label>
          <select value={tlDefaultOrderType} onChange={(e) => { const raw = e.target.value; setTlDefaultOrderType(raw === 'limit' ? 'limit' : raw === 'stop' ? 'stop' : 'market'); }} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono">
            <option value="market">market</option>
            <option value="limit">limit</option>
            <option value="stop">stop</option>
          </select>
        </div>

        <div className="pt-2 border-t border-white/5 space-y-2">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Streaming (Experimental)</label>
          <label className="flex items-center gap-2 text-[11px] text-gray-400 select-none"><input type="checkbox" checked={tlStreamingEnabled} onChange={(e) => setTlStreamingEnabled(e.target.checked)} />Enable TradeLocker streams (low-latency updates)</label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Stream URL (optional)</label>
              <input type="text" value={tlStreamingUrl} onChange={(e) => setTlStreamingUrl(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono" placeholder="wss://demo.tradelocker.com/streaming" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Auto Reconnect</label>
              <label className="flex items-center gap-2 text-[11px] text-gray-400 select-none"><input type="checkbox" checked={tlStreamingAutoReconnect} onChange={(e) => setTlStreamingAutoReconnect(e.target.checked)} />Auto-reconnect on disconnect</label>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Subscribe JSON (optional)</label>
            <textarea rows={2} value={tlStreamingSubscribe} onChange={(e) => setTlStreamingSubscribe(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono" placeholder='{"type":"subscribe","channels":["quotes","positions","orders","account"]}' />
          </div>
          <div className="text-[10px] text-gray-600">
            Leave URL blank to auto-derive from the TradeLocker domain. Subscribe JSON is optional; defaults will be used if empty.
          </div>
        </div>

        <div className="pt-2 border-t border-white/5 space-y-2">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Order Debug Logging</label>
          <label className="flex items-center gap-2 text-[11px] text-gray-400 select-none"><input type="checkbox" checked={tlDebugEnabled} onChange={(e) => setTlDebugEnabled(e.target.checked)} />Enable TradeLocker order debug log</label>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><label className="text-[10px] text-gray-500 uppercase tracking-wider">Max MB</label><input type="number" min={1} step={1} value={tlDebugMaxBytesMb} onChange={(e) => setTlDebugMaxBytesMb(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono" /></div>
            <div className="space-y-1.5"><label className="text-[10px] text-gray-500 uppercase tracking-wider">Max Files</label><input type="number" min={1} step={1} value={tlDebugMaxFiles} onChange={(e) => setTlDebugMaxFiles(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono" /></div>
            <div className="space-y-1.5"><label className="text-[10px] text-gray-500 uppercase tracking-wider">Text Limit</label><input type="number" min={500} step={100} value={tlDebugTextLimit} onChange={(e) => setTlDebugTextLimit(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono" /></div>
          </div>
          <div className="text-[10px] text-gray-600">
            Debug logs are rotated and redacted; disable this if you don't need order troubleshooting.
          </div>
        </div>
        <div className="text-[10px] text-gray-600 leading-relaxed">
          TradeLocker credentials are never stored in browser localStorage. If you enable "Remember", they're encrypted via Electron safe storage.
        </div>
      </div>

      <div className="pt-2 border-t border-white/5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <Link2 size={12} className="text-emerald-300" />
            Broker Link
          </div>
          <label className="flex items-center gap-2 text-[11px] text-gray-400 select-none">
            <input type="checkbox" checked={brokerLinkDraft.enabled} onChange={(e) => setBrokerLinkDraft((prev: any) => ({ ...prev, enabled: e.target.checked }))} />
            Enabled
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Mirror Mode</label>
            <select value={brokerLinkDraft.mirrorMode} onChange={(e) => { const raw = e.target.value; const mode = raw === 'bidirectional' ? 'bidirectional' : raw === 'one-way' ? 'one-way' : 'off'; setBrokerLinkDraft((prev: any) => ({ ...prev, mirrorMode: mode })); }} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono">
              <option value="off">off</option>
              <option value="one-way">one-way</option>
              <option value="bidirectional">bidirectional</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Master Broker</label>
            <select value={brokerLinkDraft.masterBroker} onChange={(e) => { const raw = e.target.value; setBrokerLinkDraft((prev: any) => ({ ...prev, masterBroker: raw === 'tradelocker' ? 'tradelocker' : 'mt5' })); }} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono">
              <option value="mt5">mt5</option>
              <option value="tradelocker">tradelocker</option>
            </select>
          </div>
        </div>

        {brokerLinkDraft.mirrorMode === 'one-way' ? (
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">One-Way Direction</label>
            <select
              value={brokerLinkDraft.oneWayDirection}
              onChange={(e) => {
                const raw = e.target.value;
                setBrokerLinkDraft((prev: any) => ({
                  ...prev,
                  oneWayDirection: raw === 'tradelocker_to_mt5' ? 'tradelocker_to_mt5' : 'mt5_to_tradelocker'
                }));
              }}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
            >
              <option value="mt5_to_tradelocker">mt5 to tradelocker</option>
              <option value="tradelocker_to_mt5">tradelocker to mt5</option>
            </select>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Sync Mode</label>
            <select
              value={brokerLinkDraft.syncMode}
              onChange={(e) => {
                const raw = e.target.value;
                setBrokerLinkDraft((prev: any) => ({ ...prev, syncMode: raw === 'positions' ? 'positions' : 'orders' }));
              }}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
            >
              <option value="orders">orders</option>
              <option value="positions">positions</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Price Adjust</label>
            <select
              value={brokerLinkDraft.priceAdjustMode}
              onChange={(e) => {
                const raw = e.target.value;
                setBrokerLinkDraft((prev: any) => ({ ...prev, priceAdjustMode: raw === 'percent' ? 'percent' : 'pip' }));
              }}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
            >
              <option value="pip">pip</option>
              <option value="percent">percent</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Size Adjust</label>
          <select
            value={brokerLinkDraft.sizeAdjustMode}
            onChange={(e) => {
              const raw = e.target.value;
              const mode =
                raw === 'balance_ratio'
                  ? 'balance_ratio'
                  : raw === 'risk_percent'
                    ? 'risk_percent'
                    : raw === 'risk_amount'
                      ? 'risk_amount'
                      : 'match';
              setBrokerLinkDraft((prev: any) => ({ ...prev, sizeAdjustMode: mode }));
            }}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
          >
            <option value="match">match size</option>
            <option value="balance_ratio">balance ratio</option>
            <option value="risk_percent">risk % (by equity)</option>
            <option value="risk_amount">risk amount</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Risk Cap %</label>
            <input
              type="number"
              step="0.1"
              value={brokerLinkDraft.globalRiskCapPercent ?? ''}
              onChange={(e) =>
                setBrokerLinkDraft((prev: any) => ({
                  ...prev,
                  globalRiskCapPercent: parseNumberInput(e.target.value)
                }))
              }
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
              placeholder="1"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Risk Cap $</label>
            <input
              type="number"
              step="0.01"
              value={brokerLinkDraft.globalRiskCapAmount ?? ''}
              onChange={(e) =>
                setBrokerLinkDraft((prev: any) => ({
                  ...prev,
                  globalRiskCapAmount: parseNumberInput(e.target.value)
                }))
              }
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
              placeholder="50"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Slippage Max (pips)</label>
            <input
              type="number"
              step="0.1"
              value={brokerLinkDraft.slippageGuard?.maxPips ?? ''}
              onChange={(e) =>
                setBrokerLinkDraft((prev: any) => ({
                  ...prev,
                  slippageGuard: {
                    ...prev.slippageGuard,
                    maxPips: parseNumberInput(e.target.value)
                  }
                }))
              }
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
              placeholder="15"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Slippage Max %</label>
            <input
              type="number"
              step="0.01"
              value={brokerLinkDraft.slippageGuard?.maxPercent ?? ''}
              onChange={(e) =>
                setBrokerLinkDraft((prev: any) => ({
                  ...prev,
                  slippageGuard: {
                    ...prev.slippageGuard,
                    maxPercent: parseNumberInput(e.target.value)
                  }
                }))
              }
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
              placeholder="0.2"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Signal Defaults</label>
          <div className="flex items-center gap-4 text-[11px] text-gray-400">
            <label className="flex items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={brokerLinkDraft.signalDefaults?.sendToMt5}
                onChange={(e) =>
                  setBrokerLinkDraft((prev: any) => ({
                    ...prev,
                    signalDefaults: {
                      ...prev.signalDefaults,
                      sendToMt5: e.target.checked
                    }
                  }))
                }
              />
              Send to MT5
            </label>
            <label className="flex items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={brokerLinkDraft.signalDefaults?.sendToTradeLocker}
                onChange={(e) =>
                  setBrokerLinkDraft((prev: any) => ({
                    ...prev,
                    signalDefaults: {
                      ...prev.signalDefaults,
                      sendToTradeLocker: e.target.checked
                    }
                  }))
                }
              />
              Send to TradeLocker
            </label>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Symbol Map</label>
          <textarea rows={3} value={brokerLinkSymbolMapText} onChange={(e) => setBrokerLinkSymbolMapText(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono" placeholder="XAUUSD | XAUUSD | XAUUSD.R" />
          <div className="text-[10px] text-gray-600">Format: Canonical | MT5 | TradeLocker (one per line). Leave blank to auto-resolve.</div>
        </div>
      </div>
    </>
  );
};

export default React.memo(BrokerAdapterSection);
