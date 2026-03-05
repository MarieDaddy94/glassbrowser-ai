import React from 'react';
import { Check, ChevronDown, RefreshCw, Search } from 'lucide-react';
import type { TradeLockerAccountSelectorItem, TradeLockerAccountSelectorModel } from '../../types';

export type { TradeLockerAccountSelectorModel } from '../../types';

type AccountSelectorProps = {
  model: TradeLockerAccountSelectorModel;
};

const formatMoney = (value: number | null | undefined, currency?: string | null) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 'Balance unavailable';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  } catch {
    return `$${num.toFixed(2)}`;
  }
};

const formatAge = (updatedAtMs?: number | null) => {
  const ts = Number(updatedAtMs || 0);
  if (!Number.isFinite(ts) || ts <= 0) return 'not refreshed';
  const deltaSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (deltaSec < 5) return 'just now';
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) return `${deltaMin}m ago`;
  const deltaHr = Math.floor(deltaMin / 60);
  return `${deltaHr}h ago`;
};

const statusTone = (item: TradeLockerAccountSelectorItem) => {
  if (item.status === 'fresh' && item.isConnected) return 'bg-emerald-400';
  if (item.status === 'stale') return 'bg-amber-400';
  return 'bg-red-400';
};

const envTone = (environment: 'demo' | 'live') =>
  environment === 'live'
    ? 'bg-emerald-600/85 text-emerald-50 border border-emerald-500/60'
    : 'bg-amber-600/85 text-amber-50 border border-amber-500/60';

const AccountSelector: React.FC<AccountSelectorProps> = ({ model }) => {
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!model.isOpen) return;
    const onPointerDown = (evt: MouseEvent) => {
      const root = panelRef.current;
      if (!root) return;
      if (root.contains(evt.target as Node)) return;
      model.onClose();
    };
    const onEsc = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') model.onClose();
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [model]);

  const activeLabel = String(model.activeLabel || 'Select Account').trim() || 'Select Account';
  const activeBalanceLabel = formatMoney(model.activeBalance, model.activeCurrency);
  const activeAccNumLabel =
    model.activeAccNum != null && Number.isFinite(Number(model.activeAccNum))
      ? `accNum ${Number(model.activeAccNum)}`
      : 'accNum --';

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={model.onToggleOpen}
        className="h-8 rounded-md border border-white/15 bg-[#1b1d22] px-3 text-sm text-gray-100 hover:border-white/25 hover:bg-[#22252c] transition-colors flex items-center gap-2 max-w-[26rem]"
        title="Select TradeLocker account"
      >
        <span className="truncate max-w-[9rem] font-semibold">{activeLabel}</span>
        <span className="text-gray-400">|</span>
        <span className="truncate max-w-[8rem]">{activeBalanceLabel}</span>
        <span className="text-gray-400">|</span>
        <span className="text-gray-300">{activeAccNumLabel}</span>
        <ChevronDown size={14} className={`${model.isOpen ? 'rotate-180' : ''} transition-transform`} />
      </button>

      {model.isOpen ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-[min(94vw,30rem)] rounded-xl border border-white/15 bg-[#111827]/95 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="text-sm font-semibold text-gray-100">Select Account</div>
            <div className="flex items-center gap-2 text-xs text-gray-300">
              <span>Updated {formatAge(model.lastRefreshAtMs)}</span>
              <button
                type="button"
                onClick={model.onRefreshAccounts}
                disabled={model.refreshingAccounts === true || model.switching === true}
                className="p-1 rounded hover:bg-white/10 disabled:opacity-50"
                title="Refresh account list"
              >
                <RefreshCw size={14} className={model.refreshingAccounts ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="px-4 py-3 border-b border-white/10">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={model.search}
                onChange={(event) => model.onSearchChange(event.target.value)}
                placeholder="Search accounts..."
                className="w-full rounded-md border border-white/15 bg-[#0f172a]/70 py-2 pl-9 pr-3 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-blue-500/60"
              />
            </div>
          </div>

          <div className="max-h-[24rem] overflow-auto px-3 py-3 space-y-2 custom-scrollbar">
            {model.items.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-4 text-sm text-gray-400">
                No accounts match this filter.
              </div>
            ) : (
              model.items.map((item) => {
                const accountIdSuffix = String(item.accountId).slice(-6);
                return (
                  <button
                    type="button"
                    key={item.accountKey}
                    onClick={() => model.onSelect(item.accountKey)}
                    disabled={model.switching === true}
                    className={`w-full text-left rounded-lg border px-3 py-3 transition-colors ${
                      item.isActive
                        ? 'border-blue-400/60 bg-blue-500/10 shadow-[0_0_0_1px_rgba(96,165,250,0.25)]'
                        : 'border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/10'
                    } disabled:opacity-60`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-2.5 w-2.5 rounded-full ${statusTone(item)}`} />
                        <span className="truncate text-sm font-semibold text-gray-100">{item.label}</span>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded ${envTone(item.environment)}`}>
                        {item.environment.toUpperCase()}
                      </span>
                    </div>

                    <div className="mt-2 text-xl font-semibold text-gray-100">
                      {formatMoney(item.balance, item.currency)}
                    </div>

                    <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-gray-300">
                      <span>Equity {formatMoney(item.equity, item.currency)}</span>
                      <span>Free Margin {formatMoney(item.freeMargin, item.currency)}</span>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                      <span>
                        accNum {item.accNum != null ? item.accNum : '--'} • ID ...{accountIdSuffix}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        {item.isActive ? <Check size={12} className="text-blue-300" /> : null}
                        {item.isActive ? 'Active' : `Updated ${formatAge(item.lastUpdatedAtMs)}`}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-white/10 px-3 py-3">
            <button
              type="button"
              onClick={model.onRefreshBalances}
              disabled={model.refreshingBalances === true || model.switching === true}
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-gray-200 hover:bg-white/10 disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} className={model.refreshingBalances ? 'animate-spin' : ''} />
              <span>Refresh balances</span>
            </button>
            <div className="mt-2 text-[11px] text-gray-400">
              Queue {Math.max(0, Number(model.queueDepth || 0))}
              {model.lastError ? ` • ${model.lastError}` : ''}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AccountSelector;
