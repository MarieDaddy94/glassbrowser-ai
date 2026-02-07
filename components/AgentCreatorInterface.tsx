import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, FileText, Send, ShieldCheck, Sparkles, Upload, Wand2 } from 'lucide-react';
import {
  Agent,
  AgentCreatorMessage,
  AgentCreatorSession,
  AgentDraft,
  UploadedTextRef
} from '../types';
import {
  AGENT_CREATOR_DRAFTS_STORAGE_KEY,
  AGENT_CREATOR_SESSION_STORAGE_KEY,
  getUploadedTextContent,
  importTextFile,
  listUploadedTextRefs,
  removeUploadedTextRef,
  saveUploadedTextRefs
} from '../services/agentCreatorFileStore';
import {
  createDraftFromPrompt,
  publishDraftToAgent,
  refineDraft,
  validateDraft
} from '../services/agentCreatorService';

interface AgentCreatorInterfaceProps {
  agents?: Agent[];
  activeSymbol?: string | null;
  activeTimeframe?: string | null;
  onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
  signalScanEnabledByAgentId?: Record<string, boolean>;
  onSetSignalScanEnabled?: (agentId: string, enabled: boolean) => void;
  onOpenSignalPanel?: () => void;
}

const STATUS_CLASS: Record<string, string> = {
  draft: 'bg-amber-500/20 border-amber-500/30 text-amber-200',
  validated: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-200',
  published: 'bg-cyan-500/20 border-cyan-500/30 text-cyan-200'
};

const COLOR_POOL = [
  'bg-blue-600',
  'bg-purple-600',
  'bg-green-600',
  'bg-orange-600',
  'bg-pink-600',
  'bg-teal-600',
  'bg-cyan-600',
  'bg-rose-600',
  'bg-indigo-600'
];

const nowMs = () => Date.now();

const buildId = (prefix: string) =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const loadDrafts = (): AgentDraft[] => {
  const parsed = safeParse<AgentDraft[]>(localStorage.getItem(AGENT_CREATOR_DRAFTS_STORAGE_KEY), []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      ...entry,
      id: String(entry.id || buildId('draft')),
      name: String(entry.name || 'New Agent'),
      description: String(entry.description || ''),
      strategyText: String(entry.strategyText || ''),
      watchSymbols: Array.isArray(entry.watchSymbols) ? entry.watchSymbols.map(String) : [],
      watchTimeframes: Array.isArray(entry.watchTimeframes) ? entry.watchTimeframes.map(String) : [],
      sessionWindows: Array.isArray(entry.sessionWindows) ? entry.sessionWindows.map(String) : [],
      entryRules: Array.isArray(entry.entryRules) ? entry.entryRules.map(String) : [],
      exitRules: Array.isArray(entry.exitRules) ? entry.exitRules.map(String) : [],
      riskRules: Array.isArray(entry.riskRules) ? entry.riskRules.map(String) : [],
      confidencePolicy: {
        minProbability: Number(entry.confidencePolicy?.minProbability || 65),
        maxProbability: Number(entry.confidencePolicy?.maxProbability || 95),
        minRiskReward: Number(entry.confidencePolicy?.minRiskReward || 1.4)
      },
      capabilities: {
        trade: entry.capabilities?.trade !== false,
        tools: !!entry.capabilities?.tools,
        broker: !!entry.capabilities?.broker,
        autoExecute: !!entry.capabilities?.autoExecute
      },
      status: entry.status || 'draft',
      sourceFiles: Array.isArray(entry.sourceFiles) ? entry.sourceFiles : [],
      createdAtMs: Number(entry.createdAtMs || nowMs()),
      updatedAtMs: Number(entry.updatedAtMs || nowMs()),
      useInSignalScans: entry.useInSignalScans !== false
    }));
};

const loadSession = (): AgentCreatorSession => {
  const parsed = safeParse<AgentCreatorSession>(localStorage.getItem(AGENT_CREATOR_SESSION_STORAGE_KEY), {
    messages: [],
    activeDraftId: null,
    selectedFileIds: [],
    lastValidation: null
  });
  return {
    messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    activeDraftId: parsed.activeDraftId || null,
    selectedFileIds: Array.isArray(parsed.selectedFileIds) ? parsed.selectedFileIds : [],
    lastValidation: parsed.lastValidation || null
  };
};

const appendUnique = (list: string[], value: string) => {
  if (!value) return list;
  if (list.includes(value)) return list;
  return [...list, value];
};

const normalizeCsvList = (value: string) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const AgentCreatorInterface: React.FC<AgentCreatorInterfaceProps> = ({
  agents,
  activeSymbol,
  activeTimeframe,
  onRunActionCatalog,
  signalScanEnabledByAgentId,
  onSetSignalScanEnabled,
  onOpenSignalPanel
}) => {
  const [drafts, setDrafts] = useState<AgentDraft[]>(() => loadDrafts());
  const [files, setFiles] = useState<UploadedTextRef[]>(() => listUploadedTextRefs());
  const [session, setSession] = useState<AgentCreatorSession>(() => loadSession());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeDraft = useMemo(
    () => drafts.find((draft) => draft.id === session.activeDraftId) || drafts[0] || null,
    [drafts, session.activeDraftId]
  );

  const selectedFiles = useMemo(() => {
    const ids = new Set(session.selectedFileIds || []);
    return files.filter((file) => ids.has(file.id));
  }, [files, session.selectedFileIds]);

  useEffect(() => {
    localStorage.setItem(AGENT_CREATOR_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  }, [drafts]);

  useEffect(() => {
    localStorage.setItem(AGENT_CREATOR_SESSION_STORAGE_KEY, JSON.stringify(session));
  }, [session]);

  useEffect(() => {
    saveUploadedTextRefs(files);
  }, [files]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [session.messages]);

  const pushMessage = useCallback((message: AgentCreatorMessage) => {
    setSession((prev) => ({
      ...prev,
      messages: [...(prev.messages || []), message].slice(-120)
    }));
  }, []);

  const updateDraft = useCallback((next: AgentDraft) => {
    setDrafts((prev) => {
      const idx = prev.findIndex((item) => item.id === next.id);
      if (idx < 0) return [next, ...prev];
      const copy = [...prev];
      copy[idx] = next;
      return copy;
    });
  }, []);

  const chooseColor = useCallback(() => {
    const used = new Set((agents || []).map((agent) => String(agent.color || '').trim()));
    return COLOR_POOL.find((color) => !used.has(color)) || COLOR_POOL[0];
  }, [agents]);

  const onUploadFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    const res = await importTextFile(file);
    if (!res.ok || !res.ref) {
      setError(res.error || 'File upload failed.');
      return;
    }
    setFiles((prev) => [res.ref!, ...prev.filter((item) => item.id !== res.ref!.id)].slice(0, 10));
    setSession((prev) => ({
      ...prev,
      selectedFileIds: appendUnique(prev.selectedFileIds || [], res.ref!.id)
    }));
    pushMessage({
      id: buildId('creator_msg'),
      role: 'system',
      text: `Uploaded ${res.ref.name} (${Math.round(res.ref.sizeBytes / 1024)} KB).`,
      createdAtMs: nowMs(),
      files: [res.ref]
    });
  }, [pushMessage]);

  const buildSelectedFilePayload = useCallback(() => {
    return selectedFiles.map((ref) => ({
      ref,
      text: getUploadedTextContent(ref.storageKey)
    }));
  }, [selectedFiles]);

  const handleGenerateOrRefine = useCallback(async () => {
    const instruction = String(input || '').trim();
    if (!instruction || busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const userMessage: AgentCreatorMessage = {
      id: buildId('creator_msg'),
      role: 'user',
      text: instruction,
      createdAtMs: nowMs(),
      files: selectedFiles
    };
    pushMessage(userMessage);
    setInput('');

    try {
      const selected = buildSelectedFilePayload();
      const history = [...(session.messages || []), userMessage];
      const result = activeDraft
        ? await refineDraft({
            instruction,
            draft: activeDraft,
            selectedFiles: selected,
            activeSymbol: activeSymbol || null,
            activeTimeframe: activeTimeframe || null,
            messages: history
          })
        : await createDraftFromPrompt({
            instruction,
            selectedFiles: selected,
            activeSymbol: activeSymbol || null,
            activeTimeframe: activeTimeframe || null,
            messages: history
          });

      const draft = activeDraft
        ? { ...result.draft, id: activeDraft.id, createdAtMs: activeDraft.createdAtMs, updatedAtMs: nowMs() }
        : { ...result.draft, id: result.draft.id || buildId('draft') };
      updateDraft(draft);
      setSession((prev) => ({
        ...prev,
        activeDraftId: draft.id,
        lastValidation: {
          draftId: draft.id,
          ok: result.ok,
          warnings: result.warnings,
          errors: result.errors,
          atMs: nowMs()
        }
      }));
      const summary = result.ok
        ? `Draft ready: "${draft.name}".`
        : `Draft created with validation issues (${result.errors.length} errors).`;
      pushMessage({
        id: buildId('creator_msg'),
        role: 'assistant',
        text: `${summary}${result.warnings.length > 0 ? ` Warnings: ${result.warnings.join(' | ')}` : ''}`,
        createdAtMs: nowMs(),
        draftId: draft.id
      });
      if (!result.ok) {
        setError(result.errors.join(' ') || 'Draft validation failed.');
      } else {
        setInfo('Draft updated.');
      }
    } catch (err: any) {
      const message = err?.message ? String(err.message) : 'Agent creation failed.';
      setError(message);
      pushMessage({
        id: buildId('creator_msg'),
        role: 'assistant',
        text: message,
        createdAtMs: nowMs(),
        isError: true
      });
    } finally {
      setBusy(false);
    }
  }, [
    activeDraft,
    activeSymbol,
    activeTimeframe,
    buildSelectedFilePayload,
    busy,
    input,
    pushMessage,
    selectedFiles,
    session.messages,
    updateDraft
  ]);

  const handleSafetyReview = useCallback(() => {
    if (!activeDraft) return;
    const review = validateDraft(activeDraft);
    setSession((prev) => ({
      ...prev,
      lastValidation: {
        draftId: activeDraft.id,
        ok: review.ok,
        warnings: review.warnings,
        errors: review.errors,
        atMs: nowMs()
      }
    }));
    if (!review.ok) {
      setError(review.errors.join(' ') || 'Draft failed safety review.');
    } else {
      setInfo(review.warnings.length > 0 ? review.warnings.join(' | ') : 'Safety review passed.');
    }
  }, [activeDraft]);

  const handlePublish = useCallback(async () => {
    if (!activeDraft) return;
    if (!onRunActionCatalog) {
      setError('Action catalog is unavailable.');
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await publishDraftToAgent({
        draft: activeDraft,
        runActionCatalog: onRunActionCatalog,
        color: chooseColor(),
        activate: true
      });
      if (!res.ok || !res.agentId) {
        setError(res.error || 'Unable to publish agent.');
        return;
      }
      const nextDraft: AgentDraft = {
        ...activeDraft,
        status: 'published',
        publishedAgentId: res.agentId,
        updatedAtMs: nowMs()
      };
      updateDraft(nextDraft);
      if (onSetSignalScanEnabled) {
        onSetSignalScanEnabled(res.agentId, nextDraft.useInSignalScans !== false);
      }
      pushMessage({
        id: buildId('creator_msg'),
        role: 'assistant',
        text: `Published "${nextDraft.name}" to agents. It can now participate in Signal scans.`,
        createdAtMs: nowMs(),
        draftId: nextDraft.id
      });
      setInfo('Agent published.');
      if (onOpenSignalPanel) onOpenSignalPanel();
    } catch (err: any) {
      setError(err?.message ? String(err.message) : 'Failed to publish agent.');
    } finally {
      setBusy(false);
    }
  }, [activeDraft, chooseColor, onOpenSignalPanel, onRunActionCatalog, onSetSignalScanEnabled, pushMessage, updateDraft]);

  const handleDeleteDraft = useCallback((id: string) => {
    setDrafts((prev) => prev.filter((draft) => draft.id !== id));
    setSession((prev) => ({
      ...prev,
      activeDraftId: prev.activeDraftId === id ? null : prev.activeDraftId
    }));
  }, []);

  const handleDuplicateDraft = useCallback((draft: AgentDraft) => {
    const copy: AgentDraft = {
      ...draft,
      id: buildId('draft'),
      name: `${draft.name} Copy`,
      status: 'draft',
      publishedAgentId: null,
      createdAtMs: nowMs(),
      updatedAtMs: nowMs()
    };
    setDrafts((prev) => [copy, ...prev]);
    setSession((prev) => ({ ...prev, activeDraftId: copy.id }));
  }, []);

  return (
    <div className="flex h-full min-h-0 bg-[#060606] text-gray-200">
      <div className="w-[280px] border-r border-white/10 p-3 flex flex-col gap-3 overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white flex items-center gap-2">
              <Bot size={14} />
              Agent Creator
            </div>
            <div className="text-[11px] text-gray-400">Drafts and publish status</div>
          </div>
        </div>

        {drafts.length === 0 && (
          <div className="text-[11px] text-gray-500 border border-white/10 rounded-lg px-3 py-2">
            No drafts yet. Chat to generate your first agent.
          </div>
        )}

        {drafts.map((draft) => {
          const publishedId = String(draft.publishedAgentId || '').trim();
          const enabledInScan = publishedId
            ? signalScanEnabledByAgentId?.[publishedId] !== false
            : draft.useInSignalScans !== false;
          const statusLabel = draft.status === 'published' ? (enabledInScan ? 'active' : 'paused') : draft.status;
          return (
            <div
              key={draft.id}
              className={`rounded-lg border p-2 cursor-pointer transition-colors ${
                activeDraft?.id === draft.id ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/10 bg-white/[0.02]'
              }`}
              onClick={() => setSession((prev) => ({ ...prev, activeDraftId: draft.id }))}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-white truncate">{draft.name}</div>
                <div className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_CLASS[draft.status] || STATUS_CLASS.draft}`}>
                  {statusLabel}
                </div>
              </div>
              <div className="text-[10px] text-gray-400 mt-1 line-clamp-2">
                {draft.description || draft.strategyText || 'No description yet.'}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  className="text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDuplicateDraft(draft);
                  }}
                >
                  Duplicate
                </button>
                <button
                  className="text-[10px] px-2 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-200 hover:bg-red-500/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteDraft(draft.id);
                  }}
                >
                  Delete
                </button>
              </div>
              <label className="mt-2 flex items-center gap-2 text-[10px] text-gray-300">
                <input
                  type="checkbox"
                  checked={enabledInScan}
                  onChange={(e) => {
                    const enabled = !!e.target.checked;
                    const nextDraft = { ...draft, useInSignalScans: enabled, updatedAtMs: nowMs() };
                    updateDraft(nextDraft);
                    if (publishedId && onSetSignalScanEnabled) {
                      onSetSignalScanEnabled(publishedId, enabled);
                    }
                  }}
                />
                Use in Signal scans
              </label>
            </div>
          );
        })}
      </div>

      <div className="flex-1 min-w-0 flex flex-col border-r border-white/10">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Creator Chat</div>
            <div className="text-[11px] text-gray-400">GPT-5.2 builds structured agents from your instructions and TXT files.</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSafetyReview}
              disabled={!activeDraft}
              className="px-2.5 py-1.5 rounded text-[11px] border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-40 flex items-center gap-1"
            >
              <ShieldCheck size={12} />
              Safety Review
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={!activeDraft || busy}
              className="px-2.5 py-1.5 rounded text-[11px] border border-emerald-500/30 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50 flex items-center gap-1"
            >
              <Sparkles size={12} />
              Publish to Signals
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
          {session.messages.length === 0 && (
            <div className="text-xs text-gray-500 border border-white/10 rounded-lg px-3 py-2">
              Describe your strategy, upload TXT docs, and click Generate.
            </div>
          )}
          {session.messages.map((msg) => (
            <div key={msg.id} className={`max-w-[85%] rounded-lg border px-3 py-2 text-xs ${
              msg.role === 'user'
                ? 'ml-auto bg-blue-600/20 border-blue-500/30 text-blue-100'
                : msg.isError
                  ? 'bg-red-500/10 border-red-500/30 text-red-200'
                  : 'bg-white/[0.03] border-white/10 text-gray-200'
            }`}>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{msg.role}</div>
              <div className="whitespace-pre-wrap">{msg.text}</div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="px-4 py-3 border-t border-white/10 space-y-2">
          {error && <div className="text-[11px] text-red-300">{error}</div>}
          {info && <div className="text-[11px] text-emerald-300">{info}</div>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-2 py-1.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 text-[11px] flex items-center gap-1"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              <Upload size={12} />
              Upload TXT
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={onUploadFile}
            />
            <button
              type="button"
              className="px-2 py-1.5 rounded border border-emerald-500/30 bg-emerald-500/15 hover:bg-emerald-500/25 text-[11px] flex items-center gap-1 disabled:opacity-50"
              onClick={handleGenerateOrRefine}
              disabled={!input.trim() || busy}
            >
              <Wand2 size={12} />
              {activeDraft ? 'Refine Agent' : 'Generate Agent'}
            </button>
            <button
              type="button"
              className="px-2 py-1.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 text-[11px] flex items-center gap-1"
              onClick={() => onOpenSignalPanel?.()}
            >
              <Send size={12} />
              Open Signal
            </button>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe how you want the agent to trade, what setup to watch, and risk rules..."
            className="w-full h-20 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-emerald-500/40"
          />
        </div>
      </div>

      <div className="w-[340px] p-3 overflow-y-auto custom-scrollbar space-y-3">
        <div className="text-sm font-semibold text-white">Draft Inspector</div>
        {!activeDraft && (
          <div className="text-[11px] text-gray-500 border border-white/10 rounded-lg px-3 py-2">No draft selected.</div>
        )}
        {activeDraft && (
          <>
            <div className="space-y-2 text-xs">
              <label className="block text-[11px] text-gray-400">Name</label>
              <input
                value={activeDraft.name}
                onChange={(e) => updateDraft({ ...activeDraft, name: e.target.value, updatedAtMs: nowMs() })}
                className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs"
              />
              <label className="block text-[11px] text-gray-400">Description</label>
              <textarea
                value={activeDraft.description}
                onChange={(e) => updateDraft({ ...activeDraft, description: e.target.value, updatedAtMs: nowMs() })}
                className="w-full h-16 bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs"
              />
              <label className="block text-[11px] text-gray-400">Symbols (comma-separated)</label>
              <input
                value={activeDraft.watchSymbols.join(', ')}
                onChange={(e) => updateDraft({ ...activeDraft, watchSymbols: normalizeCsvList(e.target.value), updatedAtMs: nowMs() })}
                className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs"
              />
              <label className="block text-[11px] text-gray-400">Timeframes (comma-separated)</label>
              <input
                value={activeDraft.watchTimeframes.join(', ')}
                onChange={(e) => updateDraft({ ...activeDraft, watchTimeframes: normalizeCsvList(e.target.value), updatedAtMs: nowMs() })}
                className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs"
              />
            </div>

            <div className="rounded-lg border border-white/10 p-2 space-y-2 text-[11px]">
              <div className="font-semibold text-gray-200">Capabilities</div>
              {(['trade', 'tools', 'broker', 'autoExecute'] as const).map((key) => (
                <label key={key} className="flex items-center gap-2 text-gray-300">
                  <input
                    type="checkbox"
                    checked={!!activeDraft.capabilities?.[key]}
                    onChange={(e) =>
                      updateDraft({
                        ...activeDraft,
                        capabilities: { ...activeDraft.capabilities, [key]: !!e.target.checked },
                        updatedAtMs: nowMs()
                      })
                    }
                  />
                  {key}
                </label>
              ))}
              <div className="text-[10px] text-gray-500">
                Broker/tools/autoExecute should stay off unless you intentionally want elevated behavior.
              </div>
            </div>

            <div className="rounded-lg border border-white/10 p-2 space-y-2">
              <div className="font-semibold text-[11px] text-gray-200 flex items-center gap-1">
                <FileText size={12} />
                Uploaded TXT Context
              </div>
              {files.length === 0 && <div className="text-[10px] text-gray-500">No text files uploaded.</div>}
              {files.map((file) => {
                const selected = session.selectedFileIds.includes(file.id);
                return (
                  <div key={file.id} className="border border-white/10 rounded p-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] text-gray-200 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => {
                            const checked = !!e.target.checked;
                            setSession((prev) => ({
                              ...prev,
                              selectedFileIds: checked
                                ? appendUnique(prev.selectedFileIds || [], file.id)
                                : (prev.selectedFileIds || []).filter((id) => id !== file.id)
                            }));
                          }}
                        />
                        {file.name}
                      </label>
                      <button
                        className="text-[10px] text-red-300 hover:text-red-200"
                        onClick={() => {
                          removeUploadedTextRef(file);
                          setFiles((prev) => prev.filter((item) => item.id !== file.id));
                          setSession((prev) => ({
                            ...prev,
                            selectedFileIds: (prev.selectedFileIds || []).filter((id) => id !== file.id)
                          }));
                        }}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1 line-clamp-2">{file.textExcerpt}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AgentCreatorInterface;

