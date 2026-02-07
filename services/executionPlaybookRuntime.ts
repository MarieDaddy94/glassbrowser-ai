type MutableRef<T> = { current: T };

type RunExecutionPlaybookTickRuntimeInput = {
  tlStatus: string | null | undefined;
  tlPositions: any[];
  ledger: any;
  isShadowEntry: (entry: any) => boolean;
  normalizeExecutionPlaybook: (playbook: any) => any;
  buildPlaybookState: (playbook: any, state: any) => any;
  getBrokerQuoteForSymbol: (symbol: string) => any;
  getBrokerReferencePriceFromQuote: (quote: any) => number | null;
  validateBrokerStopLevels: (args: {
    symbol: string;
    side: 'BUY' | 'SELL';
    stopLoss: number;
    referencePrice: number;
  }) => Promise<{ ok: boolean; [key: string]: any } | null | undefined>;
  executeBrokerActionViaApi: (args: Record<string, any>) => Promise<{ ok: boolean; [key: string]: any } | null | undefined>;
  appendAuditEvent?: (event: { eventType: string; symbol?: string | null; payload?: Record<string, any> }) => void | Promise<void>;
  playbookRunningRef: MutableRef<boolean>;
  playbookLastRunAtRef: MutableRef<number>;
};

const pickPositiveNumber = (...values: any[]) => {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return null;
};

const emitAudit = (
  fn: RunExecutionPlaybookTickRuntimeInput['appendAuditEvent'],
  eventType: string,
  symbol: string,
  payload: Record<string, any>
) => {
  if (!fn) return;
  try {
    void fn({ eventType, symbol, payload });
  } catch {
    // ignore audit failures in runtime loop
  }
};

export async function runExecutionPlaybookTickRuntime(input: RunExecutionPlaybookTickRuntimeInput): Promise<void> {
  const now = Date.now();
  if (input.playbookRunningRef.current) return;
  if (now - input.playbookLastRunAtRef.current < 1500) return;
  input.playbookRunningRef.current = true;
  input.playbookLastRunAtRef.current = now;

  try {
    if (input.tlStatus !== 'connected') return;
    const positions = Array.isArray(input.tlPositions) ? input.tlPositions : [];
    if (positions.length === 0) return;

    const ledger = input.ledger;
    if (!ledger?.list || !ledger?.update) return;
    const listRes = await ledger.list({ limit: 400 });
    if (!listRes?.ok || !Array.isArray(listRes.entries)) return;

    const byId = new Map<string, any>();
    const byTag = new Map<string, any>();
    for (const pos of positions) {
      if (pos?.id) byId.set(String(pos.id), pos);
      const tag = pos?.strategyId ?? pos?.clientTag;
      if (tag != null) byTag.set(String(tag), pos);
    }

    for (const entry of listRes.entries as any[]) {
      if (!entry) continue;
      if (input.isShadowEntry(entry)) continue;
      const status = String(entry.status || '').toUpperCase();
      const positionStatus = String(entry.positionStatus || '').toUpperCase();
      if (status !== 'OPEN' && positionStatus !== 'OPEN') continue;

      const playbook = input.normalizeExecutionPlaybook(entry.playbook || entry.setup?.playbook || null);
      if (!playbook || playbook.enabled === false) continue;

      const positionId = entry.positionId != null ? String(entry.positionId).trim() : '';
      const clientTag = entry.clientTag != null ? String(entry.clientTag).trim() : '';
      const pos = positionId ? byId.get(positionId) : (clientTag ? byTag.get(clientTag) : null);
      if (!pos) continue;

      const symbol = String(pos.symbol || entry.symbol || '').trim();
      if (!symbol) continue;

      const side = String(pos.type || entry.action || '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
      const entryPrice = pickPositiveNumber(entry.brokerEntryPrice, entry.entryPrice, pos.entryPrice, entry.plannedEntryPrice);
      const stopLoss = pickPositiveNumber(pos.stopLoss, entry.stopLoss, entry.brokerStopLoss, entry.plannedStopLoss);
      if (!Number.isFinite(entryPrice) || !Number.isFinite(stopLoss)) continue;

      const risk = Math.abs(Number(entryPrice) - Number(stopLoss));
      if (!Number.isFinite(risk) || risk <= 0) continue;

      const quote = input.getBrokerQuoteForSymbol(symbol);
      const bid = Number(pos.brokerBid ?? quote?.bid);
      const ask = Number(pos.brokerAsk ?? quote?.ask);
      let exitPrice = side === 'BUY' ? bid : ask;
      if (!Number.isFinite(exitPrice)) {
        const ref = input.getBrokerReferencePriceFromQuote(quote);
        if (Number.isFinite(ref)) exitPrice = ref;
      }
      if (!Number.isFinite(exitPrice)) continue;

      const direction = side === 'SELL' ? -1 : 1;
      const currentR = ((exitPrice - entryPrice) * direction) / risk;
      if (!Number.isFinite(currentR)) continue;

      const state = input.buildPlaybookState(playbook, entry.playbookState);
      if (!state) continue;

      let stateChanged = false;
      const minIntervalMs = Number.isFinite(Number(playbook.minIntervalMs)) ? Number(playbook.minIntervalMs) : 3000;
      const lastActionAtMs = Number(state.lastActionAtMs || 0);
      const inCooldown = lastActionAtMs > 0 && now - lastActionAtMs < minIntervalMs;

      const positionSize = pickPositiveNumber(pos.size, entry.brokerQty, entry.qtyNormalized, entry.qty);
      if (!Number.isFinite(Number(state.initialQty)) && Number.isFinite(positionSize)) {
        state.initialQty = Number(positionSize);
        stateChanged = true;
      }

      const currentStop = pickPositiveNumber(pos.stopLoss, entry.stopLoss, entry.brokerStopLoss, entry.plannedStopLoss);

      let actionTaken = false;
      let nextStop: number | null = null;
      let stopReason = '';
      let stepHit: any = null;

      if (!inCooldown && state.breakevenAtR && !state.breakevenDone && currentR >= Number(state.breakevenAtR)) {
        nextStop = Number(entryPrice);
        stopReason = 'breakeven';
      }

      if (!inCooldown && !nextStop && state.trail && state.trail.offsetR) {
        const activationR = Number(state.trail.activationR ?? 1);
        if (Number.isFinite(activationR) && currentR >= activationR) {
          const offset = Number(state.trail.offsetR);
          if (Number.isFinite(offset) && offset > 0) {
            const trailStop = side === 'BUY'
              ? Number(exitPrice) - risk * offset
              : Number(exitPrice) + risk * offset;
            if (Number.isFinite(trailStop)) {
              if (side === 'BUY' && (!currentStop || trailStop > currentStop)) {
                nextStop = trailStop;
                stopReason = 'trail';
              }
              if (side === 'SELL' && (!currentStop || trailStop < currentStop)) {
                nextStop = trailStop;
                stopReason = 'trail';
              }
            }
          }
        }
      }

      if (!inCooldown && !nextStop) {
        const steps = Array.isArray(state.steps) ? state.steps : [];
        const pending = steps
          .filter((step) => step && step.status !== 'done' && Number.isFinite(Number(step.rr)))
          .sort((a, b) => Number(a.rr) - Number(b.rr));
        stepHit = pending.find((step) => currentR >= Number(step.rr));
      }

      const patch: any = {};

      if (nextStop != null && Number.isFinite(nextStop)) {
        const improves =
          !currentStop ||
          (side === 'BUY' ? Number(nextStop) > Number(currentStop) : Number(nextStop) < Number(currentStop));
        if (improves) {
          const check = await input.validateBrokerStopLevels({
            symbol,
            side,
            stopLoss: Number(nextStop),
            referencePrice: exitPrice
          });
          if (check?.ok) {
            const res = await input.executeBrokerActionViaApi({
              type: 'MODIFY_POSITION',
              status: 'PENDING',
              positionId: String(pos.id),
              stopLoss: Number(nextStop),
              symbol,
              source: 'playbook',
              reason: stopReason
            });
            if (res?.ok) {
              state.lastActionAtMs = now;
              stateChanged = true;
              actionTaken = true;
              if (stopReason === 'breakeven') state.breakevenDone = true;
              if (state.trail && stopReason === 'trail') {
                state.trail.active = true;
                state.trail.lastStop = Number(nextStop);
              }
              patch.stopLoss = Number(nextStop);
              emitAudit(input.appendAuditEvent, 'playbook_stop_move', symbol, {
                entryId: entry.id,
                positionId: pos.id,
                reason: stopReason,
                stopLoss: Number(nextStop),
                currentR
              });
            }
          }
        }
      }

      if (!actionTaken && stepHit && Number.isFinite(positionSize) && positionSize && positionSize > 0) {
        const baseQty = Number.isFinite(Number(state.initialQty)) ? Number(state.initialQty) : Number(positionSize);
        const qtyTarget = baseQty * (Number(stepHit.qtyPct) / 100);
        const qtyToClose = Math.max(0, Math.min(Number(positionSize), qtyTarget));
        if (qtyToClose > 0) {
          const closeQty = qtyToClose >= Number(positionSize) ? 0 : qtyToClose;
          const res = await input.executeBrokerActionViaApi({
            type: 'CLOSE_POSITION',
            status: 'PENDING',
            positionId: String(pos.id),
            qty: closeQty,
            symbol,
            source: 'playbook',
            reason: 'playbook_partial_close'
          });
          if (res?.ok) {
            const closedQty = closeQty > 0 ? closeQty : Number(positionSize);
            const stepId = String(stepHit.id || '');
            state.steps = (state.steps || []).map((step: any) => {
              if (String(step?.id || '') !== stepId) return step;
              return {
                ...step,
                status: 'done',
                filledQty: closedQty,
                filledAtMs: now
              };
            });
            state.lastActionAtMs = now;
            stateChanged = true;
            emitAudit(input.appendAuditEvent, 'playbook_partial_close', symbol, {
              entryId: entry.id,
              positionId: pos.id,
              stepId,
              rr: stepHit.rr,
              qtyClosed: closedQty,
              currentR
            });
          }
        }
      }

      if (stateChanged) {
        patch.playbookState = state;
        patch.playbookUpdatedAtMs = now;
      }

      if (Object.keys(patch).length > 0) {
        await ledger.update({ id: entry.id, patch });
      }
    }
  } finally {
    input.playbookRunningRef.current = false;
  }
}
