type ActionResult = { ok: boolean; error?: string; data?: any; code?: string };
import { GLASS_EVENT, dispatchGlassEvent } from './glassEvents';
import {
  buildTradeLockerProfileBaseId,
  parseTradeLockerAccountNumber,
  parseTradeLockerProfileId
} from './tradeLockerIdentity';

export type runCatalogBrokerRuntimeInput = {
  actionId: string;
  payload: Record<string, any>;
  requestContext?: Record<string, any> | null;
  context: Record<string, any>;
};

export async function runCatalogBrokerRuntime(
  runtimeInput: runCatalogBrokerRuntimeInput
): Promise<{ handled: boolean; result?: ActionResult }> {
  const actionId = String(runtimeInput.actionId || '').trim();
  const payload = runtimeInput.payload && typeof runtimeInput.payload === 'object' ? runtimeInput.payload : {};
  const input = (runtimeInput.requestContext && typeof runtimeInput.requestContext === 'object'
    ? runtimeInput.requestContext
    : {}) as any;
  const context = runtimeInput.context && typeof runtimeInput.context === 'object' ? runtimeInput.context : {};
  const {
  refreshSnapshotRef,
  refreshQuotesRef,
  quoteMap,
  savedConfig,
  normalizeSymbolKey,
  executeBulkCancelOrdersViaApi,
  executeBulkClosePositionsViaApi,
  executeTicketOrderViaApi,
  tlSearchInstrumentsRef,
  tlPositionsRef,
  tlOrdersRef
} = context as any;
  
    if (actionId === 'broker.refresh_snapshot') {
      const refreshSnapshot = refreshSnapshotRef.current;
      if (!refreshSnapshot) return { ok: false, error: 'Broker snapshot refresh unavailable.' };
      await refreshSnapshot();
      return { ok: true, data: { refreshed: true } };
    }

    if (actionId === 'broker.quote') {
      const symbol = String(payload.symbol || input?.symbol || '').trim();
      if (!symbol) return { ok: false, error: 'Symbol is required.' };
      const force = payload.force === true || payload.refresh === true;
      const maxAgeMs = Number.isFinite(Number(payload.maxAgeMs)) ? Number(payload.maxAgeMs) : (force ? 0 : undefined);
      const refreshQuotes = refreshQuotesRef.current;
      if (refreshQuotes) {
        await refreshQuotes({ symbols: [symbol], maxAgeMs });
      }
      const quote = quoteMap?.[symbol] || null;
      return { ok: true, data: { symbol, quote } };
    }

    if (actionId === 'tradelocker.view.set') {
      const view = String(payload.view || payload.activeView || '').trim().toLowerCase();
      if (!view) return { ok: false, error: 'TradeLocker view is required.' };
      try {
        window.dispatchEvent(new CustomEvent('glass_tradelocker_view', { detail: { view } }));
      } catch {
        return { ok: false, error: 'Unable to update TradeLocker view.' };
      }
      return { ok: true, data: { view } };
    }

    if (actionId === 'tradelocker.ticket.set') {
      const detail = {
        symbol: payload.symbol ?? payload.ticketSymbol ?? null,
        side: payload.side ?? payload.action ?? null,
        type: payload.type ?? payload.orderType ?? null,
        qty: payload.qty ?? payload.quantity ?? null,
        price: payload.price ?? payload.limitPrice ?? null,
        stopLoss: payload.stopLoss ?? payload.sl ?? null,
        takeProfit: payload.takeProfit ?? payload.tp ?? null,
        strategyId: payload.strategyId ?? payload.strategy ?? null,
        evidence: payload.evidence ?? payload.evidenceCard ?? null,
        open: payload.open === true || payload.focus === true,
        clear: payload.clear === true
      };
      try {
        dispatchGlassEvent(GLASS_EVENT.TRADELOCKER_TICKET, detail);
      } catch {
        return { ok: false, error: 'Unable to update TradeLocker ticket.' };
      }
      return { ok: true, data: detail };
    }

    if (actionId === 'tradelocker.orders.filters.set') {
      const detail = {
        query: payload.query ?? payload.search ?? payload.value ?? null,
        open: payload.open === true
      };
      try {
        window.dispatchEvent(new CustomEvent('glass_tradelocker_orders_filters', { detail }));
      } catch {
        return { ok: false, error: 'Unable to update TradeLocker orders filters.' };
      }
      return { ok: true, data: detail };
    }

    if (actionId === 'tradelocker.history.filters.set') {
      const detail = {
        query: payload.query ?? payload.search ?? payload.value ?? null,
        allAccounts: payload.allAccounts === true || payload.all === true,
        open: payload.open === true
      };
      try {
        window.dispatchEvent(new CustomEvent('glass_tradelocker_history_filters', { detail }));
      } catch {
        return { ok: false, error: 'Unable to update TradeLocker history filters.' };
      }
      return { ok: true, data: detail };
    }

    if (actionId === 'tradelocker.close_panel.set') {
      const detail = {
        positionId: payload.positionId ?? payload.id ?? null,
        qty: payload.qty ?? payload.quantity ?? null,
        open: payload.open === true,
        clear: payload.clear === true
      };
      try {
        window.dispatchEvent(new CustomEvent('glass_tradelocker_close_draft', { detail }));
      } catch {
        return { ok: false, error: 'Unable to update TradeLocker close panel.' };
      }
      return { ok: true, data: detail };
    }

    if (actionId === 'tradelocker.search_instruments') {
      const query = String(payload.query || payload.q || payload.symbol || '').trim();
      if (!query) return { ok: false, error: 'Search query is required.' };
      const searchInstruments = tlSearchInstrumentsRef.current;
      if (!searchInstruments) return { ok: false, error: 'TradeLocker search unavailable.' };
      const limit = Number.isFinite(Number(payload.limit)) ? Math.max(1, Math.floor(Number(payload.limit))) : 12;
      const results = await searchInstruments(query, limit);
      return { ok: true, data: { results } };
    }

    if (actionId === 'tradelocker.positions.list') {
      const positions = Array.isArray(tlPositionsRef.current) ? tlPositionsRef.current : [];
      return { ok: true, data: { positions } };
    }

    if (actionId === 'tradelocker.orders.list') {
      const orders = Array.isArray(tlOrdersRef.current) ? tlOrdersRef.current : [];
      return { ok: true, data: { orders } };
    }

    if (actionId === 'tradelocker.history.list') {
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.list) return { ok: false, error: 'Trade ledger unavailable.' };
      const limit = Number.isFinite(Number(payload.limit)) ? Math.max(1, Math.floor(Number(payload.limit))) : 600;
      const res = await ledger.list({ limit });
      if (!res?.ok || !Array.isArray(res.entries)) {
        return { ok: false, error: res?.error ? String(res.error) : 'Failed to load trade history.' };
      }
      const entries = res.entries as any[];
      const env = savedConfig?.env ?? null;
      const server = savedConfig?.server ?? null;
      const accountId = savedConfig?.accountId ?? null;
      const accNum = savedConfig?.accNum ?? null;
      const includeAll = payload.allAccounts === true || payload.all === true || payload.includeAllAccounts === true;
      const symbolFilter = payload.symbol ? normalizeSymbolKey(payload.symbol) : '';
      const normStr = (v: any) => String(v ?? '').trim().toUpperCase();
      const accountMatches = (entry: any) => {
        if (includeAll) return true;
        if (!env && !server && accountId == null && accNum == null) return true;
        const acct = entry?.account || entry?.acct || null;
        const eEnv = acct?.env != null ? String(acct.env) : null;
        const eServer = acct?.server != null ? String(acct.server) : null;
        const eAccountId = acct?.accountId != null ? Number(acct.accountId) : null;
        const eAccNum = acct?.accNum != null ? Number(acct.accNum) : null;
        if (env != null) {
          if (!eEnv) return false;
          if (normStr(eEnv) !== normStr(env)) return false;
        }
        if (server) {
          if (!eServer) return false;
          if (normStr(eServer) !== normStr(server)) return false;
        }
        if (accountId != null) {
          if (eAccountId == null) return false;
          if (eAccountId !== accountId) return false;
        }
        if (accNum != null) {
          if (eAccNum == null) return false;
          if (eAccNum !== accNum) return false;
        }
        return true;
      };
      const isClosed = (entry: any) => {
        const status = String(entry?.status || '').toUpperCase();
        const posStatus = String(entry?.positionStatus || '').toUpperCase();
        const closedAt = Number(entry?.positionClosedAtMs || 0);
        return status === 'CLOSED' || posStatus === 'CLOSED' || closedAt > 0;
      };
      const filtered = entries
        .filter((entry) => entry?.broker === 'tradelocker')
        .filter(accountMatches)
        .filter(isClosed)
        .filter((entry) => {
          if (!symbolFilter) return true;
          return normalizeSymbolKey(entry?.symbol || '') === symbolFilter;
        });
      const sorted = [...filtered].sort((a, b) => {
        const aClose = Number(a?.positionClosedAtMs || 0) || Number(a?.updatedAtMs || 0) || Number(a?.createdAtMs || 0);
        const bClose = Number(b?.positionClosedAtMs || 0) || Number(b?.updatedAtMs || 0) || Number(b?.createdAtMs || 0);
        return bClose - aClose;
      });
      return { ok: true, data: { entries: sorted, count: sorted.length } };
    }

    if (actionId === 'tradelocker.cancel_all_orders') {
      const orderIds = Array.isArray(payload.orderIds || payload.ids)
        ? (payload.orderIds || payload.ids).map((id: any) => String(id || '').trim()).filter(Boolean)
        : undefined;
      const source = payload.source || input?.source || 'action_catalog';
      const res = await executeBulkCancelOrdersViaApi({
        orderIds,
        symbol: payload.symbol ? String(payload.symbol) : undefined,
        reason: payload.reason ? String(payload.reason) : undefined,
        source: String(source)
      });
      if (!res.ok) return { ok: false, error: res.error || 'Cancel failed.' };
      return { ok: true, data: res.data ?? null };
    }

    if (actionId === 'tradelocker.close_all_positions') {
      const positionIds = Array.isArray(payload.positionIds || payload.ids)
        ? (payload.positionIds || payload.ids).map((id: any) => String(id || '').trim()).filter(Boolean)
        : undefined;
      const qty = Number.isFinite(Number(payload.qty)) ? Number(payload.qty) : undefined;
      const source = payload.source || input?.source || 'action_catalog';
      const res = await executeBulkClosePositionsViaApi({
        positionIds,
        symbol: payload.symbol ? String(payload.symbol) : undefined,
        qty,
        reason: payload.reason ? String(payload.reason) : undefined,
        source: String(source)
      });
      if (!res.ok) return { ok: false, error: res.error || 'Close failed.' };
      return { ok: true, data: res.data ?? null };
    }

    if (actionId === 'tradelocker.place_order') {
      const args = payload && typeof payload === 'object' ? { ...payload } : {};
      const res = await executeTicketOrderViaApi(args);
      if (!res?.ok) {
        return { ok: false, error: res?.error ? String(res.error) : 'Failed to place order.', data: res ?? null };
      }
      return { ok: true, data: res?.data ?? null };
    }

    if (actionId === 'tradelocker.set_active_account') {
      const accountId = parseTradeLockerAccountNumber(payload.accountId ?? payload.id ?? payload.accountID);
      const accNum = parseTradeLockerAccountNumber(payload.accNum ?? payload.accountNum ?? payload.accountNumber);
      if (accountId == null && accNum == null) {
        return { ok: false, error: 'Account id or accNum is required.', code: 'account_unresolved' };
      }
      const tl = window.glass?.tradelocker;
      if (!tl?.setActiveAccount) return { ok: false, error: 'TradeLocker bridge unavailable.' };
      if (tl?.getStatus) {
        try {
          const status = await tl.getStatus();
          if (status?.connected === false && status?.tokenConnected !== true) {
            return { ok: false, error: 'TradeLocker is disconnected.', code: 'tradelocker_disconnected' };
          }
        } catch {
          // ignore status check errors and let switch attempt decide
        }
      }
      const res = await tl.setActiveAccount({ accountId, accNum });
      if (!res?.ok) {
        const codeRaw = String(res?.code || '').trim().toUpperCase();
        const code = codeRaw === 'ACCOUNT_UNRESOLVED' ? 'account_unresolved' : 'switch_verification_failed';
        return {
          ok: false,
          error: res?.error ? String(res.error) : 'Failed to set active account.',
          code
        };
      }
      const resolvedAccountId = parseTradeLockerAccountNumber(res?.accountId ?? accountId);
      const resolvedAccNum = parseTradeLockerAccountNumber(res?.accNum ?? accNum);
      if (resolvedAccountId == null || resolvedAccNum == null) {
        return {
          ok: false,
          error: 'TradeLocker active account verification failed.',
          code: 'switch_verification_failed'
        };
      }
      if (tl?.getAccountMetrics) {
        try {
          const verify = await tl.getAccountMetrics({ maxAgeMs: 0 });
          if (verify?.ok === false) {
            const verifyError = verify?.error ? String(verify.error) : 'TradeLocker active account verification failed.';
            const lower = verifyError.toLowerCase();
            const verifyCode =
              lower.includes('accnum') || lower.includes('account context')
                ? 'account_context_mismatch'
                : lower.includes('authentication') || lower.includes('unauthorized') || lower.includes('forbidden')
                  ? 'account_auth_invalid'
                  : 'switch_verification_failed';
            return {
              ok: false,
              error: verifyError,
              code: verifyCode
            };
          }
        } catch (verifyErr: any) {
          return {
            ok: false,
            error: verifyErr?.message ? String(verifyErr.message) : 'TradeLocker active account verification failed.',
            code: 'switch_verification_failed'
          };
        }
      }
      try {
        dispatchGlassEvent(GLASS_EVENT.TRADELOCKER_ACCOUNT_CHANGED, {
          accountId: resolvedAccountId,
          accNum: resolvedAccNum,
          source: 'catalog',
          atMs: Date.now()
        });
      } catch {
        // ignore renderer event dispatch failures
      }
      return { ok: true, data: res ?? null };
    }

    if (actionId === 'tradelocker.connect') {
      const tl = window.glass?.tradelocker;
      if (!tl?.connect) return { ok: false, error: 'TradeLocker bridge unavailable.' };
      const accountId = parseTradeLockerAccountNumber(payload.accountId ?? payload.id ?? payload.accountID);
      const accNum = parseTradeLockerAccountNumber(payload.accNum ?? payload.accountNum ?? payload.accountNumber);
      const profileIdRaw = payload.profileId != null ? String(payload.profileId).trim() : '';
      const parsedProfile = profileIdRaw ? parseTradeLockerProfileId(profileIdRaw) : null;
      const profileKey =
        (payload.profileKey != null ? String(payload.profileKey).trim() : '') ||
        (parsedProfile?.baseId ? String(parsedProfile.baseId).trim() : '') ||
        buildTradeLockerProfileBaseId(payload.env, payload.server, payload.email);
      const res = await tl.connect({
        env: payload.env,
        server: payload.server,
        email: payload.email,
        password: payload.password,
        developerApiKey: payload.developerApiKey,
        rememberPassword: payload.rememberPassword,
        rememberDeveloperApiKey: payload.rememberDeveloperApiKey,
        profileKey: profileKey || undefined,
        accountId: accountId ?? undefined,
        accNum: accNum ?? undefined
      });
      if (!res?.ok) return { ok: false, error: res?.error ? String(res.error) : 'Failed to connect.' };
      return { ok: true, data: res ?? null };
    }

    if (actionId === 'tradelocker.config.update') {
      const tl = window.glass?.tradelocker;
      if (!tl?.updateSavedConfig) return { ok: false, error: 'TradeLocker bridge unavailable.' };
      const patch = payload.patch && typeof payload.patch === 'object' ? payload.patch : payload;
      const res = await tl.updateSavedConfig(patch);
      if (!res?.ok) return { ok: false, error: res?.error ? String(res.error) : 'Failed to update config.' };
      return { ok: true, data: res ?? null };
    }

    if (actionId === 'tradelocker.trading_options.set') {
      const tl = window.glass?.tradelocker;
      if (!tl?.setTradingOptions) return { ok: false, error: 'TradeLocker bridge unavailable.' };
      const options = payload.options && typeof payload.options === 'object' ? payload.options : payload;
      const res = await tl.setTradingOptions(options);
      if (!res?.ok) return { ok: false, error: res?.error ? String(res.error) : 'Failed to update trading options.' };
      return { ok: true, data: res ?? null };
    }

    if (actionId === 'tradelocker.stream.start') {
      const tl = window.glass?.tradelocker;
      if (!tl?.startStream) return { ok: false, error: 'TradeLocker bridge unavailable.' };
      const res = await tl.startStream();
      if (!res?.ok && res?.error) return { ok: false, error: String(res.error) };
      return { ok: true, data: res ?? null };
    }

    if (actionId === 'tradelocker.stream.stop') {
      const tl = window.glass?.tradelocker;
      if (!tl?.stopStream) return { ok: false, error: 'TradeLocker bridge unavailable.' };
      const res = await tl.stopStream();
      if (!res?.ok && res?.error) return { ok: false, error: String(res.error) };
      return { ok: true, data: res ?? null };
    }

    if (actionId === 'tradelocker.disconnect') {
      const tl = window.glass?.tradelocker;
      if (!tl?.disconnect) return { ok: false, error: 'TradeLocker bridge unavailable.' };
      const res = await tl.disconnect();
      if (!res?.ok && res?.error) return { ok: false, error: String(res.error) };
      return { ok: true, data: res ?? null };
    }

    if (actionId === 'tradelocker.refresh_accounts') {
      const tl = window.glass?.tradelocker;
      if (!tl?.getAccounts) return { ok: false, error: 'TradeLocker bridge unavailable.' };
      const res = await tl.getAccounts();
      if (!res?.ok) return { ok: false, error: res?.error ? String(res.error) : 'Failed to fetch accounts.' };
      return { ok: true, data: res ?? null };
    }

    if (actionId === 'tradelocker.clear_secrets') {
      const tl = window.glass?.tradelocker;
      if (!tl?.clearSavedSecrets) return { ok: false, error: 'TradeLocker bridge unavailable.' };
      const res = await tl.clearSavedSecrets();
      if (!res?.ok) return { ok: false, error: res?.error ? String(res.error) : 'Failed to clear secrets.' };
      return { ok: true, data: res ?? null };
    }


  return { handled: false };
}
