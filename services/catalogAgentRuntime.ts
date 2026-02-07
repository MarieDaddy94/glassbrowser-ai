// @ts-nocheck
type ActionResult = { ok: boolean; error?: string; data?: any };

export type runCatalogAgentRuntimeInput = {
  actionId: string;
  payload: Record<string, any>;
  requestContext?: Record<string, any> | null;
  context: Record<string, any>;
};

export async function runCatalogAgentRuntime(runtimeInput: runCatalogAgentRuntimeInput): Promise<{ handled: boolean; result?: ActionResult }> {
  const actionId = String(runtimeInput.actionId || '').trim();
  const payload = runtimeInput.payload && typeof runtimeInput.payload === 'object' ? runtimeInput.payload : {};
  const input = (runtimeInput.requestContext && typeof runtimeInput.requestContext === 'object'
    ? runtimeInput.requestContext
    : {}) as any;
  const context = runtimeInput.context && typeof runtimeInput.context === 'object' ? runtimeInput.context : {};
  const AgentTestRun = (context as any).AgentTestRun;
  const CustomEvent = (context as any).CustomEvent;
  const Record = (context as any).Record;
  const TaskTreeRunSummary = (context as any).TaskTreeRunSummary;
  const TruthReplay = (context as any).TruthReplay;
  const actionTaskTreeRunsState = (context as any).actionTaskTreeRunsState;
  const addAgent = (context as any).addAgent;
  const addManualMemory = (context as any).addManualMemory;
  const agentTestPendingRef = (context as any).agentTestPendingRef;
  const agentsRef = (context as any).agentsRef;
  const buildAgentTestRun = (context as any).buildAgentTestRun;
  const buildAgentTestRunKey = (context as any).buildAgentTestRunKey;
  const buildShadowTradeCompare = (context as any).buildShadowTradeCompare;
  const buildTruthReplay = (context as any).buildTruthReplay;
  const deleteAgent = (context as any).deleteAgent;
  const deleteTradeMemory = (context as any).deleteTradeMemory;
  const enqueuePlaybookRunRef = (context as any).enqueuePlaybookRunRef;
  const executeAgentToolRequest = (context as any).executeAgentToolRequest;
  const executeCatalogAction = (context as any).executeCatalogAction;
  const getTechAgentLogs = (context as any).getTechAgentLogs;
  const handleReplayTaskTree = (context as any).handleReplayTaskTree;
  const isEntryClosed = (context as any).isEntryClosed;
  const isShadowEntry = (context as any).isShadowEntry;
  const liveErrorsRef = (context as any).liveErrorsRef;
  const loadAgentTestScenario = (context as any).loadAgentTestScenario;
  const loadAuditActionRuntimeModule = (context as any).loadAuditActionRuntimeModule;
  const loadChangesShadowActionRuntimeModule = (context as any).loadChangesShadowActionRuntimeModule;
  const loadNotesActionRuntimeModule = (context as any).loadNotesActionRuntimeModule;
  const normalizeAgentTestScenario = (context as any).normalizeAgentTestScenario;
  const normalizeSymbolKey = (context as any).normalizeSymbolKey;
  const persistAgentTestRun = (context as any).persistAgentTestRun;
  const persistAgentTestScenario = (context as any).persistAgentTestScenario;
  const refreshShadowTrades = (context as any).refreshShadowTrades;
  const resolveScenarioPlaybook = (context as any).resolveScenarioPlaybook;
  const resumeTaskTreeRun = (context as any).resumeTaskTreeRun;
  const setShadowTradeCompare = (context as any).setShadowTradeCompare;
  const setTimeout = (context as any).setTimeout;
  const shadowLedgerCacheRef = (context as any).shadowLedgerCacheRef;
  const shadowTradeCompare = (context as any).shadowTradeCompare;
  const shadowTradeCompareAtRef = (context as any).shadowTradeCompareAtRef;
  const shadowTradeCompareRef = (context as any).shadowTradeCompareRef;
  const shadowTradeStats = (context as any).shadowTradeStats;
  const shadowTradeStatsRef = (context as any).shadowTradeStatsRef;
  const switchAgent = (context as any).switchAgent;
  const taskTreeRunsState = (context as any).taskTreeRunsState;
  const updateAgentRef = (context as any).updateAgentRef;
  const updateTradeMemory = (context as any).updateTradeMemory;

    if (actionId === 'agent.add') {
      const before = new Set((agentsRef.current || []).map((agent) => agent.id));
      addAgent();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const created = (agentsRef.current || []).find((agent) => !before.has(agent.id)) || null;
      if (created) {
        const patch: Record<string, any> = {};
        if (payload.name != null) patch.name = String(payload.name);
        if (payload.systemInstruction != null || payload.instruction != null) {
          patch.systemInstruction = String(payload.systemInstruction ?? payload.instruction);
        }
        if (payload.color != null) patch.color = String(payload.color);
        if (payload.type != null) patch.type = String(payload.type);
        if (payload.capabilities != null) patch.capabilities = payload.capabilities;
        if (Object.keys(patch).length > 0) {
          const agentUpdater = updateAgentRef.current;
          if (!agentUpdater) return { ok: false, error: 'Agent update handler unavailable.' };
          agentUpdater({ ...created, ...patch });
        }
        if (payload.active === true) switchAgent(created.id);
      }
      return { ok: true, data: { agentId: created?.id || null } };
    }

    if (actionId === 'agent.update') {
      const id = String(payload.agentId || payload.id || '').trim();
      const name = !id && payload.name ? String(payload.name).trim() : '';
      const target =
        (agentsRef.current || []).find((agent) => agent.id === id) ||
        (name ? (agentsRef.current || []).find((agent) => agent.name === name) : null);
      if (!target) return { ok: false, error: 'Agent not found.' };
      const patch: Record<string, any> = {};
      if (payload.name != null) patch.name = String(payload.name);
      if (payload.systemInstruction != null || payload.instruction != null) {
        patch.systemInstruction = String(payload.systemInstruction ?? payload.instruction);
      }
      if (payload.color != null) patch.color = String(payload.color);
      if (payload.type != null) patch.type = String(payload.type);
      if (payload.capabilities != null) patch.capabilities = payload.capabilities;
      {
        const agentUpdater = updateAgentRef.current;
        if (!agentUpdater) return { ok: false, error: 'Agent update handler unavailable.' };
        agentUpdater({ ...target, ...patch });
      }
      if (payload.active === true) switchAgent(target.id);
      return { ok: true, data: { agentId: target.id } };
    }

    if (actionId === 'agent.delete') {
      const id = String(payload.agentId || payload.id || '').trim();
      if (!id) return { ok: false, error: 'Agent id is required.' };
      deleteAgent(id);
      return { ok: true, data: { agentId: id } };
    }

    if (actionId === 'agent.switch') {
      const id = String(payload.agentId || payload.id || '').trim();
      if (!id) return { ok: false, error: 'Agent id is required.' };
      switchAgent(id);
      return { ok: true, data: { agentId: id } };
    }

    if (actionId === 'agent.memory.get') {
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.getAgentMemory) return { ok: false, error: 'Agent memory unavailable.' };
      const id = payload.id ? String(payload.id).trim() : undefined;
      const key = payload.key ? String(payload.key).trim() : undefined;
      const res = await ledger.getAgentMemory({ id, key });
      if (!res?.ok) return { ok: false, error: res?.error || 'Failed to fetch agent memory.' };
      return { ok: true, data: { memory: res.memory || null } };
    }

    if (actionId === 'agent.memory.list') {
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.listAgentMemory) return { ok: false, error: 'Agent memory unavailable.' };
      const limit = Number.isFinite(Number(payload.limit)) ? Math.max(1, Math.floor(Number(payload.limit))) : 500;
      const symbol = payload.symbol ? String(payload.symbol).trim() : undefined;
      const timeframe = payload.timeframe ? String(payload.timeframe).trim() : undefined;
      const kind = payload.kind ? String(payload.kind).trim() : undefined;
      const tags = Array.isArray(payload.tags) ? payload.tags : undefined;
      const agentId = payload.agentId ? String(payload.agentId).trim() : undefined;
      const scope = payload.scope ?? undefined;
      const category = payload.category ? String(payload.category).trim() : undefined;
      const subcategory = payload.subcategory ? String(payload.subcategory).trim() : undefined;
      const res = await ledger.listAgentMemory({ limit, symbol, timeframe, kind, tags, agentId, scope, category, subcategory });
      if (!res?.ok) return { ok: false, error: res?.error || 'Failed to list agent memory.' };
      return { ok: true, data: { memories: res.memories || [] } };
    }

    if (actionId === 'agent.memory.clear') {
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.clearAgentMemory) return { ok: false, error: 'Agent memory unavailable.' };
      const res = await ledger.clearAgentMemory();
      if (!res?.ok) return { ok: false, error: res?.error || 'Failed to clear agent memory.' };
      return { ok: true, data: { cleared: true } };
    }

    if (actionId === 'agent.memory.filters.set') {
      const detail = payload && typeof payload === 'object' ? payload : {};
      try {
        window.dispatchEvent(new CustomEvent('glass_agent_memory_filters', { detail }));
      } catch {
        return { ok: false, error: 'Unable to update agent memory filters.' };
      }
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'agent.memory.export') {
      const detail = payload && typeof payload === 'object' ? payload : {};
      try {
        window.dispatchEvent(new CustomEvent('glass_agent_memory_export', { detail }));
      } catch {
        return { ok: false, error: 'Unable to export agent memory.' };
      }
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'agent.memory.add') {
      const text = String(payload.text || '').trim();
      const type = String(payload.type || '').trim().toUpperCase();
      const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : undefined;
      const res = await addManualMemory({ type: type === 'LOSS' ? 'LOSS' : 'WIN', text, meta });
      if (!res.ok) return { ok: false, error: res.error || 'Failed to add memory.' };
      return { ok: true, data: { memory: res.memory } };
    }

    if (actionId === 'agent.memory.update') {
      const id = String(payload.id || payload.memoryId || '').trim();
      if (!id) return { ok: false, error: 'Memory id is required.' };
      const patch: Record<string, any> = {};
      if (payload.text != null) patch.text = payload.text;
      if (payload.type != null) patch.type = payload.type;
      if (payload.meta != null) patch.meta = payload.meta;
      const res = await updateTradeMemory(id, patch);
      if (!res.ok) return { ok: false, error: res.error || 'Failed to update memory.' };
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'agent.memory.delete') {
      const id = String(payload.id || payload.memoryId || '').trim();
      if (!id) return { ok: false, error: 'Memory id is required.' };
      const res = await deleteTradeMemory(id);
      if (!res.ok) return { ok: false, error: res.error || 'Failed to delete memory.' };
      return { ok: true, data: { deleted: true } };
    }

    if (actionId === 'agent.memory.export') {
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.listAgentMemory) return { ok: false, error: 'Agent memory unavailable.' };
      const limit = Number.isFinite(Number(payload.limit)) ? Math.max(1, Math.floor(Number(payload.limit))) : 500;
      const symbol = payload.symbol ? String(payload.symbol).trim() : undefined;
      const timeframe = payload.timeframe ? String(payload.timeframe).trim() : undefined;
      const kind = payload.kind ? String(payload.kind).trim() : undefined;
      const tags = Array.isArray(payload.tags) ? payload.tags : undefined;
      const agentId = payload.agentId ? String(payload.agentId).trim() : undefined;
      const scope = payload.scope ?? undefined;
      const category = payload.category ? String(payload.category).trim() : undefined;
      const subcategory = payload.subcategory ? String(payload.subcategory).trim() : undefined;
      const res = await ledger.listAgentMemory({ limit, symbol, timeframe, kind, tags, agentId, scope, category, subcategory });
      if (!res?.ok) return { ok: false, error: res?.error || 'Failed to list agent memory.' };
      const memories = Array.isArray(res.memories) ? res.memories : [];
      const payloadOut = JSON.stringify(
        {
          schemaVersion: 1,
          exportedAtMs: Date.now(),
          memories
        },
        null,
        2
      );
      const mode = String(payload.mode || 'return').trim().toLowerCase();
      if (mode === 'return') return { ok: true, data: { payload: payloadOut } };
      if (mode === 'clipboard') {
        try {
          const fn = window.glass?.clipboard?.writeText;
          if (fn) {
            const resCopy = fn(payloadOut);
            if (resCopy && typeof resCopy.then === 'function') await resCopy;
            return { ok: true, data: { copied: true } };
          }
        } catch {
          // ignore
        }
        return { ok: false, error: 'Clipboard unavailable.' };
      }
      const saver = window.glass?.saveUserFile;
      if (!saver) return { ok: false, error: 'Save unavailable.' };
      const resSave = await saver({
        data: payloadOut,
        mimeType: 'application/json',
        subdir: 'agent-memory',
        prefix: 'agent_memory'
      });
      if (!resSave?.ok) return { ok: false, error: resSave?.error || 'Export failed.' };
      return { ok: true, data: { filename: resSave.filename || null } };
    }

    if (actionId === 'agent_test.scenario.create') {
      const scenarioInput = payload.scenario && typeof payload.scenario === 'object' ? payload.scenario : payload;
      const scenario = normalizeAgentTestScenario(scenarioInput);
      if (!scenario) return { ok: false, error: 'Invalid test scenario.' };
      const res = await persistAgentTestScenario(scenario);
      if (!res.ok) return { ok: false, error: res.error || 'Failed to save test scenario.' };
      return { ok: true, data: { scenario } };
    }

    if (actionId === 'agent_test.scenario.list') {
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.listAgentMemory) return { ok: false, error: 'Agent memory unavailable.' };
      const limit = Number.isFinite(Number(payload.limit)) ? Math.max(1, Math.floor(Number(payload.limit))) : 100;
      const symbol = payload.symbol ? String(payload.symbol).trim() : undefined;
      const timeframe = payload.timeframe ? String(payload.timeframe).trim() : undefined;
      const tags = Array.isArray(payload.tags) ? payload.tags : undefined;
      const res = await ledger.listAgentMemory({ limit, kind: 'agent_test_scenario', symbol, timeframe, tags });
      if (!res?.ok) return { ok: false, error: res?.error || 'Failed to list scenarios.' };
      const scenarios = (Array.isArray(res.memories) ? res.memories : [])
        .map((entry: any) => normalizeAgentTestScenario(entry?.payload || entry))
        .filter(Boolean);
      return { ok: true, data: { scenarios } };
    }

    if (actionId === 'agent_test.scenario.get') {
      const id = String(payload.scenarioId || payload.id || '').trim();
      const key = payload.key ? String(payload.key).trim() : '';
      const res = await loadAgentTestScenario({ id: id || undefined, key: key || undefined });
      if (!res.ok) return { ok: false, error: res.error || 'Scenario not found.' };
      return { ok: true, data: { scenario: res.scenario } };
    }

    if (actionId === 'agent_test.run') {
      const rawScenarioId = String(payload.scenarioId || payload.id || '').trim();
      const scenarioInput = payload.scenario && typeof payload.scenario === 'object' ? payload.scenario : null;
      let scenario = scenarioInput ? normalizeAgentTestScenario(scenarioInput) : null;
      if (!scenario && rawScenarioId) {
        const scenarioKey = rawScenarioId.startsWith('agent_test_scenario:') ? rawScenarioId : '';
        const scenarioId = scenarioKey ? '' : rawScenarioId;
        const loadRes = await loadAgentTestScenario({
          id: scenarioId || undefined,
          key: scenarioKey || undefined
        });
        if (!loadRes.ok) return { ok: false, error: loadRes.error || 'Scenario not found.' };
        scenario = loadRes.scenario;
      }
      if (!scenario) return { ok: false, error: 'Scenario is required.' };
      const overrides = payload.context && typeof payload.context === 'object' ? payload.context : null;
      const expectedOverride = payload.expected && typeof payload.expected === 'object' ? payload.expected : null;
      const scenarioForRun = (overrides || expectedOverride)
        ? (normalizeAgentTestScenario({
            ...scenario,
            id: scenario.id,
            name: scenario.name,
            expected: expectedOverride || scenario.expected,
            context: {
              ...(scenario.context || {}),
              ...(overrides || {})
            }
          }) || scenario)
        : scenario;
      if (payload.persistScenario !== false) {
        await persistAgentTestScenario(scenarioForRun);
      }
      const playbookSpec = resolveScenarioPlaybook(scenarioForRun);
      if (!playbookSpec.playbookId && !playbookSpec.playbook) {
        return { ok: false, error: 'Scenario playbook is missing.' };
      }
      const enqueueRun = enqueuePlaybookRunRef.current;
      if (!enqueueRun) return { ok: false, error: 'Playbook runner unavailable.' };
      const runSymbol = String(payload.symbol || scenarioForRun.context?.symbol || '').trim();
      const runTimeframe = String(payload.timeframe || scenarioForRun.context?.timeframe || '').trim();
      const runTimeframes = Array.isArray(payload.timeframes)
        ? payload.timeframes.map((tf: any) => String(tf).trim()).filter(Boolean)
        : scenarioForRun.context?.timeframes || null;
      const runStrategy = payload.strategy || scenarioForRun.context?.strategy || null;
      const runMode = payload.mode || scenarioForRun.context?.mode || null;
      const res = enqueueRun({
        playbookId: playbookSpec.playbookId,
        playbook: playbookSpec.playbook || null,
        symbol: runSymbol || undefined,
        timeframe: runTimeframe || undefined,
        timeframes: runTimeframes || undefined,
        strategy: runStrategy || undefined,
        mode: runMode || undefined,
        source: payload.source || 'agent_test',
        reason: payload.reason || scenarioForRun.name
      });
      if (!res.ok || !res.runId) return { ok: false, error: res.error || 'Failed to start scenario run.' };
      const baseRun = buildAgentTestRun({ runId: res.runId, scenario: scenarioForRun, status: 'running' });
      agentTestPendingRef.current.set(res.runId, { scenario: scenarioForRun, run: baseRun });
      await persistAgentTestRun(baseRun, scenarioForRun);
      return { ok: true, data: { runId: res.runId, testRunId: baseRun.id, scenarioId: scenarioForRun.id } };
    }

    if (actionId === 'agent_test.run.list') {
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.listAgentMemory) return { ok: false, error: 'Agent memory unavailable.' };
      const limit = Number.isFinite(Number(payload.limit)) ? Math.max(1, Math.floor(Number(payload.limit))) : 100;
      const symbol = payload.symbol ? String(payload.symbol).trim() : undefined;
      const timeframe = payload.timeframe ? String(payload.timeframe).trim() : undefined;
      const tags = Array.isArray(payload.tags) ? payload.tags : undefined;
      const res = await ledger.listAgentMemory({ limit, kind: 'agent_test_run', symbol, timeframe, tags });
      if (!res?.ok) return { ok: false, error: res?.error || 'Failed to list test runs.' };
      const scenarioId = payload.scenarioId ? String(payload.scenarioId).trim() : '';
      let runs = (Array.isArray(res.memories) ? res.memories : [])
        .map((entry: any) => entry?.payload || entry)
        .filter(Boolean) as AgentTestRun[];
      if (scenarioId) {
        runs = runs.filter((run) => String(run.scenarioId || '').trim() === scenarioId);
      }
      return { ok: true, data: { runs } };
    }

    if (actionId === 'agent_test.run.get') {
      const runId = String(payload.runId || payload.id || '').trim();
      const key = payload.key ? String(payload.key).trim() : '';
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.getAgentMemory) return { ok: false, error: 'Agent memory unavailable.' };
      const idIsKey = runId.startsWith('agent_test_run:');
      const res = await ledger.getAgentMemory({
        key: key || (runId ? (idIsKey ? runId : buildAgentTestRunKey(runId)) : undefined),
        id: idIsKey ? undefined : (runId || undefined)
      });
      if (!res?.ok || !res.memory) return { ok: false, error: res?.error || 'Test run not found.' };
      const run = res.memory.payload || res.memory;
      const includeReplay = payload.includeReplay === true;
      let replay: TruthReplay | null = null;
      if (includeReplay) {
        const replayRes = await buildTruthReplay({ runId: run.runId || runId, limit: payload.limit });
        if (replayRes?.ok && replayRes.replay) replay = replayRes.replay;
      }
      return { ok: true, data: { run, replay } };
    }

    {
      const notesRuntime = await loadNotesActionRuntimeModule();
      const runtimeRes = await notesRuntime.runNotesActionRuntime({ actionId, payload });
      if (runtimeRes.handled) return runtimeRes.result || { ok: false, error: 'Notes action failed.' };
    }

    {
      const auditRuntime = await loadAuditActionRuntimeModule();
      const runtimeRes = await auditRuntime.runAuditActionRuntime({
        actionId,
        payload,
        executeAgentToolRequest,
        liveErrors: liveErrorsRef.current || [],
        getTechAgentLogs
      });
      if (runtimeRes.handled) return runtimeRes.result || { ok: false, error: 'Audit action failed.' };
    }

    if (actionId === 'truth.replay') {
      const runId = payload.runId || payload.id || payload.run || null;
      const symbol = payload.symbol || null;
      const limit = payload.limit;
      const res = await buildTruthReplay({ runId, symbol, limit });
      if (!res.ok) return { ok: false, error: res.error || 'Truth replay failed.' };
      return { ok: true, data: res.replay };
    }

    if (actionId === 'task_tree.replay') {
      const runId = String(payload.runId || payload.id || payload.taskTreeRunId || '').trim();
      const provided = payload.summary && typeof payload.summary === 'object' ? payload.summary : null;
      const candidates = [...taskTreeRunsState, ...actionTaskTreeRunsState];
      const match = runId
        ? candidates.find((run) => String(run?.summary?.runId || run?.runId || '') === runId) || null
        : null;
      const summary = (match?.summary || match || provided) as TaskTreeRunSummary | null;
      if (!summary || !summary.runId) return { ok: false, error: 'Task tree run not found.' };
      handleReplayTaskTree(summary);
      return { ok: true, data: { runId: summary.runId } };
    }

    if (actionId === 'task_tree.resume' || actionId === 'task_tree.abort') {
      const taskTypeRaw = String(payload.taskType || payload.type || '').trim().toLowerCase();
      const taskType = taskTypeRaw === 'action' ? 'action' : 'signal';
      const runId = payload.runId || payload.id || payload.taskTreeRunId || null;
      const action = actionId === 'task_tree.abort'
        ? 'abort'
        : (payload.action === 'abort'
            ? 'abort'
            : payload.action === 'approve'
              ? 'approve'
              : payload.action === 'skip'
                ? 'skip'
                : 'resume');
      const res = await resumeTaskTreeRun({ taskType, runId, action });
      if (!res?.ok) return { ok: false, error: res?.error || 'Task tree resume failed.', data: res ?? null };
      return { ok: true, data: res };
    }

    {
      const changesShadowRuntime = await loadChangesShadowActionRuntimeModule();
      const runtimeRes = await changesShadowRuntime.runChangesShadowActionRuntime({
        actionId,
        payload,
        executeCatalogAction: async (ctx) => executeCatalogAction({ actionId: ctx.actionId, payload: ctx.payload || {} }),
        refreshShadowTrades,
        shadowTradeStatsRef,
        shadowTradeCompareRef,
        shadowTradeCompareAtRef,
        shadowLedgerCacheRef,
        shadowTradeStatsState: shadowTradeStats,
        shadowTradeCompareState: shadowTradeCompare,
        setShadowTradeCompare,
        normalizeSymbolKey,
        isShadowEntry,
        isEntryClosed,
        buildShadowTradeCompare
      });
      if (runtimeRes.handled) return runtimeRes.result || { ok: false, error: 'Changes/Shadow action failed.' };
    }



  return { handled: false };
}
