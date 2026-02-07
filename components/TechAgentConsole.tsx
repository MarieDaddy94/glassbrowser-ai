import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, Copy, Cpu, Download, FileText, ImagePlus, Loader2, Maximize2, Minimize2, RefreshCw, X } from 'lucide-react';
import { sendMessageToOpenAI } from '../services/openaiService';
import { CODEBASE_CONTEXT } from '../services/codebaseContext';
import {
  appendTechAgentLog,
  clearTechAgentLogs,
  formatTechAgentLogLines,
  getTechAgentLogs,
  subscribeTechAgentLogs,
  type TechAgentLogEntry
} from '../services/techAgentLog';
import type { Agent, AgentToolAction, AgentToolResult, Message } from '../types';

interface TechAgentConsoleProps {
  isOpen: boolean;
  onClose: () => void;
  onExecuteAgentTool?: (
    action: AgentToolAction,
    onProgress?: (update: Partial<AgentToolAction>) => void
  ) => Promise<AgentToolResult> | AgentToolResult;
}

const TECH_AGENT: Agent = {
  id: 'tech_agent_console',
  name: 'Tech Agent',
  color: 'text-purple-300',
  type: 'openai',
  profile: 'tech',
  systemInstruction:
    'Lead Engineer / SRE. Answer directly and concisely. Do not dump raw logs or code unless asked.'
};

const LOGS_PER_PROMPT = 40;
const AUTO_ANALYZE_PROMPT =
  'Analyze the logs for any critical errors. If everything is fine, just say "System nominal".';
const TECH_AGENT_CHAT_STORAGE_KEY = 'glass_tech_agent_chat_v1';
const MAX_CHAT_HISTORY = 200;
const MAX_CHAT_STORAGE_CHARS = 220_000;
const MEMORY_MESSAGE_LIMIT = 32;
const MEMORY_CHAR_LIMIT = 14_000;
const MAX_IMAGE_ATTACHMENTS = 4;
const MAX_TEXT_ATTACHMENTS = 4;
const MAX_ATTACHMENTS_TOTAL = 6;
const MAX_IMAGE_MB = 8;
const MAX_TEXT_KB = 256;
const MAX_TEXT_LINES = 320;
const MAX_TEXT_CHARS = 60_000;
const createCorrelationId = () =>
  `corr_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

type LogFilter = 'all' | 'error' | 'warn' | 'info';
type PendingTextAttachment = {
  name: string;
  content: string;
  preview: string;
  lineCount: number;
  truncated: boolean;
  sizeKb: number;
};

type MessageAttachment = {
  kind: 'image' | 'text';
  name: string;
  dataUrl?: string;
  preview?: string;
  lineCount?: number;
  truncated?: boolean;
};

type StoredMessage = {
  id: string;
  role: Message['role'];
  text: string;
  timestamp: number;
  agentId?: string | null;
  agentName?: string | null;
  agentColor?: string | null;
  isError?: boolean;
  attachments?: Array<Omit<MessageAttachment, 'dataUrl'>>;
};

const levelClass = (level: TechAgentLogEntry['level']) => {
  switch (level) {
    case 'warn':
      return 'text-amber-300 border-amber-500/40 bg-amber-500/10';
    case 'info':
      return 'text-sky-300 border-sky-500/40 bg-sky-500/10';
    default:
      return 'text-red-300 border-red-500/40 bg-red-500/10';
  }
};

const TechAgentConsole: React.FC<TechAgentConsoleProps> = ({ isOpen, onClose, onExecuteAgentTool }) => {
  const [logs, setLogs] = useState<TechAgentLogEntry[]>([]);
  const [filter, setFilter] = useState<LogFilter>('all');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [pendingImages, setPendingImages] = useState<Array<{ dataUrl: string; name: string }>>([]);
  const [pendingTextFiles, setPendingTextFiles] = useState<PendingTextAttachment[]>([]);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const pendingImagesRef = useRef<Array<{ dataUrl: string; name: string }>>([]);
  const pendingTextFilesRef = useRef<PendingTextAttachment[]>([]);
  const statusTimerRef = useRef<number | null>(null);
  const logScrollRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatHydratedRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    pendingImagesRef.current = pendingImages;
  }, [pendingImages]);

  useEffect(() => {
    pendingTextFilesRef.current = pendingTextFiles;
  }, [pendingTextFiles]);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) {
        window.clearTimeout(statusTimerRef.current);
        statusTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = subscribeTechAgentLogs(setLogs);
    setLogs(getTechAgentLogs());
    return () => unsubscribe();
  }, [isOpen]);

  const readStoredMessages = useCallback((): StoredMessage[] => {
    try {
      const raw = localStorage.getItem(TECH_AGENT_CHAT_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((entry) => entry && typeof entry === 'object');
    } catch {
      return [];
    }
  }, []);

  const writeStoredMessages = useCallback((entries: StoredMessage[]) => {
    try {
      localStorage.setItem(TECH_AGENT_CHAT_STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // ignore storage failures
    }
  }, []);

  const normalizeAttachmentsForStorage = useCallback((attachments: MessageAttachment[] | undefined) => {
    if (!Array.isArray(attachments) || attachments.length === 0) return undefined;
    return attachments.map((att) => {
      if (att.kind === 'image') {
        return { kind: 'image' as const, name: att.name };
      }
      return {
        kind: 'text' as const,
        name: att.name,
        preview: att.preview,
        lineCount: att.lineCount,
        truncated: att.truncated
      };
    });
  }, []);

  const restoreStoredMessages = useCallback(() => {
    const stored = readStoredMessages();
    if (stored.length === 0) return;
    const restored: Message[] = stored.map((entry) => ({
      id: String(entry.id),
      role: entry.role,
      text: String(entry.text || ''),
      timestamp: new Date(Number(entry.timestamp) || Date.now()),
      agentId: entry.agentId ?? undefined,
      agentName: entry.agentName ?? undefined,
      agentColor: entry.agentColor ?? undefined,
      isError: entry.isError ?? false,
      attachments: entry.attachments as any
    }));
    setMessages(restored);
  }, [readStoredMessages]);

  const persistMessages = useCallback((entries: Message[]) => {
    const trimmed = Array.isArray(entries) ? entries.slice(-MAX_CHAT_HISTORY) : [];
    const stored: StoredMessage[] = [];
    let totalChars = 0;
    for (let i = trimmed.length - 1; i >= 0; i -= 1) {
      const msg = trimmed[i];
      if (!msg) continue;
      const text = String(msg.text || '');
      totalChars += text.length;
      if (totalChars > MAX_CHAT_STORAGE_CHARS) break;
      stored.push({
        id: String(msg.id || ''),
        role: msg.role,
        text,
        timestamp: msg.timestamp instanceof Date ? msg.timestamp.getTime() : Date.now(),
        agentId: (msg as any).agentId ?? null,
        agentName: (msg as any).agentName ?? null,
        agentColor: (msg as any).agentColor ?? null,
        isError: msg.isError ?? false,
        attachments: normalizeAttachmentsForStorage((msg as any).attachments)
      });
    }
    stored.reverse();
    writeStoredMessages(stored);
  }, [normalizeAttachmentsForStorage, writeStoredMessages]);

  useEffect(() => {
    if (!isOpen) return;
    if (chatHydratedRef.current) return;
    chatHydratedRef.current = true;
    restoreStoredMessages();
  }, [isOpen, restoreStoredMessages]);

  useEffect(() => {
    if (!isOpen) return;
    persistMessages(messagesRef.current);
  }, [isOpen, messages, persistMessages]);

  useEffect(() => {
    if (!logScrollRef.current) return;
    logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [messages, isThinking]);

  const filteredLogs = useMemo(() => {
    const list = Array.isArray(logs) ? logs : [];
    if (filter === 'all') return list;
    return list.filter((entry) => entry.level === filter);
  }, [filter, logs]);

  const showActionStatus = useCallback((text: string) => {
    setActionStatus(text);
    if (statusTimerRef.current) {
      window.clearTimeout(statusTimerRef.current);
    }
    statusTimerRef.current = window.setTimeout(() => {
      setActionStatus(null);
      statusTimerRef.current = null;
    }, 2400);
  }, []);

  const copyText = useCallback(async (text: string, label?: string) => {
    const payload = String(text || '');
    if (!payload.trim()) {
      showActionStatus('Nothing to copy.');
      return;
    }
    try {
      const fn = window.glass?.clipboard?.writeText;
      if (fn) {
        const res = fn(payload);
        if (res && typeof (res as any).then === 'function') await res;
        showActionStatus(`${label || 'Response'} copied.`);
        return;
      }
    } catch {
      // ignore clipboard errors
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        showActionStatus(`${label || 'Response'} copied.`);
        return;
      }
    } catch {
      // ignore
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = payload;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      if (ok) {
        showActionStatus(`${label || 'Response'} copied.`);
        return;
      }
    } catch {
      // ignore
    }
    showActionStatus('Copy failed.');
  }, [showActionStatus]);

  const downloadFile = useCallback((filename: string, content: string, mimeType: string) => {
    const safeName = String(filename || 'tech_agent_response.txt').replace(/[^\w.\-]+/g, '_');
    const payload = String(content || '');
    if (!payload.trim()) {
      showActionStatus('Nothing to download.');
      return;
    }
    const blob = new Blob([payload], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safeName || 'tech_agent_response.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showActionStatus('Download started.');
  }, [showActionStatus]);

  const downloadText = useCallback((filename: string, content: string) => {
    downloadFile(filename, content, 'text/plain');
  }, [downloadFile]);

  const buildWordDocument = useCallback((content: string) => {
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const body = escapeHtml(content).replace(/\r?\n/g, '<br/>');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><pre style="font-family: Consolas, monospace; white-space: pre-wrap;">${body}</pre></body></html>`;
  }, []);

  const formatTranscript = useCallback((entries: Message[]) => {
    return entries
      .map((msg) => {
        const role = msg.role === 'model' ? (msg.agentName || 'assistant') : msg.role;
        const ts = msg.timestamp ? msg.timestamp.toLocaleString() : '';
        const header = `[${ts}] ${role.toUpperCase()}`;
        const text = String(msg.text || '').trim();
        const attachments = Array.isArray((msg as any).attachments) ? (msg as any).attachments as MessageAttachment[] : [];
        const attachmentLines = attachments.map((att) => {
          if (att.kind === 'image') return `- image: ${att.name}`;
          const suffix = att.truncated ? ' (truncated)' : '';
          return `- file: ${att.name}${suffix}${att.lineCount ? ` (${att.lineCount} lines)` : ''}`;
        });
        return [header, text || '(no text)', ...(attachmentLines.length > 0 ? ['Attachments:', ...attachmentLines] : [])].join('\n');
      })
      .join('\n\n');
  }, []);

  const formatMemoryTranscript = useCallback((entries: Message[]) => {
    const list = Array.isArray(entries) ? entries.slice(-MEMORY_MESSAGE_LIMIT) : [];
    let text = list
      .map((msg) => {
        const role = msg.role === 'model' ? (msg.agentName || 'assistant') : msg.role;
        const ts = msg.timestamp ? msg.timestamp.toLocaleString() : '';
        const header = `[${ts}] ${role.toUpperCase()}`;
        const body = String(msg.text || '').trim() || '(no text)';
        return `${header}\n${body}`;
      })
      .join('\n\n');
    if (text.length > MEMORY_CHAR_LIMIT) {
      text = text.slice(text.length - MEMORY_CHAR_LIMIT);
    }
    return text.trim();
  }, []);

  const getLastAssistantMessage = useCallback(() => {
    const list = messagesRef.current || [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const msg = list[i];
      if (msg.role === 'model' && !msg.isError) return msg;
    }
    return null;
  }, []);

  const handleCopyLatest = useCallback(() => {
    const last = getLastAssistantMessage();
    if (!last || !last.text) {
      showActionStatus('No agent response yet.');
      return;
    }
    void copyText(last.text, 'Last response');
  }, [copyText, getLastAssistantMessage, showActionStatus]);

  const handleDownloadChat = useCallback((format: 'txt' | 'doc') => {
    const transcript = formatTranscript(messagesRef.current || []);
    if (format === 'doc') {
      const doc = buildWordDocument(transcript);
      downloadFile('tech_agent_chat.doc', doc, 'application/msword');
      return;
    }
    downloadText('tech_agent_chat.txt', transcript);
  }, [buildWordDocument, downloadFile, downloadText, formatTranscript]);

  const pasteFromClipboard = useCallback(async (target?: HTMLTextAreaElement | null) => {
    let text = '';
    try {
      const read = window.glass?.clipboard?.readText;
      if (read) {
        const res = read();
        text = typeof (res as any)?.then === 'function' ? await res : String(res || '');
      } else if (navigator?.clipboard?.readText) {
        text = await navigator.clipboard.readText();
      }
    } catch {
      text = '';
    }
    if (!text) {
      showActionStatus('Clipboard empty.');
      return;
    }
    const el = target || inputRef.current;
    const start = el && typeof el.selectionStart === 'number' ? el.selectionStart : null;
    const end = el && typeof el.selectionEnd === 'number' ? el.selectionEnd : null;
    if (start != null && end != null) {
      setInput((prev) => prev.slice(0, start) + text + prev.slice(end));
      if (el) {
        requestAnimationFrame(() => {
          try {
            el.selectionStart = start + text.length;
            el.selectionEnd = start + text.length;
          } catch {
            // ignore
          }
        });
      }
    } else {
      setInput((prev) => prev + text);
    }
    showActionStatus('Pasted.');
  }, [showActionStatus]);

  const buildSystemContext = useCallback(() => {
    const logLines = formatTechAgentLogLines(logs, LOGS_PER_PROMPT);
    const memoryTranscript = formatMemoryTranscript(messagesRef.current || []);
    return [
      'ROLE: Lead Engineer / SRE.',
      'DIRECTIVE: Answer directly and concisely. Do not dump raw logs or code unless asked.',
      'CONSTRAINT: Use provided logs and codebase as reference; do not invent.',
      'TOOLS: You may use codebase tools to list/search/read/trace any file in the repo. Root defaults to "." and includeAll defaults to true; full-file reads are allowed (paginate if needed).',
      memoryTranscript ? 'PRIOR TECH AGENT CHAT:' : '',
      memoryTranscript || '',
      '',
      'CODE_CONTEXT:',
      CODEBASE_CONTEXT,
      '',
      `RUNTIME_LOGS (last ${LOGS_PER_PROMPT}):`,
      logLines || 'No logs captured yet.'
    ].join('\n');
  }, [formatMemoryTranscript, logs]);

  const appendMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      messagesRef.current = next;
      return next;
    });
  }, []);

  const updateMessage = useCallback((id: string, patch: Partial<Message>) => {
    setMessages((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, ...patch } : m));
      messagesRef.current = next;
      return next;
    });
  }, []);

  const sendPrompt = useCallback(
    async (text: string) => {
      const trimmed = String(text || '').trim();
      const imageAttachments = pendingImagesRef.current || [];
      const textAttachments = pendingTextFilesRef.current || [];
      const hasImages = imageAttachments.length > 0;
      const hasTextFiles = textAttachments.length > 0;
      const hasAttachments = hasImages || hasTextFiles;
      if ((!trimmed && !hasAttachments) || isThinking) return;
      setIsThinking(true);
      const correlationId = createCorrelationId();

      const promptBase = trimmed || (hasAttachments ? 'Analyze the attached file(s).' : '');
      const textAttachmentBlock = hasTextFiles
        ? textAttachments.map((file) => {
            const suffix = file.truncated ? ' (truncated)' : '';
            return `FILE: ${file.name}${suffix}\n${file.content}`;
          }).join('\n\n')
        : '';
      const promptText = textAttachmentBlock
        ? `${promptBase}\n\nATTACHED FILES:\n${textAttachmentBlock}`
        : promptBase;
      const displayText = promptBase;
      const attachmentSummary: MessageAttachment[] = [
        ...imageAttachments.map((img) => ({ kind: 'image' as const, name: img.name, dataUrl: img.dataUrl })),
        ...textAttachments.map((file) => ({
          kind: 'text' as const,
          name: file.name,
          preview: file.preview,
          lineCount: file.lineCount,
          truncated: file.truncated
        }))
      ];

      const userMessage: Message = {
        id: `tech_user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        role: 'user',
        text: displayText,
        timestamp: new Date(),
        correlationId,
        attachments: attachmentSummary.length > 0 ? attachmentSummary : undefined
      };

      const assistantId = `tech_agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const assistantMessage: Message = {
        id: assistantId,
        role: 'model',
        text: '',
        timestamp: new Date(),
        correlationId,
        isStreaming: true,
        agentId: TECH_AGENT.id,
        agentName: TECH_AGENT.name,
        agentColor: TECH_AGENT.color
      };

      setMessages((prev) => {
        const next = [...prev, userMessage, assistantMessage];
        messagesRef.current = next;
        return next;
      });
      setInput('');

      let streamed = '';
      try {
        const history = messagesRef.current.filter((m) => m.id !== assistantId);
        const systemContext = buildSystemContext();
        const imageAttachmentArg = hasImages
          ? imageAttachments.map((img) => ({ dataUrl: img.dataUrl, label: img.name }))
          : null;
        const result = await sendMessageToOpenAI(
          history,
          promptText,
          systemContext,
          imageAttachmentArg as any,
          [TECH_AGENT],
          [],
          [],
          {
            agent: TECH_AGENT,
            onDelta: (delta) => {
              streamed += delta;
              updateMessage(assistantId, { text: streamed, isStreaming: true });
            }
          }
        );

        const finalText = String(result?.text || streamed || '').trim();
        updateMessage(assistantId, { text: finalText || '(No response)', isStreaming: false });

        const toolAction = result?.agentToolAction;
        if (toolAction && onExecuteAgentTool) {
          const toolMessageId = `tech_tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const progressLabel = toolAction.type === 'CODEBASE_LIST_FILES'
            ? 'Listing codebase files...'
            : toolAction.type === 'CODEBASE_SEARCH'
              ? 'Searching codebase...'
              : toolAction.type === 'CODEBASE_READ_FILE'
                ? 'Reading code file...'
                : toolAction.type === 'CODEBASE_TRACE_DATAFLOW'
                  ? 'Tracing dataflow...'
                  : toolAction.type === 'GET_SYSTEM_STATE'
                    ? 'Fetching system state snapshot...'
                    : 'Running tool...';
          appendMessage({
            id: toolMessageId,
            role: 'system',
            text: progressLabel,
            timestamp: new Date(),
            correlationId
          });

          let toolResult: AgentToolResult | null = null;
          try {
            const enriched: AgentToolAction = {
              ...toolAction,
              agentId: TECH_AGENT.id,
              agentName: TECH_AGENT.name,
              messageId: assistantId,
              correlationId
            };
            toolResult = await Promise.resolve(onExecuteAgentTool(enriched));
          } catch (toolErr: any) {
            toolResult = {
              ok: false,
              text: toolErr?.message ? String(toolErr.message) : 'Tool execution failed.'
            };
          }

          if (toolResult) {
            const toolText = String(toolResult.text || '').trim();
            updateMessage(toolMessageId, {
              text: toolText || (toolResult.ok ? 'Tool result ready.' : 'Tool failed.'),
              isError: !toolResult.ok
            });
            appendTechAgentLog({
              level: toolResult.ok ? 'info' : 'error',
              source: 'tech_agent_tool',
              message: toolResult.ok ? 'Tool executed.' : 'Tool failed.',
              detail: toolText || null
            });

            const followUpId = `tech_agent_follow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            appendMessage({
              id: followUpId,
              role: 'model',
              text: '',
              timestamp: new Date(),
              correlationId,
              isStreaming: true,
              agentId: TECH_AGENT.id,
              agentName: TECH_AGENT.name,
              agentColor: TECH_AGENT.color
            });

            const followUpPrompt = `Using the tool output above, answer the original request: "${promptText}". Do not call additional tools unless absolutely required.`;
            streamed = '';
            const followUpHistory = messagesRef.current.filter((m) => m.id !== followUpId);
            const followUpResult = await sendMessageToOpenAI(
              followUpHistory,
              followUpPrompt,
              buildSystemContext(),
              imageAttachmentArg as any,
              [TECH_AGENT],
              [],
              [],
              {
                agent: TECH_AGENT,
                onDelta: (delta) => {
                  streamed += delta;
                  updateMessage(followUpId, { text: streamed, isStreaming: true });
                }
              }
            );
            const followText = String(followUpResult?.text || streamed || '').trim();
            updateMessage(followUpId, { text: followText || '(No response)', isStreaming: false });
          }
        } else if (toolAction && !onExecuteAgentTool) {
          appendMessage({
            id: `tech_tool_missing_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            role: 'system',
            text: 'Tool request received, but no executor is available in this build.',
            timestamp: new Date(),
            correlationId,
            isError: true
          });
        }

        if (hasAttachments) {
          clearPendingAttachments();
        }
      } catch (error: any) {
        const message = error?.message ? String(error.message) : 'Tech Agent error.';
        updateMessage(assistantId, { text: message, isError: true, isStreaming: false });
        appendTechAgentLog({
          level: 'error',
          source: 'tech_agent',
          message: 'Tech Agent request failed.',
          detail: { error: message }
        });
      } finally {
        setIsThinking(false);
      }
    },
    [appendMessage, buildSystemContext, isThinking, onExecuteAgentTool, updateMessage]
  );

  const handleSubmit = useCallback(() => {
    void sendPrompt(input);
  }, [input, sendPrompt]);

  const handleAutoAnalyze = useCallback(() => {
    void sendPrompt(AUTO_ANALYZE_PROMPT);
  }, [sendPrompt]);

  const addPendingImage = useCallback((dataUrl: string, name: string) => {
    if (!dataUrl) return;
    setPendingImages((prev) => {
      if (prev.length >= MAX_IMAGE_ATTACHMENTS) return prev;
      const next = [...prev, { dataUrl, name }];
      pendingImagesRef.current = next;
      return next;
    });
  }, []);

  const addPendingTextFile = useCallback((file: PendingTextAttachment) => {
    if (!file || !file.content) return;
    setPendingTextFiles((prev) => {
      if (prev.length >= MAX_TEXT_ATTACHMENTS) return prev;
      const next = [...prev, file];
      pendingTextFilesRef.current = next;
      return next;
    });
  }, []);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const currentCount = pendingImagesRef.current.length + pendingTextFilesRef.current.length;
      const remaining = Math.max(0, MAX_ATTACHMENTS_TOTAL - currentCount);
      if (remaining <= 0) {
        appendTechAgentLog({
          level: 'warn',
          source: 'tech_agent',
          message: `Attachment limit reached (${MAX_ATTACHMENTS_TOTAL}).`
        });
        showActionStatus('Attachment limit reached.');
        return;
      }
      const nextFiles = Array.from(files).slice(0, remaining);
      const textExtensions = new Set([
        '.txt',
        '.log',
        '.md',
        '.csv',
        '.json',
        '.yml',
        '.yaml',
        '.ts',
        '.tsx',
        '.js',
        '.jsx',
        '.cjs',
        '.mjs',
        '.py',
        '.sql',
        '.toml',
        '.ini',
        '.cfg'
      ]);

      const isTextFile = (file: File) => {
        const type = String(file.type || '').toLowerCase();
        if (type.startsWith('text/')) return true;
        if (type === 'application/json' || type === 'application/javascript' || type === 'application/xml') return true;
        const name = String(file.name || '').toLowerCase();
        const dotIdx = name.lastIndexOf('.');
        const ext = dotIdx >= 0 ? name.slice(dotIdx) : '';
        return textExtensions.has(ext);
      };

      nextFiles.forEach((file) => {
        const name = file.name || 'attachment';
        if (file.type.startsWith('image/')) {
          const sizeMb = file.size / (1024 * 1024);
          if (sizeMb > MAX_IMAGE_MB) {
            appendTechAgentLog({
              level: 'warn',
              source: 'tech_agent',
              message: `Skipped ${name} (${sizeMb.toFixed(1)}MB). Max ${MAX_IMAGE_MB}MB.`
            });
            showActionStatus(`Skipped ${name} (too large).`);
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            addPendingImage(result, name || 'image');
            showActionStatus(`Attached ${name}.`);
          };
          reader.readAsDataURL(file);
          return;
        }

        if (!isTextFile(file)) {
          appendTechAgentLog({
            level: 'warn',
            source: 'tech_agent',
            message: `Skipped ${name}. Unsupported file type.`
          });
          showActionStatus(`Skipped ${name} (unsupported type).`);
          return;
        }

        const sizeKb = file.size / 1024;
        if (sizeKb > MAX_TEXT_KB) {
          appendTechAgentLog({
            level: 'warn',
            source: 'tech_agent',
            message: `Skipped ${name} (${sizeKb.toFixed(0)}KB). Max ${MAX_TEXT_KB}KB.`
          });
          showActionStatus(`Skipped ${name} (too large).`);
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          const raw = typeof reader.result === 'string' ? reader.result : '';
          if (!raw) return;
          const lines = raw.split(/\r?\n/);
          let truncated = false;
          let content = raw;
          if (lines.length > MAX_TEXT_LINES) {
            content = lines.slice(0, MAX_TEXT_LINES).join('\n');
            truncated = true;
          }
          if (content.length > MAX_TEXT_CHARS) {
            content = content.slice(0, MAX_TEXT_CHARS);
            truncated = true;
          }
          const preview = content.split(/\r?\n/).slice(0, 6).join('\n');
          addPendingTextFile({
            name,
            content,
            preview,
            lineCount: lines.length,
            truncated,
            sizeKb
          });
          showActionStatus(`Attached ${name}.`);
        };
        reader.readAsText(file);
      });
    },
    [addPendingImage, addPendingTextFile, showActionStatus]
  );

  const removePendingImage = useCallback((index: number) => {
    setPendingImages((prev) => {
      const next = prev.filter((_, i) => i !== index);
      pendingImagesRef.current = next;
      return next;
    });
  }, []);

  const removePendingTextFile = useCallback((index: number) => {
    setPendingTextFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      pendingTextFilesRef.current = next;
      return next;
    });
  }, []);

  const clearPendingAttachments = useCallback(() => {
    setPendingImages([]);
    setPendingTextFiles([]);
    pendingImagesRef.current = [];
    pendingTextFilesRef.current = [];
  }, []);

  const canSend = input.trim().length > 0 || pendingImages.length > 0 || pendingTextFiles.length > 0;

  if (!isOpen) return null;

  const containerClass = isExpanded
    ? 'w-[96vw] h-[94vh] max-w-[96vw]'
    : 'w-[1120px] max-w-full h-[82vh]';

  return (
    <div className={`fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center ${isExpanded ? 'px-2 py-2' : 'px-4 py-6'}`}>
      <div className={`${containerClass} bg-[#0b0b0b] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/5">
          <div
            className={`flex items-center gap-3 text-sm font-semibold text-gray-100 ${isExpanded ? '' : 'cursor-pointer'}`}
            onClick={() => {
              if (!isExpanded) setIsExpanded(true);
            }}
            onDoubleClick={() => setIsExpanded((prev) => !prev)}
            title={isExpanded ? 'Double click to restore' : 'Click to expand'}
          >
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
              <Cpu size={16} className="text-purple-300" />
            </div>
            <div>
              <div className="text-sm">System Console</div>
              <div className="text-[10px] text-gray-500">Live Tech Agent (GPT-5.2)</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAutoAnalyze}
              disabled={isThinking}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-purple-600/80 hover:bg-purple-600 text-white transition-colors disabled:opacity-60"
            >
              Auto-Analyze
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((prev) => !prev);
              }}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title={isExpanded ? 'Restore' : 'Expand'}
            >
              {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-[45%] min-w-[300px] border-r border-white/5 flex flex-col">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Event Stream</div>
              <div className="flex items-center gap-1 text-[10px] text-gray-500">
                <span>{filteredLogs.length} entries</span>
                <span className="text-gray-600">|</span>
                <span>{logs.length} total</span>
              </div>
            </div>
            <div className="px-4 py-2 flex flex-wrap gap-2 border-b border-white/5">
              {(['all', 'error', 'warn', 'info'] as LogFilter[]).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setFilter(level)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border transition-colors ${
                    filter === level
                      ? 'bg-white/15 text-white border-white/30'
                      : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {level === 'all' ? 'All' : level}
                </button>
              ))}
              <button
                type="button"
                onClick={() => clearTechAgentLogs()}
                className="ml-auto px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border border-white/10 text-gray-400 hover:bg-white/10"
              >
                Clear
              </button>
            </div>
            <div ref={logScrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-2">
              {filteredLogs.length === 0 ? (
                <div className="text-[11px] text-gray-500">No log entries yet.</div>
              ) : (
                filteredLogs.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400">
                      <div className={`px-2 py-0.5 rounded-full border text-[10px] ${levelClass(entry.level)}`}>
                        {entry.level}
                      </div>
                      <div className="font-mono text-[10px]">{new Date(entry.ts).toLocaleTimeString()}</div>
                    </div>
                    <div className="mt-2 text-xs text-gray-200 font-mono break-words">
                      {entry.message}
                    </div>
                    <div className="mt-1 text-[10px] text-gray-500 font-mono">
                      {entry.source}
                      {entry.count && entry.count > 1 ? ` x${entry.count}` : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col">
            <div className="px-4 py-3 border-b border-white/5 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-100">
                <Activity size={14} className="text-emerald-400" />
                <span>Tech Agent</span>
                <span className="text-[10px] text-emerald-300 font-mono">ONLINE</span>
              </div>
            </div>

            <div
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer?.files?.length) {
                  handleFiles(e.dataTransfer.files);
                }
              }}
            >
              {messages.length === 0 ? (
                <div className="text-[12px] text-gray-500">
                  Ask about errors, data flows, or architecture. Use Auto-Analyze for a quick health check.
                </div>
              ) : (
                messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  const attachments = Array.isArray((msg as any).attachments)
                    ? ((msg as any).attachments as MessageAttachment[])
                    : [];
                  return (
                    <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[78%] rounded-2xl px-4 py-2 text-sm leading-relaxed overflow-hidden ${
                          isUser
                            ? 'bg-purple-600/30 text-purple-50 border border-purple-500/40'
                            : msg.isError
                              ? 'bg-red-500/10 text-red-200 border border-red-500/30'
                              : 'bg-white/5 text-gray-100 border border-white/10'
                        }`}
                      >
                        {msg.role === 'model' && msg.text ? (
                          <div className="mb-2 flex items-center justify-end gap-2 text-[10px] text-gray-400">
                            <button
                              type="button"
                              onClick={() => copyText(msg.text || '', 'Response')}
                              className="flex items-center gap-1 hover:text-white"
                            >
                              <Copy size={12} />
                              Copy
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadText(`tech_agent_${msg.id}.txt`, msg.text || '')}
                              className="flex items-center gap-1 hover:text-white"
                            >
                              <Download size={12} />
                              Download
                            </button>
                          </div>
                        ) : null}
                        <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                        {attachments.length > 0 ? (
                          <div className="mt-2 space-y-2">
                            {attachments.map((att, idx) => {
                              if (att.kind === 'image' && att.dataUrl) {
                                return (
                                  <div key={`${att.name}-${idx}`} className="rounded-lg border border-white/10 bg-black/30 p-2">
                                    <div className="text-[10px] text-gray-400 mb-1">{att.name}</div>
                                    <img src={att.dataUrl} alt={att.name} className="max-h-48 rounded-md" />
                                  </div>
                                );
                              }
                              if (att.kind === 'image') {
                                return (
                                  <div key={`${att.name}-${idx}`} className="rounded-lg border border-white/10 bg-black/30 p-2">
                                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                      <ImagePlus size={12} />
                                      <span>{att.name}</span>
                                      <span className="text-gray-500">(image not stored)</span>
                                    </div>
                                  </div>
                                );
                              }
                              const preview = att.preview ? String(att.preview) : '';
                              const suffix = att.truncated ? ' (truncated)' : '';
                              return (
                                <div key={`${att.name}-${idx}`} className="rounded-lg border border-white/10 bg-black/30 p-2">
                                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                    <FileText size={12} />
                                    <span>{att.name}{suffix}</span>
                                    {att.lineCount ? <span className="text-gray-500">{att.lineCount} lines</span> : null}
                                  </div>
                                  {preview ? (
                                    <div className="mt-1 text-[11px] text-gray-200 font-mono whitespace-pre-wrap">
                                      {preview}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-white/5 bg-white/5 px-4 py-3">
              {pendingImages.length > 0 || pendingTextFiles.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-2">
                  {pendingImages.map((img, idx) => (
                    <div
                      key={`${img.name}-${idx}`}
                      className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] text-gray-300"
                    >
                      <ImagePlus size={12} className="text-purple-200" />
                      <span className="truncate max-w-[140px]">{img.name}</span>
                      <button
                        type="button"
                        onClick={() => removePendingImage(idx)}
                        className="text-gray-400 hover:text-white"
                        title="Remove"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {pendingTextFiles.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] text-gray-300"
                    >
                      <FileText size={12} className="text-sky-200" />
                      <span className="truncate max-w-[160px]">{file.name}</span>
                      <span className="text-gray-500">{file.lineCount} lines</span>
                      <button
                        type="button"
                        onClick={() => removePendingTextFile(idx)}
                        className="text-gray-400 hover:text-white"
                        title="Remove"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={clearPendingAttachments}
                    className="text-[10px] text-gray-400 hover:text-white"
                  >
                    Clear all
                  </button>
                </div>
              ) : null}
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-500">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyLatest}
                    className="px-2 py-1 rounded-md border border-white/10 hover:bg-white/10 text-gray-300 flex items-center gap-1"
                  >
                    <Copy size={12} />
                    Copy last
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadChat('txt')}
                    className="px-2 py-1 rounded-md border border-white/10 hover:bg-white/10 text-gray-300 flex items-center gap-1"
                  >
                    <Download size={12} />
                    Download TXT
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadChat('doc')}
                    className="px-2 py-1 rounded-md border border-white/10 hover:bg-white/10 text-gray-300 flex items-center gap-1"
                  >
                    <FileText size={12} />
                    Download DOC
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {actionStatus ? <span className="text-emerald-300 max-w-[220px] truncate">{actionStatus}</span> : null}
                  {isThinking ? (
                    <span className="flex items-center gap-1">
                      <Loader2 size={12} className="animate-spin" />
                      Thinking
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <RefreshCw size={12} />
                      Ready
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (canSend) handleSubmit();
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    void pasteFromClipboard(e.currentTarget);
                  }}
                  onPaste={(e) => {
                    const files = e.clipboardData?.files;
                    if (files && files.length > 0) {
                      e.preventDefault();
                      handleFiles(files);
                    }
                  }}
                  rows={2}
                  className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors resize-none"
                  placeholder="Ask about the logs, data flow, or architecture... (drop files to attach)"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,text/*,.log,.md,.json,.csv,.yml,.yaml,.ts,.tsx,.js,.jsx,.cjs,.mjs,.py,.sql,.toml,.ini,.cfg"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleFiles(e.target.files);
                    if (e.target) e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/10 hover:bg-white/20 text-gray-100 transition-colors"
                  title="Upload file"
                >
                  <ImagePlus size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSend || isThinking}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-60"
                >
                  Send
                </button>
              </div>
              <div className="mt-2 text-[10px] text-gray-500 flex items-center gap-2">
                <AlertTriangle size={12} className="text-amber-400" />
                Log snapshots are appended to each request; ask before dumping raw logs or code.
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 bg-black/40 px-4 py-2 text-[10px] text-gray-600 flex items-center gap-2">
          <span>Runtime logs are persisted locally for post-crash analysis.</span>
        </div>
      </div>
    </div>
  );
};

export default TechAgentConsole;
