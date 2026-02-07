type ActionResult = { ok: boolean; error?: string; data?: any };

export type runCatalogSettingsAutopilotRuntimeInput = {
  actionId: string;
  payload: Record<string, any>;
  requestContext?: Record<string, any> | null;
  context: Record<string, any>;
};

export async function runCatalogSettingsAutopilotRuntime(
  runtimeInput: runCatalogSettingsAutopilotRuntimeInput
): Promise<{ handled: boolean; result?: ActionResult }> {
  const actionId = String(runtimeInput.actionId || '').trim();
  const payload = runtimeInput.payload && typeof runtimeInput.payload === 'object' ? runtimeInput.payload : {};
  const input = (runtimeInput.requestContext && typeof runtimeInput.requestContext === 'object'
    ? runtimeInput.requestContext
    : {}) as any;
  const context = runtimeInput.context && typeof runtimeInput.context === 'object' ? runtimeInput.context : {};
  const {
  persistSetting,
  setAutoPilotConfig,
  activeBrokerIdRef
} = context as any;
  
    if (actionId === 'settings.openai.key.set') {
      const key = String(payload.key || payload.value || '').trim();
      if (!key) return { ok: false, error: 'OpenAI key is required.' };
      const secrets = window.glass?.secrets;
      if (!secrets?.setOpenAIKey) return { ok: false, error: 'Secure storage unavailable.' };
      const res = await secrets.setOpenAIKey({ key });
      if (!res?.ok) return { ok: false, error: res?.error ? String(res.error) : 'Failed to save OpenAI key.' };
      return { ok: true, data: res ?? null };
    }

    if (actionId === 'settings.openai.key.clear') {
      const secrets = window.glass?.secrets;
      if (!secrets?.clearOpenAIKey) return { ok: false, error: 'Secure storage unavailable.' };
      const res = await secrets.clearOpenAIKey();
      if (!res?.ok) return { ok: false, error: res?.error ? String(res.error) : 'Failed to clear OpenAI key.' };
      return { ok: true, data: res ?? null };
    }

    if (actionId === 'settings.openai.vector_store.set') {
      const ids = String(payload.ids ?? payload.value ?? '').trim();
      persistSetting('glass_openai_vector_store_ids', ids);
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'settings.openai.reasoning_effort.set') {
      const raw = String(payload.effort ?? payload.value ?? '').trim().toLowerCase();
      const allowed = new Set(['none', 'low', 'medium', 'high', 'xhigh']);
      const normalized = allowed.has(raw) ? raw : '';
      persistSetting('glass_openai_tech_reasoning_effort', normalized);
      return { ok: true, data: { effort: normalized || null } };
    }

    if (actionId === 'settings.gemini.key.set') {
      const key = String(payload.key || payload.value || '').trim();
      if (!key) return { ok: false, error: 'Gemini key is required.' };
      const secrets = window.glass?.secrets;
      if (!secrets?.setGeminiKey) return { ok: false, error: 'Secure storage unavailable.' };
      const res = await secrets.setGeminiKey({ key });
      if (!res?.ok) return { ok: false, error: res?.error ? String(res.error) : 'Failed to save Gemini key.' };
      return { ok: true, data: res ?? null };
    }

    if (actionId === 'settings.gemini.key.clear') {
      const secrets = window.glass?.secrets;
      if (!secrets?.clearGeminiKey) return { ok: false, error: 'Secure storage unavailable.' };
      const res = await secrets.clearGeminiKey();
      if (!res?.ok) return { ok: false, error: res?.error ? String(res.error) : 'Failed to clear Gemini key.' };
      return { ok: true, data: res ?? null };
    }

    if (actionId === 'settings.model.text.set') {
      persistSetting('glass_openai_text_model', payload.model ?? payload.value ?? '');
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'settings.model.vision.set') {
      persistSetting('glass_openai_vision_model', payload.model ?? payload.value ?? '');
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'settings.model.vision_detail.set') {
      const value = String(payload.detail ?? payload.value ?? '').trim().toLowerCase();
      const normalized = value === 'low' || value === 'high' ? value : '';
      persistSetting('glass_openai_vision_detail', normalized);
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'settings.model.live.set') {
      persistSetting('glass_openai_live_model', payload.model ?? payload.value ?? '');
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'settings.vision_interval.active.set') {
      const ms = Number(payload.ms ?? payload.value ?? payload.intervalMs);
      if (!Number.isFinite(ms) || ms <= 0) return { ok: false, error: 'Interval (ms) is required.' };
      persistSetting('glass_vision_active_interval_ms', String(Math.floor(ms)));
      return { ok: true, data: { intervalMs: Math.floor(ms) } };
    }

    if (actionId === 'settings.vision_interval.watched.set') {
      const ms = Number(payload.ms ?? payload.value ?? payload.intervalMs);
      if (!Number.isFinite(ms) || ms <= 0) return { ok: false, error: 'Interval (ms) is required.' };
      persistSetting('glass_vision_watched_interval_ms', String(Math.floor(ms)));
      return { ok: true, data: { intervalMs: Math.floor(ms) } };
    }

    if (actionId === 'settings.chart_watch_interval.set') {
      const ms = Number(payload.ms ?? payload.value ?? payload.intervalMs);
      if (!Number.isFinite(ms) || ms <= 0) return { ok: false, error: 'Interval (ms) is required.' };
      persistSetting('glass_chart_watch_interval_ms', String(Math.floor(ms)));
      return { ok: true, data: { intervalMs: Math.floor(ms) } };
    }

    if (actionId === 'settings.auto_watch_tradingview.set') {
      const enabled = payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : true;
      persistSetting('glass_auto_watch_tradingview', enabled, { normalizeBool: true });
      return { ok: true, data: { enabled } };
    }

    if (actionId === 'settings.chat_context.mode.set') {
      const mode = String(payload.mode ?? payload.value ?? '').trim();
      if (!mode) return { ok: false, error: 'Context mode is required.' };
      persistSetting('glass_chat_tab_context_mode', mode);
      return { ok: true, data: { mode } };
    }

    if (actionId === 'settings.chat_context.max_tabs.set') {
      const count = Number(payload.count ?? payload.maxTabs ?? payload.value);
      if (!Number.isFinite(count) || count <= 0) return { ok: false, error: 'Max tabs is required.' };
      persistSetting('glass_chat_tab_context_max_tabs', String(Math.max(1, Math.min(6, Math.floor(count)))));
      return { ok: true, data: { maxTabs: Math.max(1, Math.min(6, Math.floor(count))) } };
    }

    if (actionId === 'settings.chat_context.change_only.set') {
      const enabled = payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : true;
      persistSetting('glass_chat_tab_context_change_only', enabled, { normalizeBool: true });
      return { ok: true, data: { enabled } };
    }

    if (actionId === 'settings.chat_context.roi.set') {
      const roi = String(payload.roi ?? payload.value ?? '').trim();
      if (!roi) return { ok: false, error: 'ROI preset is required.' };
      persistSetting('glass_chat_tab_context_roi', roi);
      return { ok: true, data: { roi } };
    }

    if (actionId === 'settings.chat_context.redaction.set') {
      const redaction = String(payload.redaction ?? payload.value ?? '').trim();
      if (!redaction) return { ok: false, error: 'Redaction preset is required.' };
      persistSetting('glass_chat_tab_context_redaction', redaction);
      return { ok: true, data: { redaction } };
    }

    if (actionId === 'settings.broker.set_active') {
      const brokerId = String(payload.brokerId ?? payload.id ?? '').trim();
      if (!brokerId) return { ok: false, error: 'Broker id is required.' };
      const broker = window.glass?.broker;
      if (!broker?.setActive) return { ok: false, error: 'Broker registry unavailable.' };
      const res = await broker.setActive(brokerId);
      if (!res?.ok) return { ok: false, error: res?.error ? String(res.error) : 'Failed to set active broker.' };
      const normalized = brokerId.toLowerCase() === 'tradelocker'
        ? 'tradelocker'
        : brokerId.toLowerCase() === 'mt5'
          ? 'mt5'
          : null;
      activeBrokerIdRef.current = { id: normalized, updatedAtMs: Date.now() };
      return { ok: true, data: res ?? null };
    }

    if (actionId === 'ledger.flush') {
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.flush) return { ok: false, error: 'Trade ledger unavailable.' };
      const res = await ledger.flush();
      if (!res?.ok && res?.error) return { ok: false, error: String(res.error) };
      return { ok: true, data: res ?? null };
    }

    if (actionId === 'autopilot.update_settings') {
      if (!payload || Object.keys(payload).length === 0) {
        return { ok: false, error: 'No AutoPilot settings provided.' };
      }
      setAutoPilotConfig((prev) => ({
        ...prev,
        ...payload,
        telegram: payload.telegram
          ? { ...prev.telegram, ...payload.telegram }
          : prev.telegram
      }));
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'autopilot.enable') {
      setAutoPilotConfig((prev) => ({ ...prev, enabled: true }));
      return { ok: true, data: { enabled: true } };
    }

    if (actionId === 'autopilot.disable') {
      setAutoPilotConfig((prev) => ({ ...prev, enabled: false }));
      return { ok: true, data: { enabled: false } };
    }

    if (actionId === 'autopilot.mode.set') {
      const modeRaw = String(payload.mode || payload.autopilotMode || '').trim().toLowerCase();
      if (!modeRaw) return { ok: false, error: 'AutoPilot mode is required.' };
      setAutoPilotConfig((prev) => ({ ...prev, mode: modeRaw as any }));
      return { ok: true, data: { mode: modeRaw } };
    }

    if (actionId === 'autopilot.execution_mode.set') {
      const modeRaw = String(payload.executionMode || payload.mode || payload.value || '').trim().toLowerCase();
      if (!modeRaw) return { ok: false, error: 'Execution mode is required.' };
      if (!['live', 'paper', 'shadow'].includes(modeRaw)) {
        return { ok: false, error: 'Execution mode must be live, paper, or shadow.' };
      }
      setAutoPilotConfig((prev) => ({ ...prev, executionMode: modeRaw as any }));
      return { ok: true, data: { executionMode: modeRaw } };
    }

    if (actionId === 'autopilot.confirmation.set') {
      const enabled = payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : payload.on !== undefined ? !!payload.on : false;
      setAutoPilotConfig((prev) => ({ ...prev, requireConfirmation: enabled }));
      return { ok: true, data: { requireConfirmation: enabled } };
    }

    if (actionId === 'autopilot.killswitch.set') {
      const enabled = payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : payload.on !== undefined ? !!payload.on : true;
      setAutoPilotConfig((prev) => ({ ...prev, killSwitch: enabled }));
      return { ok: true, data: { killSwitch: enabled } };
    }

    if (actionId === 'autopilot.memory.filters.set') {
      const detail = {
        open: payload.open != null ? !!payload.open : undefined,
        query: payload.query != null ? String(payload.query) : undefined,
        filter: payload.filter != null ? String(payload.filter) : undefined,
        clear: payload.clear === true
      };
      try {
        window.dispatchEvent(new CustomEvent('glass_autopilot_memory_filters', { detail }));
      } catch {
        return { ok: false, error: 'Unable to update AutoPilot memory filters.' };
      }
      return { ok: true, data: detail };
    }

    if (actionId === 'autopilot.memory.draft.set') {
      const detail = payload && typeof payload === 'object' ? { ...payload } : {};
      try {
        window.dispatchEvent(new CustomEvent('glass_autopilot_memory_draft', { detail }));
      } catch {
        return { ok: false, error: 'Unable to update AutoPilot memory draft.' };
      }
      return { ok: true, data: detail };
    }

    if (actionId === 'autopilot.flow.filters.set') {
      const detail = {
        symbol: payload.symbol != null ? String(payload.symbol) : undefined,
        timeframe: payload.timeframe != null ? String(payload.timeframe) : undefined,
        clear: payload.clear === true
      };
      try {
        window.dispatchEvent(new CustomEvent('glass_autopilot_flow_filters', { detail }));
      } catch {
        return { ok: false, error: 'Unable to update AutoPilot flow filters.' };
      }
      return { ok: true, data: detail };
    }

    if (actionId === 'autopilot.run.select') {
      const detail = {
        runId: payload.runId ?? payload.id ?? payload.taskTreeRunId ?? null,
        actionRunId: payload.actionRunId ?? payload.actionId ?? null,
        clear: payload.clear === true
      };
      try {
        window.dispatchEvent(new CustomEvent('glass_autopilot_run_select', { detail }));
      } catch {
        return { ok: false, error: 'Unable to select AutoPilot run.' };
      }
      return { ok: true, data: detail };
    }

    if (actionId === 'autopilot.truth.run.set') {
      const detail = payload && typeof payload === 'object' ? { ...payload } : {};
      try {
        window.dispatchEvent(new CustomEvent('glass_autopilot_truth_run', { detail }));
      } catch {
        return { ok: false, error: 'Unable to update AutoPilot truth replay.' };
      }
      return { ok: true, data: detail };
    }

    if (actionId === 'autopilot.telegram.inputs.set') {
      const detail = {
        botToken: payload.botToken ?? payload.token ?? payload.value ?? null,
        chatId: payload.chatId ?? payload.chat ?? null,
        clear: payload.clear === true
      };
      try {
        window.dispatchEvent(new CustomEvent('glass_autopilot_telegram_inputs', { detail }));
      } catch {
        return { ok: false, error: 'Unable to update AutoPilot Telegram inputs.' };
      }
      return { ok: true, data: detail };
    }


  return { handled: false };
}