type ActionResult = { ok: boolean; error?: string; data?: any };

export type runCatalogChatLiveRuntimeInput = {
  actionId: string;
  payload: Record<string, any>;
  requestContext?: Record<string, any> | null;
  context: Record<string, any>;
};

export async function runCatalogChatLiveRuntime(
  runtimeInput: runCatalogChatLiveRuntimeInput
): Promise<{ handled: boolean; result?: ActionResult }> {
  const actionId = String(runtimeInput.actionId || '').trim();
  const payload = runtimeInput.payload && typeof runtimeInput.payload === 'object' ? runtimeInput.payload : {};
  const input = (runtimeInput.requestContext && typeof runtimeInput.requestContext === 'object'
    ? runtimeInput.requestContext
    : {}) as any;
  const context = runtimeInput.context && typeof runtimeInput.context === 'object' ? runtimeInput.context : {};
  const {
  chatChannel,
  chartHandlers,
  setReplyMode,
  clearChat,
  activeTabIdRef,
  tabsNow,
  chartChatContextRef,
  normalizeTimeframeKey,
  sendMessage,
  setAutoTabVisionEnabled,
  startLiveSession,
  stopLiveSession,
  liveStream,
  setPostTradeReviewEnabled,
  setPostTradeReviewAgentId,
  reviewLastClosedTrade
} = context as any;
  
    if (actionId === 'chat.reply_mode.set') {
      const mode = String(payload.mode || payload.replyMode || '').trim().toLowerCase();
      if (mode !== 'single' && mode !== 'team') return { ok: false, error: 'Reply mode must be single or team.' };
      if (chatChannel === 'chart' && typeof chartHandlers.setReplyMode === 'function') {
        chartHandlers.setReplyMode(mode as any);
      } else {
        if (chatChannel === 'chart') {
          return { ok: false, error: 'Chart chat reply mode unavailable.' };
        }
        setReplyMode(mode as any);
      }
      return { ok: true, data: { replyMode: mode, channel: chatChannel } };
    }

    if (actionId === 'chat.clear') {
      if (chatChannel === 'chart' && typeof chartHandlers.clearChat === 'function') {
        chartHandlers.clearChat();
      } else {
        if (chatChannel === 'chart') {
          return { ok: false, error: 'Chart chat clear unavailable.' };
        }
        clearChat();
      }
      return { ok: true, data: { cleared: true, channel: chatChannel } };
    }

    if (actionId === 'chat.playbook.default.set') {
      const playbookId = String(payload.playbookId || payload.id || payload.value || '').trim();
      if (!playbookId) return { ok: false, error: 'Playbook id is required.' };
      try {
        window.dispatchEvent(new CustomEvent('glass_chat_playbook_default', { detail: { playbookId, channel: chatChannel } }));
      } catch {
        return { ok: false, error: 'Unable to set default playbook.' };
      }
      return { ok: true, data: { playbookId, channel: chatChannel } };
    }

    if (actionId === 'chat.attachment.set') {
      const detail = payload && typeof payload === 'object' ? payload : {};
      if (!detail.channel) detail.channel = chatChannel;
      try {
        window.dispatchEvent(new CustomEvent('glass_chat_attachment', { detail }));
      } catch {
        return { ok: false, error: 'Unable to set chat attachment.' };
      }
      return { ok: true };
    }

    if (actionId === 'chat.snapshot.capture') {
      const detail = payload && typeof payload === 'object' ? payload : {};
      if (!detail.channel) detail.channel = chatChannel;
      try {
        window.dispatchEvent(new CustomEvent('glass_chat_snapshot_capture', { detail }));
      } catch {
        return { ok: false, error: 'Unable to capture chat snapshot.' };
      }
      return { ok: true };
    }

    if (actionId === 'chat.snapshot.send') {
      const detail = payload && typeof payload === 'object' ? payload : {};
      if (!detail.channel) detail.channel = chatChannel;
      try {
        window.dispatchEvent(new CustomEvent('glass_chat_snapshot_send', { detail }));
      } catch {
        return { ok: false, error: 'Unable to send chat snapshot.' };
      }
      return { ok: true };
    }

    if (actionId === 'chat.send') {
      const text = String(payload.text || payload.message || '').trim();
      if (!text) return { ok: false, error: 'Message text is required.' };
      const image = payload.image || payload.dataUrl || payload.attachment || null;
      if (chatChannel === 'chart' && typeof chartHandlers.sendMessage === 'function') {
        const context = chartChatContextRef.current || { url: 'chart://engine', title: 'Chart Engine' };
        const symbolOverride = String(payload.symbol || payload.symbolScope || payload.chartSymbol || '').trim();
        const timeframesRaw = payload.timeframes || payload.frames || payload.frameIds || payload.timeframe || null;
        const timeframesList = Array.isArray(timeframesRaw)
          ? timeframesRaw
          : typeof timeframesRaw === 'string'
            ? timeframesRaw.split(/[,\s]+/)
            : timeframesRaw != null
              ? [timeframesRaw]
              : [];
        const timeframes = timeframesList
          .map((tf) => normalizeTimeframeKey(String(tf || '').trim()))
          .filter(Boolean);
        const options = symbolOverride || timeframes.length > 0
          ? { symbol: symbolOverride || undefined, timeframes: timeframes.length > 0 ? timeframes : undefined }
          : undefined;
        await chartHandlers.sendMessage(text, context, [], image, options);
        return { ok: true, data: { sent: true, channel: 'chart' } };
      }
      if (chatChannel === 'chart') {
        return { ok: false, error: 'Chart chat send unavailable.' };
      }
      const tab = activeTabIdRef.current ? tabsNow.find((t) => t.id === activeTabIdRef.current) : null;
      const context = {
        url: tab?.url || 'about:blank',
        title: tab?.title || undefined
      };
      const monitored = (tabsNow || []).filter((t) => t.isWatched).map((t) => t.url);
      await sendMessage(text, context as any, monitored, image);
      return { ok: true, data: { sent: true, channel: 'chat' } };
    }

    if (actionId === 'chat.auto_tab_vision.set') {
      const enabled = payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : payload.on !== undefined ? !!payload.on : true;
      if (chatChannel === 'chart' && typeof chartHandlers.setAutoTabVisionEnabled === 'function') {
        chartHandlers.setAutoTabVisionEnabled(enabled);
      } else {
        if (chatChannel === 'chart') {
          return { ok: false, error: 'Chart chat auto tab vision unavailable.' };
        }
        setAutoTabVisionEnabled(enabled);
      }
      return { ok: true, data: { enabled, channel: chatChannel } };
    }

    if (actionId === 'live.start') {
      const typeRaw = String(payload.mode || payload.type || 'audio').trim().toLowerCase();
      const type = typeRaw === 'screen' ? 'screen' : typeRaw === 'camera' ? 'camera' : 'audio';
      if (chatChannel === 'chart') {
        if (typeof chartHandlers.startLiveSession !== 'function') {
          return { ok: false, error: 'Chart chat live session unavailable.' };
        }
        const res = await chartHandlers.startLiveSession(type as any);
        if (res?.ok === false) return { ok: false, error: res.error || 'Failed to start live session.' };
        return { ok: true, data: { started: true, mode: type, channel: chatChannel } };
      }
      const res = await startLiveSession(type as any);
      if (res?.ok === false) return { ok: false, error: res.error || 'Failed to start live session.' };
      return { ok: true, data: { started: true, mode: type, channel: chatChannel } };
    }

    if (actionId === 'live.stop') {
      if (chatChannel === 'chart' && typeof chartHandlers.stopLiveSession === 'function') {
        chartHandlers.stopLiveSession();
      } else {
        if (chatChannel === 'chart') {
          return { ok: false, error: 'Chart chat live stop unavailable.' };
        }
        stopLiveSession();
      }
      return { ok: true, data: { stopped: true, channel: chatChannel } };
    }

    if (actionId === 'live.mute' || actionId === 'live.unmute') {
      const stream = chatChannel === 'chart' ? chartHandlers.liveStream : liveStream;
      if (!stream) return { ok: false, error: 'Live stream not active.' };
      const enabled = actionId === 'live.unmute';
      stream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
      return { ok: true, data: { muted: !enabled, channel: chatChannel } };
    }

    if (actionId === 'post_trade_review.enable') {
      setPostTradeReviewEnabled(true);
      return { ok: true, data: { enabled: true } };
    }

    if (actionId === 'post_trade_review.disable') {
      setPostTradeReviewEnabled(false);
      return { ok: true, data: { enabled: false } };
    }

    if (actionId === 'post_trade_review.agent.set') {
      const agentId = String(payload.agentId || payload.id || '').trim();
      if (!agentId) return { ok: false, error: 'Agent id is required.' };
      setPostTradeReviewAgentId(agentId);
      return { ok: true, data: { agentId } };
    }

    if (actionId === 'post_trade_review.run_last') {
      const res = await reviewLastClosedTrade();
      if (!res?.ok) return { ok: false, error: res?.error || 'No closed trades found.' };
      return { ok: true, data: res ?? null };
    }


  return { handled: false };
}