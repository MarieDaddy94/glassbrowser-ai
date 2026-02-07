type ActionResult = { ok: boolean; error?: string; data?: any };

export type runCatalogPlaybookRuntimeInput = {
  actionId: string;
  payload: Record<string, any>;
  requestContext?: Record<string, any> | null;
  context: Record<string, any>;
};

export async function runCatalogPlaybookRuntime(
  runtimeInput: runCatalogPlaybookRuntimeInput
): Promise<{ handled: boolean; result?: ActionResult }> {
  const actionId = String(runtimeInput.actionId || '').trim();
  const payload = runtimeInput.payload && typeof runtimeInput.payload === 'object' ? runtimeInput.payload : {};
  const input = (runtimeInput.requestContext && typeof runtimeInput.requestContext === 'object'
    ? runtimeInput.requestContext
    : {}) as any;
  const context = runtimeInput.context && typeof runtimeInput.context === 'object' ? runtimeInput.context : {};
  const {
  enqueuePlaybookRunRef,
  definition,
  taskPlaybooksRef,
  upsertTaskPlaybook,
  resumePlaybookRunRef
} = context as any;
  
    if (actionId === 'playbook.run') {
      const enqueueRun = enqueuePlaybookRunRef.current;
      if (!enqueueRun) return { ok: false, error: 'Playbook runner unavailable.' };
      const res = enqueueRun({
        playbookId: payload.playbookId || payload.id || payload.playbookKey || null,
        playbook: payload.playbook || null,
        symbol: payload.symbol || input?.symbol || null,
        timeframe: payload.timeframe || input?.timeframe || null,
        timeframes: Array.isArray(payload.timeframes)
          ? payload.timeframes
          : Array.isArray(payload.frames)
            ? payload.frames
            : null,
        strategy: payload.strategy || input?.strategy || null,
        mode: payload.mode || input?.mode || null,
        source: payload.source || input?.source || 'playbook',
        reason: payload.reason || definition?.summary || null
      });
      if (!res.ok) {
        return { ok: false, error: res.error || 'Failed to start playbook.' };
      }
      return { ok: true, data: { runId: res.runId || null, queued: res.queued ?? null } };
    }

    if (actionId === 'playbook.list') {
      const playbooks = taskPlaybooksRef.current || [];
      const list = playbooks.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        version: p.version ?? null,
        defaultMode: p.defaultMode ?? null,
        symbol: p.symbol ?? null,
        timeframes: p.timeframes ?? null,
        strategy: p.strategy ?? null
      }));
      return { ok: true, data: list };
    }

    if (actionId === 'playbook.save') {
      const raw = payload.playbook && typeof payload.playbook === 'object' ? payload.playbook : payload;
      const result = await upsertTaskPlaybook(raw as any, payload.source || 'agent');
      if (!result.ok) return { ok: false, error: result.error || 'Failed to save playbook.' };
      return { ok: true, data: result.playbook || null };
    }

    if (actionId === 'playbook.run.list') {
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.listPlaybookRuns) return { ok: false, error: 'Playbook runs unavailable.' };
      const limit = Number.isFinite(Number(payload.limit)) ? Math.max(1, Math.floor(Number(payload.limit))) : 40;
      const status = payload.status ? String(payload.status).trim() : undefined;
      const playbookId = payload.playbookId ? String(payload.playbookId).trim() : undefined;
      const symbol = payload.symbol ? String(payload.symbol).trim() : undefined;
      const timeframe = payload.timeframe ? String(payload.timeframe).trim() : undefined;
      const strategy = payload.strategy ? String(payload.strategy).trim() : undefined;
      const res = await ledger.listPlaybookRuns({ limit, status, playbookId, symbol, timeframe, strategy });
      if (!res?.ok) return { ok: false, error: res?.error || 'Failed to list playbook runs.' };
      return { ok: true, data: { runs: res.runs || [] } };
    }

    if (actionId === 'playbook.run.get') {
      const runId = String(payload.runId || payload.id || '').trim();
      if (!runId) return { ok: false, error: 'Playbook run id is required.' };
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.getPlaybookRun) return { ok: false, error: 'Playbook runs unavailable.' };
      const res = await ledger.getPlaybookRun({ runId });
      if (!res?.ok || !res.run) return { ok: false, error: res?.error || 'Playbook run not found.' };
      return { ok: true, data: { run: res.run } };
    }

    if (actionId === 'playbook.run.resume') {
      const runId = String(payload.runId || payload.id || '').trim();
      if (!runId) return { ok: false, error: 'Playbook run id is required.' };
      const resume = resumePlaybookRunRef.current;
      if (!resume) return { ok: false, error: 'Playbook resume unavailable.' };
      const action = payload.action ? String(payload.action).trim() : undefined;
      const opts = {
        action: action === 'approve' || action === 'skip' || action === 'abort' || action === 'resume' ? action : undefined,
        stepId: payload.stepId ? String(payload.stepId).trim() : undefined,
        actionId: payload.stepActionId ? String(payload.stepActionId).trim() : undefined,
        overrides: payload.overrides && typeof payload.overrides === 'object' ? payload.overrides : undefined
      };
      const res = await resume(runId, opts);
      if (!res?.ok) return { ok: false, error: res?.error || 'Failed to resume playbook run.', data: res ?? null };
      return { ok: true, data: res ?? null };
    }


  return { handled: false };
}