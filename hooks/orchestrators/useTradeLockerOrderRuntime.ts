import React from 'react';
import { playSound } from '../../services/audioService';
import { reserveLedgerEntry } from '../../services/omsService';
import {
  computeClientStrategyIdFromDedupeKey,
  computeTradeDedupeKey,
  extractBrokerOrderId
} from '../../services/tradeIdentity';
import { submitTradeLockerOrderBatch } from '../../services/executionSubmissionService';
import { selectPrimaryResultByAccountKey } from '../../services/accountKeyIdentity';
import { buildMirrorExecutions } from '../../orchestrators/executionOrchestrator';

type UseTradeLockerOrderRuntimeArgs = {
  addNotification: (title: string, message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  executeBrokerActionViaApi: (action: any) => Promise<any>;
  tlPositions: any[];
  tlOrders: any[];
  resolveTradeLockerExecutionTargets: () => string[];
  resolveSnapshotSourceKey: () => string | null;
  areAccountKeysEquivalent: (left: string, right: string) => boolean;
  parseTradeLockerAccountKey: (key: string) => {
    env?: string | null;
    server?: string | null;
    accountId?: number | null;
    accNum?: number | null;
  } | null;
  tlSavedConfig: any;
  resolveTradeLockerSymbolBestEffort: (raw: string) => Promise<string>;
  tradeDedupeFallbackRef: React.MutableRefObject<Map<string, number>>;
  tlNormalizeEnabledRef: React.MutableRefObject<boolean>;
  resolveNormalizationReferenceKey: () => string | null;
  fetchTradeLockerQuotesForAccount: (
    accountKey: string,
    symbols: string[],
    opts?: { skipLock?: boolean; restoreKey?: string | null }
  ) => Promise<any>;
  getNormalizationOffsetForAccount: (
    accountKey: string,
    symbol: string
  ) => { askOffset?: number | null; bidOffset?: number | null } | null;
  readLegacyTradeLockerSubmissionFlag: () => boolean;
  withTradeLockerAccountLock: <T,>(fn: () => Promise<T> | T) => Promise<T>;
  ensureTradeLockerAccount: (accountKey: string | null, reason?: string) => Promise<{ ok: boolean; error?: string }>;
  getTradeLockerAccountKey: () => string | null;
  requestBrokerWithAudit: (
    method: string,
    args?: any,
    context?: { symbol?: string; source?: string; brokerId?: string }
  ) => Promise<any>;
};

type TradeLockerOrderRuntimeResult = {
  handleTradeLockerClosePosition: (id: string, qty?: number) => void;
  handleTradeLockerCancelOrder: (orderId: string) => void;
  handleTradeLockerPlaceOrder: (args: any) => Promise<any>;
};

export const useTradeLockerOrderRuntime = (
  args: UseTradeLockerOrderRuntimeArgs
): TradeLockerOrderRuntimeResult => {
  const {
    addNotification,
    executeBrokerActionViaApi,
    tlPositions,
    tlOrders,
    resolveTradeLockerExecutionTargets,
    resolveSnapshotSourceKey,
    areAccountKeysEquivalent,
    parseTradeLockerAccountKey,
    tlSavedConfig,
    resolveTradeLockerSymbolBestEffort,
    tradeDedupeFallbackRef,
    tlNormalizeEnabledRef,
    resolveNormalizationReferenceKey,
    fetchTradeLockerQuotesForAccount,
    getNormalizationOffsetForAccount,
    readLegacyTradeLockerSubmissionFlag,
    withTradeLockerAccountLock,
    ensureTradeLockerAccount,
    getTradeLockerAccountKey,
    requestBrokerWithAudit
  } = args;

  const handleTradeLockerClosePosition = React.useCallback((id: string, qty?: number) => {
    const pos = tlPositions.find((p) => p.id === id);
    (async () => {
      const res = await executeBrokerActionViaApi({
        type: 'CLOSE_POSITION',
        status: 'PENDING',
        positionId: id,
        qty: qty ?? 0,
        symbol: pos?.symbol ? String(pos.symbol) : undefined,
        source: 'manual',
        reason: 'Manual close'
      });
      if (res?.ok) {
        const qtyLabel = qty && qty > 0 ? ` (qty ${qty})` : '';
        addNotification('Close Requested', `${pos?.symbol || 'Position'} close sent to TradeLocker${qtyLabel}`, 'info');
      } else {
        const err = res?.error ? String(res.error) : 'Failed to close position';
        addNotification('Close Failed', err, 'error');
      }
    })();
  }, [addNotification, executeBrokerActionViaApi, tlPositions]);

  const handleTradeLockerCancelOrder = React.useCallback((orderId: string) => {
    const ord = tlOrders.find((o) => o.id === orderId);
    (async () => {
      const res = await executeBrokerActionViaApi({
        type: 'CANCEL_ORDER',
        status: 'PENDING',
        orderId,
        symbol: ord?.symbol ? String(ord.symbol) : undefined,
        source: 'manual',
        reason: 'Manual cancel'
      });
      if (res?.ok) {
        addNotification('Cancel Requested', `${ord?.symbol || 'Order'} cancel sent to TradeLocker`, 'info');
      } else {
        const err = res?.error ? String(res.error) : 'Failed to cancel order';
        addNotification('Cancel Failed', err, 'error');
      }
    })();
  }, [addNotification, executeBrokerActionViaApi, tlOrders]);

  const handleTradeLockerPlaceOrder = React.useCallback(async (argsInput: any) => {
    const ledger = window.glass?.tradeLedger;
    const hasLedger = !!ledger?.reserve && !!ledger?.update;
    const executionTargets = resolveTradeLockerExecutionTargets();
    if (executionTargets.length === 0) {
      const msg = 'TradeLocker active account not set. Open Locker and select an account.';
      addNotification('TradeLocker Blocked', msg, 'warning');
      return { ok: false, error: msg };
    }

    const snapshotKey = resolveSnapshotSourceKey();
    const primaryKey = snapshotKey
      ? (executionTargets.find((targetKey) => areAccountKeysEquivalent(targetKey, snapshotKey)) || executionTargets[0])
      : executionTargets[0];
    const primaryAccount = primaryKey ? parseTradeLockerAccountKey(primaryKey) : null;
    const env = primaryAccount?.env || tlSavedConfig?.env || null;
    const server = primaryAccount?.server || tlSavedConfig?.server || null;
    const accountId = primaryAccount?.accountId ?? null;
    const accNum = primaryAccount?.accNum ?? null;
    const accountKey = primaryKey || (env && accountId != null && accNum != null ? `${String(env)}:${String(server || '')}:${String(accountId)}:${String(accNum)}` : null);

    const orderTypeRaw = String(argsInput?.type || tlSavedConfig?.defaultOrderType || 'market').toLowerCase();
    const orderType = orderTypeRaw === 'limit' ? 'limit' : orderTypeRaw === 'stop' ? 'stop' : 'market';
    const side = String(argsInput?.side || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
    const symbolRaw = argsInput?.symbol ? String(argsInput.symbol) : 'UNKNOWN';
    const symbol = await resolveTradeLockerSymbolBestEffort(symbolRaw);
    const entryPrice =
      orderType === 'stop'
        ? Number(argsInput?.stopPrice ?? argsInput?.price ?? 0)
        : Number(argsInput?.price || 0);
    const stopLoss = Number(argsInput?.stopLoss || 0);
    const takeProfit = Number(argsInput?.takeProfit || 0);
    const qty = argsInput?.qty != null ? Number(argsInput.qty) : null;

    let strategyId = argsInput?.strategyId ? String(argsInput.strategyId).trim() : '';
    if (!strategyId || strategyId.toLowerCase() === 'manual') {
      try {
        const pseudoProposal: any = {
          symbol,
          action: side,
          entryPrice: Number.isFinite(entryPrice) ? entryPrice : 0,
          stopLoss: Number.isFinite(stopLoss) ? stopLoss : 0,
          takeProfit: Number.isFinite(takeProfit) ? takeProfit : 0,
          reason: 'Manual ticket'
        };
        const dedupeKey = computeTradeDedupeKey({
          proposal: pseudoProposal,
          broker: 'tradelocker',
          accountKey: accountKey || '',
          orderType,
          qty: qty ?? undefined
        });
        strategyId = computeClientStrategyIdFromDedupeKey(dedupeKey);
      } catch {
        strategyId = `gb_ticket_${Date.now().toString(16)}`.slice(0, 31);
      }
    }

    let ledgerId: string | null = null;
    if (hasLedger && accountKey) {
      try {
        const pseudoProposal: any = {
          symbol,
          symbolOriginal: symbolRaw,
          action: side,
          entryPrice: Number.isFinite(entryPrice) ? entryPrice : 0,
          stopLoss: Number.isFinite(stopLoss) ? stopLoss : 0,
          takeProfit: Number.isFinite(takeProfit) ? takeProfit : 0,
          reason: 'Manual ticket'
        };
        const dedupeKey = computeTradeDedupeKey({
          proposal: pseudoProposal,
          broker: 'tradelocker',
          accountKey,
          orderType,
          qty: qty ?? undefined
        });

        const reserveRes = await reserveLedgerEntry({
          ledger,
          dedupeKey,
          windowMs: 2500,
          fallbackMap: tradeDedupeFallbackRef.current,
          fallbackWindowMs: 2500,
          entry: {
            kind: 'trade',
            schemaVersion: 'trade_v1',
            source: 'ticket',
            broker: 'tradelocker',
            status: 'SUBMITTING',
            agentId: null,
            reason: 'Manual ticket',
            symbol,
            symbolOriginal: symbolRaw,
            action: side,
            entryPrice: Number.isFinite(entryPrice) ? entryPrice : 0,
            stopLoss: Number.isFinite(stopLoss) ? stopLoss : 0,
            takeProfit: Number.isFinite(takeProfit) ? takeProfit : 0,
            qty: qty ?? null,
            orderType,
            clientTag: strategyId,
            account: {
              env,
              server,
              accountId,
              accNum
            }
          }
        });

        if (reserveRes?.ok && reserveRes?.reserved === false) {
          addNotification('Duplicate Blocked', 'Duplicate order blocked (clicked too fast).', 'warning');
          return { ok: false, error: 'Duplicate order blocked (clicked too fast).' };
        }
        if (reserveRes?.ok && reserveRes?.entry?.id) {
          ledgerId = String(reserveRes.entry.id);
          try {
            if (ledgerId && ledger?.update) {
              await ledger.update({ id: ledgerId, patch: { executionId: ledgerId } });
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ledger is best-effort
      }
    }

    const baseArgs: Record<string, any> = { ...(argsInput || {}) };
    baseArgs.symbol = symbol;
    baseArgs.side = side;
    baseArgs.type = orderType;
    if (qty != null) baseArgs.qty = qty;
    if (orderType === 'stop') {
      baseArgs.stopPrice = Number.isFinite(entryPrice) ? entryPrice : baseArgs.stopPrice;
      if (baseArgs.price == null) baseArgs.price = baseArgs.stopPrice;
    }
    baseArgs.strategyId = strategyId;

    const normalizeTicketForAccount = async (targetKey: string) => {
      let normalized = false;
      const nextArgs = { ...baseArgs };
      if (tlNormalizeEnabledRef.current) {
        const refKey = resolveNormalizationReferenceKey();
        if (refKey && refKey !== targetKey) {
          await fetchTradeLockerQuotesForAccount(refKey, [symbol], { skipLock: true, restoreKey: null });
          await fetchTradeLockerQuotesForAccount(targetKey, [symbol], { skipLock: true, restoreKey: null });
          const offset = getNormalizationOffsetForAccount(targetKey, symbol);
          const offsetValue = side === 'BUY' ? offset?.askOffset : offset?.bidOffset;
          if (offset && Number.isFinite(Number(offsetValue))) {
            const adjust = (value: any) => {
              const num = Number(value);
              return Number.isFinite(num) ? num + Number(offsetValue) : value;
            };
            if (nextArgs.price != null) nextArgs.price = adjust(nextArgs.price);
            if (nextArgs.stopPrice != null) nextArgs.stopPrice = adjust(nextArgs.stopPrice);
            if (nextArgs.stopLoss != null) nextArgs.stopLoss = adjust(nextArgs.stopLoss);
            if (nextArgs.takeProfit != null) nextArgs.takeProfit = adjust(nextArgs.takeProfit);
            normalized = true;
          }
        }
      }
      return { args: nextArgs, normalized };
    };

    const useLegacySubmission = readLegacyTradeLockerSubmissionFlag();
    const results = useLegacySubmission
      ? await withTradeLockerAccountLock(async () => {
          const out: Array<{ accountKey: string; res: any; normalized: boolean }> = [];
          for (const targetKey of executionTargets) {
            const switchRes = await ensureTradeLockerAccount(targetKey, 'ticket_execute');
            if (!switchRes.ok) {
              out.push({ accountKey: targetKey, res: { ok: false, error: switchRes.error }, normalized: false });
              continue;
            }
            const payload = await normalizeTicketForAccount(targetKey);
            let res: any = null;
            try {
              res = await requestBrokerWithAudit(
                'placeOrder',
                payload.args,
                {
                  symbol,
                  source: 'ticket_execute',
                  brokerId: 'tradelocker'
                }
              );
            } catch (e: any) {
              res = { ok: false, error: e?.message ? String(e.message) : 'Failed to place order.' };
            }
            out.push({ accountKey: targetKey, res, normalized: payload.normalized });
          }
          if (snapshotKey && snapshotKey !== getTradeLockerAccountKey()) {
            await ensureTradeLockerAccount(snapshotKey, 'ticket_restore');
          }
          return out;
        })
      : (
          await submitTradeLockerOrderBatch({
            route: 'ticket_execute',
            executionTargets,
            snapshotAccountKey: snapshotKey || null,
            ensureAccount: async (accountKey, reason) => await ensureTradeLockerAccount(accountKey, reason),
            withAccountLock: withTradeLockerAccountLock,
            getActiveAccountKey: getTradeLockerAccountKey,
            switchReason: 'ticket_execute',
            restoreReason: 'ticket_restore',
            submitForAccount: async (accountKey) => {
              const payload = await normalizeTicketForAccount(accountKey);
              let res: any = null;
              try {
                res = await requestBrokerWithAudit(
                  'placeOrder',
                  payload.args,
                  {
                    symbol,
                    source: 'ticket_execute',
                    brokerId: 'tradelocker'
                  }
                );
              } catch (e: any) {
                res = { ok: false, error: e?.message ? String(e.message) : 'Failed to place order.' };
              }
              return { res, normalized: payload.normalized, payload: payload.args };
            }
          })
        ).results.map((row) => ({
          accountKey: row.accountKey,
          res: row.res,
          normalized: !!row.normalized
        }));

    const primaryResult = selectPrimaryResultByAccountKey(results, primaryKey) || results[0];
    const res = primaryResult?.res;
    if (!res) {
      addNotification('TradeLocker Error', 'Failed to place order.', 'error');
      return { ok: false, error: 'Failed to place order.' };
    }
    if (res?.ok) {
      const orderId = extractBrokerOrderId(res);
      const orderStatus = res?.orderStatus != null ? String(res.orderStatus) : null;
      const resolvedSymbol = res?.resolvedSymbol != null ? String(res.resolvedSymbol) : null;
      const positionId = res?.positionId != null ? String(res.positionId).trim() : null;
      const filledQty = res?.filledQty != null && Number.isFinite(Number(res.filledQty)) ? Number(res.filledQty) : null;
      const remainingQty = res?.remainingQty != null && Number.isFinite(Number(res.remainingQty)) ? Number(res.remainingQty) : null;
      const statusUpper = orderStatus ? orderStatus.toUpperCase() : '';
      const filledByStatus =
        statusUpper.includes('FILL') || statusUpper.includes('EXECUT') || statusUpper.includes('DONE') || statusUpper.includes('COMPLETE');
      const isFilled = (filledQty != null && filledQty > 0) || filledByStatus;
      const mirrorExecutions = buildMirrorExecutions(results as any, primaryResult?.accountKey || null);

      try {
        const normalizedQty =
          typeof (res as any)?.qty === 'number' && Number.isFinite(Number((res as any).qty))
            ? Number((res as any).qty)
            : qty;
        if (ledgerId && ledger?.update) {
          const patch: any = {
            status: 'ACCEPTED',
            brokerOrderId: orderId,
            brokerAcceptedAtMs: Date.now(),
            qtyNormalized: normalizedQty ?? null,
            clientTag: strategyId,
            brokerOrderStatus: orderStatus,
            orderFilledQty: filledQty,
            orderRemainingQty: remainingQty,
            brokerResolvedSymbol: resolvedSymbol,
            brokerResponse: res?.response ?? null,
            mirrorExecutions
          };
          if (positionId) {
            patch.positionId = positionId;
            if (isFilled) {
              patch.status = 'OPEN';
              patch.positionStatus = 'OPEN';
              patch.positionOpenedAtMs = Date.now();
            }
          }
          await ledger.update({ id: ledgerId, patch });
        }
      } catch {
        // ignore
      }

      playSound('success');
      const idHint = orderId ? ` (#${orderId})` : '';
      const statusHint = orderStatus ? `  (${orderStatus})` : '';
      const labelSymbol = resolvedSymbol || symbol || (argsInput?.symbol || 'Order');
      const kindHint = isFilled
        ? 'filled'
        : orderType === 'limit'
          ? 'limit order placed (pending)'
          : orderType === 'stop'
            ? 'stop order placed (pending)'
            : 'accepted (pending)';
      addNotification(isFilled ? 'TradeLocker Filled' : 'TradeLocker Accepted', `${side} ${labelSymbol} ${kindHint}${idHint}${statusHint}`, 'success');
      if (mirrorExecutions.length > 0 && mirrorExecutions.some((m) => m.ok === false)) {
        addNotification('TradeLocker Mirror', 'Some mirror executions failed. Check Audit for details.', 'warning');
      }
      return res;
    }

    const err = res?.error ? String(res.error) : 'Unknown error';
    const orderId = extractBrokerOrderId(res);
    const orderStatus = res?.orderStatus != null ? String(res.orderStatus) : null;
    const filledQty = res?.filledQty != null && Number.isFinite(Number(res.filledQty)) ? Number(res.filledQty) : null;
    const remainingQty = res?.remainingQty != null && Number.isFinite(Number(res.remainingQty)) ? Number(res.remainingQty) : null;
    const statusUpper = orderStatus ? orderStatus.toUpperCase() : '';
    const cancelled =
      statusUpper.includes('CANCEL') ||
      statusUpper.includes('CANCELED') ||
      statusUpper.includes('CANCELLED') ||
      statusUpper.includes('EXPIRE') ||
      statusUpper.includes('EXPIRED') ||
      statusUpper.includes('CLOSE') ||
      statusUpper.includes('CLOSED');
    const mirrorExecutions = buildMirrorExecutions(results as any, primaryResult?.accountKey || null);
    try {
      if (ledgerId && ledger?.update) {
        await ledger.update({
          id: ledgerId,
          patch: {
            status: cancelled ? 'CANCELLED' : 'REJECTED',
            brokerOrderId: orderId,
            brokerOrderStatus: orderStatus,
            orderFilledQty: filledQty,
            orderRemainingQty: remainingQty,
            error: err,
            brokerResponse: res?.response ?? null,
            mirrorExecutions
          }
        });
      }
    } catch {
      // ignore
    }
    addNotification('TradeLocker Rejected', err, 'error');
    return res;
  }, [
    addNotification,
    areAccountKeysEquivalent,
    ensureTradeLockerAccount,
    executeBrokerActionViaApi,
    fetchTradeLockerQuotesForAccount,
    getNormalizationOffsetForAccount,
    getTradeLockerAccountKey,
    parseTradeLockerAccountKey,
    readLegacyTradeLockerSubmissionFlag,
    requestBrokerWithAudit,
    resolveNormalizationReferenceKey,
    resolveSnapshotSourceKey,
    resolveTradeLockerExecutionTargets,
    resolveTradeLockerSymbolBestEffort,
    tlNormalizeEnabledRef,
    tlOrders,
    tlPositions,
    tlSavedConfig,
    tradeDedupeFallbackRef,
    withTradeLockerAccountLock
  ]);

  return {
    handleTradeLockerClosePosition,
    handleTradeLockerCancelOrder,
    handleTradeLockerPlaceOrder
  };
};

