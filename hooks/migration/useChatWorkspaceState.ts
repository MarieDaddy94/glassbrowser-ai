import React from 'react';
import type { EnterpriseFeatureFlags } from '../../services/enterpriseFeatureFlags';
import { useChatWorkspaceStore } from '../../stores/chatWorkspaceStore';
import {
  buildParityMismatchKey,
  parityValuesEqual,
  type MigrationParitySlice
} from '../../services/migrationParity';
import type { ChatWorkspaceInspectorSnapshot } from '../../services/domain/chatWorkspaceDomain';

type SetStateAction<T> = React.SetStateAction<T>;

const resolveNext = <T,>(action: SetStateAction<T>, prev: T): T =>
  typeof action === 'function' ? (action as (input: T) => T)(prev) : action;

const asUnreadMap = (value: any): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const safeKey = String(key || '').trim();
    if (!safeKey) continue;
    next[safeKey] = Number(raw || 0) || 0;
  }
  return next;
};

export interface UseChatWorkspaceStateArgs {
  flags: EnterpriseFeatureFlags;
  legacyActiveSignalThreadId: string | null;
  setLegacyActiveSignalThreadId: React.Dispatch<SetStateAction<string | null>>;
  legacySignalThreadUnreadCountsState: Record<string, number>;
  setLegacySignalThreadUnreadCountsState: React.Dispatch<SetStateAction<Record<string, number>>>;
  legacyChatContextInspectorState: ChatWorkspaceInspectorSnapshot | null;
  setLegacyChatContextInspectorState: React.Dispatch<SetStateAction<ChatWorkspaceInspectorSnapshot | null>>;
  onParityMismatch?: (slice: MigrationParitySlice, field: string, legacyValue: any, storeValue: any) => void;
}

export const useChatWorkspaceState = ({
  flags,
  legacyActiveSignalThreadId,
  setLegacyActiveSignalThreadId,
  legacySignalThreadUnreadCountsState,
  setLegacySignalThreadUnreadCountsState,
  legacyChatContextInspectorState,
  setLegacyChatContextInspectorState,
  onParityMismatch
}: UseChatWorkspaceStateArgs) => {
  const storeActiveThreadId = useChatWorkspaceStore((state) => state.activeThreadId);
  const storeUnreadByThread = useChatWorkspaceStore((state) => state.unreadByThread);
  const storeContextInspector = useChatWorkspaceStore((state) => state.contextInspector);
  const setStoreActiveThread = useChatWorkspaceStore((state) => state.setActiveThread);
  const setStoreUnreadByThread = useChatWorkspaceStore((state) => state.setUnreadByThread);
  const setStoreContextInspector = useChatWorkspaceStore((state) => state.setContextInspector);
  const parityKeysRef = React.useRef<Set<string>>(new Set());

  const sliceEnabled = flags.zustandMigrationV1 && flags.zustandChatSliceV1;
  const parityEnabled = flags.phase4ParityAuditV1;

  const activeSignalThreadId =
    sliceEnabled && (storeActiveThreadId == null || typeof storeActiveThreadId === 'string')
      ? storeActiveThreadId
      : legacyActiveSignalThreadId;
  const signalThreadUnreadCountsState =
    sliceEnabled && storeUnreadByThread && typeof storeUnreadByThread === 'object'
      ? asUnreadMap(storeUnreadByThread)
      : asUnreadMap(legacySignalThreadUnreadCountsState);
  const chatContextInspectorState =
    sliceEnabled && storeContextInspector && typeof storeContextInspector === 'object'
      ? storeContextInspector
      : legacyChatContextInspectorState;

  React.useEffect(() => {
    if (!sliceEnabled) return;
    try {
      setStoreActiveThread(legacyActiveSignalThreadId ?? null);
    } catch {
      // fallback to legacy state only
    }
  }, [legacyActiveSignalThreadId, setStoreActiveThread, sliceEnabled]);

  React.useEffect(() => {
    if (!sliceEnabled) return;
    try {
      setStoreUnreadByThread(asUnreadMap(legacySignalThreadUnreadCountsState));
    } catch {
      // fallback to legacy state only
    }
  }, [legacySignalThreadUnreadCountsState, setStoreUnreadByThread, sliceEnabled]);

  React.useEffect(() => {
    if (!sliceEnabled) return;
    try {
      setStoreContextInspector(legacyChatContextInspectorState || null);
    } catch {
      // fallback to legacy state only
    }
  }, [legacyChatContextInspectorState, setStoreContextInspector, sliceEnabled]);

  React.useEffect(() => {
    if (!sliceEnabled || !parityEnabled || typeof onParityMismatch !== 'function') return;
    const checks: Array<{ field: string; legacy: any; store: any }> = [
      { field: 'activeSignalThreadId', legacy: legacyActiveSignalThreadId, store: storeActiveThreadId },
      { field: 'signalThreadUnreadCountsState', legacy: asUnreadMap(legacySignalThreadUnreadCountsState), store: asUnreadMap(storeUnreadByThread) },
      { field: 'chatContextInspectorState', legacy: legacyChatContextInspectorState, store: storeContextInspector }
    ];
    for (const check of checks) {
      if (parityValuesEqual(check.legacy, check.store)) continue;
      const mismatchKey = buildParityMismatchKey('chat', check.field, check.legacy, check.store);
      if (parityKeysRef.current.has(mismatchKey)) continue;
      parityKeysRef.current.add(mismatchKey);
      onParityMismatch('chat', check.field, check.legacy, check.store);
    }
  }, [
    legacyActiveSignalThreadId,
    legacyChatContextInspectorState,
    legacySignalThreadUnreadCountsState,
    onParityMismatch,
    parityEnabled,
    sliceEnabled,
    storeActiveThreadId,
    storeContextInspector,
    storeUnreadByThread
  ]);

  const setActiveSignalThreadId = React.useCallback((action: SetStateAction<string | null>) => {
    setLegacyActiveSignalThreadId((prev) => {
      const next = resolveNext<string | null>(action, prev);
      try {
        setStoreActiveThread(next ?? null);
      } catch {
        // fallback to legacy state only
      }
      return next ?? null;
    });
  }, [setLegacyActiveSignalThreadId, setStoreActiveThread]);

  const setSignalThreadUnreadCountsState = React.useCallback((action: SetStateAction<Record<string, number>>) => {
    setLegacySignalThreadUnreadCountsState((prev) => {
      const next = asUnreadMap(resolveNext<Record<string, number>>(action, asUnreadMap(prev)));
      try {
        setStoreUnreadByThread(next);
      } catch {
        // fallback to legacy state only
      }
      return next;
    });
  }, [setLegacySignalThreadUnreadCountsState, setStoreUnreadByThread]);

  const setChatContextInspectorState = React.useCallback((action: SetStateAction<ChatWorkspaceInspectorSnapshot | null>) => {
    setLegacyChatContextInspectorState((prev) => {
      const next = resolveNext<ChatWorkspaceInspectorSnapshot | null>(action, prev || null);
      try {
        setStoreContextInspector(next || null);
      } catch {
        // fallback to legacy state only
      }
      return next || null;
    });
  }, [setLegacyChatContextInspectorState, setStoreContextInspector]);

  return {
    activeSignalThreadId,
    setActiveSignalThreadId,
    signalThreadUnreadCountsState,
    setSignalThreadUnreadCountsState,
    chatContextInspectorState,
    setChatContextInspectorState
  };
};
