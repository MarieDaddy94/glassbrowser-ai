import React from 'react';
import { Clipboard, Cpu, Eye, EyeOff, Lock } from 'lucide-react';
import type { AiKeysSectionProps } from './types';

const AiKeysSection: React.FC<AiKeysSectionProps> = ({ ctx }) => {
  const {
    showOpenai,
    setShowOpenai,
    openaiKey,
    setOpenaiKey,
    openaiKeyStored,
    secretsAvailable,
    readClipboardText,
    onRunActionCatalog,
    refreshSecretsStatus,
    showGemini,
    setShowGemini,
    geminiKey,
    setGeminiKey,
    geminiKeyStored,
    textModelSelectValue,
    setTextModel,
    textModelIsPreset,
    textModel,
    visionModelSelectValue,
    setVisionModel,
    visionModelIsPreset,
    visionModel,
    visionDetail,
    setVisionDetail,
    liveModelSelectValue,
    setLiveModel,
    liveModelIsPreset,
    liveModel,
    vectorStoreIds,
    setVectorStoreIds,
    techReasoningEffort,
    setTechReasoningEffort,
    activeVisionIntervalMs,
    setActiveVisionIntervalMs,
    watchedVisionIntervalMs,
    setWatchedVisionIntervalMs,
    chartWatchIntervalMs,
    setChartWatchIntervalMs,
    autoWatchTradingView,
    setAutoWatchTradingView,
    chatTabContextMode,
    setChatTabContextMode,
    chatTabContextMaxTabs,
    setChatTabContextMaxTabs,
    chatTabContextRoi,
    setChatTabContextRoi,
    chatTabContextRedaction,
    setChatTabContextRedaction,
    chatTabContextChangeOnly,
    setChatTabContextChangeOnly,
    OPENAI_TEXT_MODEL_PRESETS,
    OPENAI_VISION_MODEL_PRESETS,
    OPENAI_VISION_DETAIL_PRESETS,
    OPENAI_LIVE_MODEL_PRESETS,
    OPENAI_TECH_REASONING_PRESETS,
  } = ctx;

  return (
    <>
      <div className="space-y-2">
        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">OpenAI API Key</label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type={showOpenai ? 'text' : 'password'}
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 pr-16 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 transition-colors font-mono"
              placeholder={openaiKeyStored ? 'Stored in secure keychain' : 'sk-...'}
              autoFocus
            />
            <button
              type="button"
              onClick={async () => {
                const text = await readClipboardText();
                if (text) setOpenaiKey(text.trim());
              }}
              className="absolute right-9 top-2 text-gray-500 hover:text-gray-200"
              title="Paste from clipboard"
            >
              <Clipboard size={16} />
            </button>
            <button
              type="button"
              onClick={() => setShowOpenai((v: boolean) => !v)}
              className="absolute right-2 top-2 text-gray-500 hover:text-gray-200"
              title={showOpenai ? 'Hide' : 'Show'}
            >
              {showOpenai ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (onRunActionCatalog) {
                await onRunActionCatalog({ actionId: 'settings.openai.key.clear', payload: {} });
              } else {
                const secrets = (window as any)?.glass?.secrets;
                if (secrets?.clearOpenAIKey) await secrets.clearOpenAIKey();
              }
              setOpenaiKey('');
              await refreshSecretsStatus();
            }}
            className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-white/10 hover:bg-white/20 text-gray-200"
          >
            Clear
          </button>
        </div>
        <div className="flex items-center justify-between text-[10px] text-gray-500">
          <span>{openaiKeyStored ? 'Key stored securely.' : 'No key stored yet.'}</span>
          {!secretsAvailable && <span>Secure storage unavailable.</span>}
        </div>
        <p className="text-[10px] text-gray-500">Used for chat, trading tools, and live voice/vision.</p>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Gemini API Key (optional)</label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type={showGemini ? 'text' : 'password'}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 pr-16 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono"
              placeholder={geminiKeyStored ? 'Stored in secure keychain' : 'AIza...'}
            />
            <button
              type="button"
              onClick={async () => {
                const text = await readClipboardText();
                if (text) setGeminiKey(text.trim());
              }}
              className="absolute right-9 top-2 text-gray-500 hover:text-gray-200"
              title="Paste from clipboard"
            >
              <Clipboard size={16} />
            </button>
            <button
              type="button"
              onClick={() => setShowGemini((v: boolean) => !v)}
              className="absolute right-2 top-2 text-gray-500 hover:text-gray-200"
              title={showGemini ? 'Hide' : 'Show'}
            >
              {showGemini ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (onRunActionCatalog) {
                await onRunActionCatalog({ actionId: 'settings.gemini.key.clear', payload: {} });
              } else {
                const secrets = (window as any)?.glass?.secrets;
                if (secrets?.clearGeminiKey) await secrets.clearGeminiKey();
              }
              setGeminiKey('');
              await refreshSecretsStatus();
            }}
            className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-white/10 hover:bg-white/20 text-gray-200"
          >
            Clear
          </button>
        </div>
        <div className="flex items-center justify-between text-[10px] text-gray-500">
          <span>{geminiKeyStored ? 'Key stored securely.' : 'No key stored yet.'}</span>
          {!secretsAvailable && <span>Secure storage unavailable.</span>}
        </div>
        <p className="text-[10px] text-gray-500">Only needed if you want Gemini TTS fallback.</p>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
          <Cpu size={12} className="text-blue-400" />
          Chat Model Override (optional)
        </label>
        <select
          value={textModelSelectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__custom__') setTextModel('');
            else setTextModel(v);
          }}
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 transition-colors font-mono"
        >
          {OPENAI_TEXT_MODEL_PRESETS.map((p: any) => (
            <option key={p.value || '__auto__'} value={p.value}>{p.label}</option>
          ))}
          <option value="__custom__">Custom…</option>
        </select>
        {!textModelIsPreset && (
          <input
            type="text"
            value={textModel}
            onChange={(e) => setTextModel(e.target.value)}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 transition-colors font-mono"
            placeholder="Enter a model id"
          />
        )}
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
          <Cpu size={12} className="text-blue-400" />
          Vision Model Override (optional)
        </label>
        <select
          value={visionModelSelectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__custom__') setVisionModel('');
            else setVisionModel(v);
          }}
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 transition-colors font-mono"
        >
          {OPENAI_VISION_MODEL_PRESETS.map((p: any) => (
            <option key={p.value || '__auto__'} value={p.value}>{p.label}</option>
          ))}
          <option value="__custom__">Custom…</option>
        </select>
        {!visionModelIsPreset && (
          <input
            type="text"
            value={visionModel}
            onChange={(e) => setVisionModel(e.target.value)}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 transition-colors font-mono"
            placeholder="Enter a vision-capable model id"
          />
        )}
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
          <Cpu size={12} className="text-blue-400" />
          Vision Detail
        </label>
        <select
          value={visionDetail}
          onChange={(e) => {
            const v = String(e.target.value || '').toLowerCase();
            setVisionDetail(v === 'low' || v === 'high' ? v : 'auto');
          }}
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 transition-colors font-mono"
        >
          {OPENAI_VISION_DETAIL_PRESETS.map((p: any) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
          <Cpu size={12} className="text-blue-400" />
          Live Model Override (optional)
        </label>
        <select
          value={liveModelSelectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__custom__') setLiveModel('');
            else setLiveModel(v);
          }}
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 transition-colors font-mono"
        >
          {OPENAI_LIVE_MODEL_PRESETS.map((p: any) => (
            <option key={p.value || '__default__'} value={p.value}>{p.label}</option>
          ))}
          <option value="__custom__">Custom…</option>
        </select>
        {!liveModelIsPreset && (
          <input
            type="text"
            value={liveModel}
            onChange={(e) => setLiveModel(e.target.value)}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 transition-colors font-mono"
            placeholder="Enter a realtime model id"
          />
        )}
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
          <Cpu size={12} className="text-blue-400" />
          Tech Agent Vector Store IDs
        </label>
        <input
          type="text"
          value={vectorStoreIds}
          onChange={(e) => setVectorStoreIds(e.target.value)}
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 transition-colors font-mono"
          placeholder="vs_... (comma or newline separated)"
        />
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
          <Cpu size={12} className="text-blue-400" />
          Tech Agent Reasoning Effort
        </label>
        <select
          value={techReasoningEffort}
          onChange={(e) => setTechReasoningEffort(String(e.target.value || ''))}
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 transition-colors font-mono"
        >
          {OPENAI_TECH_REASONING_PRESETS.map((p: any) => (
            <option key={p.value || '__auto__'} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="pt-2 border-t border-white/5 space-y-3">
        <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Live Vision Capture</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Active Tab (ms)</label>
            <input type="number" min={500} step={100} value={activeVisionIntervalMs} onChange={(e) => setActiveVisionIntervalMs(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 transition-colors font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Watched Tabs (ms)</label>
            <input type="number" min={1000} step={500} value={watchedVisionIntervalMs} onChange={(e) => setWatchedVisionIntervalMs(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 transition-colors font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Chart Watch (ms)</label>
            <input type="number" min={5000} step={1000} value={chartWatchIntervalMs} onChange={(e) => setChartWatchIntervalMs(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 transition-colors font-mono" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 text-[11px] text-gray-400">
          <label className="flex items-center gap-2 select-none">
            <input type="checkbox" checked={autoWatchTradingView} onChange={(e) => setAutoWatchTradingView(e.target.checked)} />
            Auto-watch TradingView tabs
          </label>
        </div>
      </div>

      <div className="pt-2 border-t border-white/5 space-y-3">
        <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
          <Lock size={12} className="text-blue-300" />
          Chat Tab Context (Vision)
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Mode</label>
            <select value={chatTabContextMode} onChange={(e) => setChatTabContextMode(String(e.target.value || '').trim().toLowerCase())} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 transition-colors font-mono">
              <option value="active">Active tab only</option>
              <option value="active_watched">Active + watched</option>
              <option value="tradingview_all">All TradingView tabs</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Max Tabs Included</label>
            <input type="number" min={1} max={12} step={1} value={chatTabContextMaxTabs} onChange={(e) => setChatTabContextMaxTabs(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 transition-colors font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">ROI Crop</label>
            <select value={chatTabContextRoi} onChange={(e) => setChatTabContextRoi(String(e.target.value || '').trim().toLowerCase())} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 transition-colors font-mono">
              <option value="full">Full</option>
              <option value="center">Center</option>
              <option value="chart_focus">Chart Focus</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Redaction</label>
            <select value={chatTabContextRedaction} onChange={(e) => setChatTabContextRedaction(String(e.target.value || '').trim().toLowerCase())} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 transition-colors font-mono">
              <option value="none">None</option>
              <option value="top_left">Top Left</option>
              <option value="top_right">Top Right</option>
              <option value="top_corners">Top Corners</option>
              <option value="top_bar">Top Bar</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 text-[11px] text-gray-400">
          <label className="flex items-center gap-2 select-none">
            <input type="checkbox" checked={chatTabContextChangeOnly} onChange={(e) => setChatTabContextChangeOnly(e.target.checked)} />
            Only attach tabs when they change
          </label>
        </div>
      </div>

      <div className="text-[10px] text-gray-600 leading-relaxed">
        Keys are stored locally on this device (Electron storage). You can clear them by deleting the values here.
      </div>
    </>
  );
};

export default React.memo(AiKeysSection);
