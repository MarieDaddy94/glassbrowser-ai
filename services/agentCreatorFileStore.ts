import { UploadedTextRef } from '../types';

export const AGENT_CREATOR_SESSION_STORAGE_KEY = 'glass_agent_creator_session_v1';
export const AGENT_CREATOR_DRAFTS_STORAGE_KEY = 'glass_agent_creator_drafts_v1';
export const AGENT_CREATOR_FILES_STORAGE_KEY = 'glass_agent_creator_files_v1';

const AGENT_CREATOR_FILE_CONTENT_PREFIX = 'glass_agent_creator_file_text_v1:';
const MAX_TEXT_FILE_SIZE_BYTES = 512 * 1024;
const MAX_TEXT_FILES = 10;
const MAX_EXCERPT_CHARS = 220;

const nowMs = () => Date.now();

const canUseStorage = () => {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
};

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const readTextFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      resolve(value);
    };
    reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
    reader.readAsText(file, 'utf-8');
  });
};

export const listUploadedTextRefs = (): UploadedTextRef[] => {
  if (!canUseStorage()) return [];
  const parsed = safeParse<UploadedTextRef[]>(localStorage.getItem(AGENT_CREATOR_FILES_STORAGE_KEY), []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      id: String(entry.id || ''),
      name: String(entry.name || 'file.txt'),
      sizeBytes: Number(entry.sizeBytes || 0),
      textExcerpt: String(entry.textExcerpt || ''),
      storageKey: String(entry.storageKey || ''),
      createdAtMs: Number(entry.createdAtMs || 0) || nowMs()
    }))
    .filter((entry) => !!entry.id && !!entry.storageKey)
    .slice(0, MAX_TEXT_FILES);
};

export const saveUploadedTextRefs = (items: UploadedTextRef[]) => {
  if (!canUseStorage()) return;
  const next = Array.isArray(items) ? items.slice(0, MAX_TEXT_FILES) : [];
  localStorage.setItem(AGENT_CREATOR_FILES_STORAGE_KEY, JSON.stringify(next));
};

export const getUploadedTextContent = (storageKey: string): string => {
  if (!canUseStorage()) return '';
  const key = String(storageKey || '').trim();
  if (!key) return '';
  return String(localStorage.getItem(key) || '');
};

export const removeUploadedTextRef = (entry: UploadedTextRef) => {
  if (!canUseStorage()) return;
  const key = String(entry?.storageKey || '').trim();
  if (key) localStorage.removeItem(key);
  const next = listUploadedTextRefs().filter((item) => item.id !== entry.id);
  saveUploadedTextRefs(next);
};

export const importTextFile = async (file: File): Promise<{
  ok: boolean;
  ref?: UploadedTextRef;
  text?: string;
  error?: string;
}> => {
  if (!file) return { ok: false, error: 'No file selected.' };
  const name = String(file.name || '').trim();
  if (!name.toLowerCase().endsWith('.txt')) {
    return { ok: false, error: 'Only .txt files are supported.' };
  }
  if (file.size > MAX_TEXT_FILE_SIZE_BYTES) {
    return { ok: false, error: `File exceeds 512 KB limit (${Math.floor(file.size / 1024)} KB).` };
  }
  const existing = listUploadedTextRefs();
  if (existing.length >= MAX_TEXT_FILES) {
    return { ok: false, error: `Maximum ${MAX_TEXT_FILES} text files per session.` };
  }

  try {
    const text = await readTextFile(file);
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `txt_${crypto.randomUUID()}`
        : `txt_${nowMs()}_${Math.random().toString(16).slice(2, 8)}`;
    const storageKey = `${AGENT_CREATOR_FILE_CONTENT_PREFIX}${id}`;
    if (canUseStorage()) {
      localStorage.setItem(storageKey, text);
    }
    const excerpt = text.replace(/\s+/g, ' ').trim().slice(0, MAX_EXCERPT_CHARS);
    const ref: UploadedTextRef = {
      id,
      name: name || 'strategy.txt',
      sizeBytes: Number(file.size || 0),
      textExcerpt: excerpt,
      storageKey,
      createdAtMs: nowMs()
    };
    saveUploadedTextRefs([ref, ...existing]);
    return { ok: true, ref, text };
  } catch (err: any) {
    return { ok: false, error: err?.message ? String(err.message) : 'Failed to import text file.' };
  }
};

