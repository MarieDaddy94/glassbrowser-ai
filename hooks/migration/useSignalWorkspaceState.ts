import React from 'react';
import type { EnterpriseFeatureFlags } from '../../services/enterpriseFeatureFlags';
import { useSignalWorkspaceStore } from '../../stores/signalWorkspaceStore';
import {
  buildParityMismatchKey,
  parityValuesEqual,
  type MigrationParitySlice
} from '../../services/migrationParity';

type SetStateAction<T> = React.SetStateAction<T>;

const resolveNext = <T,>(action: SetStateAction<T>, prev: T): T =>
  typeof action === 'function' ? (action as (input: T) => T)(prev) : action;

const asArchivedMap = (value: any): Record<string, boolean> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next: Record<string, boolean> = {};
  for (const [key, raw] of Object.entries(value)) {
    const safeKey = String(key || '').trim();
    if (!safeKey) continue;
    next[safeKey] = raw === true;
  }
  return next;
};

export interface UseSignalWorkspaceStateArgs {
  flags: EnterpriseFeatureFlags;
  legacyActiveSignalThreadId: string | null;
  setLegacyActiveSignalThreadId: React.Dispatch<SetStateAction<string | null>>;
  legacyThreadArchivedBySignalId: Record<string, boolean>;
  setLegacyThreadArchivedBySignalId: React.Dispatch<SetStateAction<Record<string, boolean>>>;
  legacySignalStatusReportRunning: boolean;
  setLegacySignalStatusReportRunning: React.Dispatch<SetStateAction<boolean>>;
  legacySignalStatusReportPending: 'manual' | 'chart_update' | null;
  setLegacySignalStatusReportPending: React.Dispatch<SetStateAction<'manual' | 'chart_update' | null>>;
  onParityMismatch?: (slice: MigrationParitySlice, field: string, legacyValue: any, storeValue: any) => void;
}

export const useSignalWorkspaceState = ({
  flags,
  legacyActiveSignalThreadId,
  setLegacyActiveSignalThreadId,
  legacyThreadArchivedBySignalId,
  setLegacyThreadArchivedBySignalId,
  legacySignalStatusReportRunning,
  setLegacySignalStatusReportRunning,
  legacySignalStatusReportPending,
  setLegacySignalStatusReportPending,
  onParityMismatch
}: UseSignalWorkspaceStateArgs) => {
  const storeActiveSignalId = useSignalWorkspaceStore((state) => state.activeSignalId);
  const storeArchived = useSignalWorkspaceStore((state) => state.threadArchivedBySignalId);
  const storeStatusReportRunning = useSignalWorkspaceStore((state) => state.statusReportRunning);
  const storeStatusReportPending = useSignalWorkspaceStore((state) => state.statusReportPending);
  const setStoreActiveSignalId = useSignalWorkspaceStore((state) => state.setActiveSignalId);
  const setStoreArchivedBySignalId = useSignalWorkspaceStore((state) => state.setSignalArchived);
  const setStoreStatusReportRunning = useSignalWorkspaceStore((state) => state.setStatusReportRunning);
  const setStoreStatusReportPending = useSignalWorkspaceStore((state) => state.setStatusReportPending);
  const parityKeysRef = React.useRef<Set<string>>(new Set());

  const sliceEnabled = flags.zustandMigrationV1 && flags.zustandSignalSliceV1;
  const parityEnabled = flags.phase4ParityAuditV1;

  const activeSignalThreadId =
    sliceEnabled && (storeActiveSignalId == null || typeof storeActiveSignalId === 'string')
      ? storeActiveSignalId
      : legacyActiveSignalThreadId;
  const threadArchivedBySignalId =
    sliceEnabled && storeArchived && typeof storeArchived === 'object'
      ? asArchivedMap(storeArchived)
      : asArchivedMap(legacyThreadArchivedBySignalId);
  const signalStatusReportRunning =
    sliceEnabled && typeof storeStatusReportRunning === 'boolean'
      ? storeStatusReportRunning
      : legacySignalStatusReportRunning;
  const signalStatusReportPending =
    sliceEnabled
      ? (storeStatusReportPending === 'manual' || storeStatusReportPending === 'chart_update' ? storeStatusReportPending : null)
      : legacySignalStatusReportPending;

  React.useEffect(() => {
    if (!sliceEnabled) return;
    try {
      setStoreActiveSignalId(legacyActiveSignalThreadId ?? null);
    } catch {
      // fallback to legacy state only
    }
  }, [legacyActiveSignalThreadId, setStoreActiveSignalId, sliceEnabled]);

  React.useEffect(() => {
    if (!sliceEnabled) return;
    const entries = asArchivedMap(legacyThreadArchivedBySignalId);
    for (const [signalId, archived] of Object.entries(entries)) {
      try {
        setStoreArchivedBySignalId(signalId, archived === true);
      } catch {
        // fallback to legacy state only
      }
    }
  }, [legacyThreadArchivedBySignalId, setStoreArchivedBySignalId, sliceEnabled]);

  React.useEffect(() => {
    if (!sliceEnabled) return;
    try {
      setStoreStatusReportRunning(legacySignalStatusReportRunning === true);
      setStoreStatusReportPending(legacySignalStatusReportPending);
    } catch {
      // fallback to legacy state only
    }
  }, [
    legacySignalStatusReportPending,
    legacySignalStatusReportRunning,
    setStoreStatusReportPending,
    setStoreStatusReportRunning,
    sliceEnabled
  ]);

  React.useEffect(() => {
    if (!sliceEnabled || !parityEnabled || typeof onParityMismatch !== 'function') return;
    const checks: Array<{ field: string; legacy: any; store: any }> = [
      { field: 'activeSignalThreadId', legacy: legacyActiveSignalThreadId, store: storeActiveSignalId },
      { field: 'threadArchivedBySignalId', legacy: asArchivedMap(legacyThreadArchivedBySignalId), store: asArchivedMap(storeArchived) },
      { field: 'signalStatusReportRunning', legacy: legacySignalStatusReportRunning === true, store: storeStatusReportRunning === true },
      { field: 'signalStatusReportPending', legacy: legacySignalStatusReportPending, store: storeStatusReportPending }
    ];
    for (const check of checks) {
      if (parityValuesEqual(check.legacy, check.store)) continue;
      const mismatchKey = buildParityMismatchKey('signal', check.field, check.legacy, check.store);
      if (parityKeysRef.current.has(mismatchKey)) continue;
      parityKeysRef.current.add(mismatchKey);
      onParityMismatch('signal', check.field, check.legacy, check.store);
    }
  }, [
    legacyActiveSignalThreadId,
    legacySignalStatusReportPending,
    legacySignalStatusReportRunning,
    legacyThreadArchivedBySignalId,
    onParityMismatch,
    parityEnabled,
    sliceEnabled,
    storeActiveSignalId,
    storeArchived,
    storeStatusReportPending,
    storeStatusReportRunning
  ]);

  const setActiveSignalThreadId = React.useCallback((action: SetStateAction<string | null>) => {
    setLegacyActiveSignalThreadId((prev) => {
      const next = resolveNext(action, prev);
      try {
        setStoreActiveSignalId(next ?? null);
      } catch {
        // fallback to legacy state only
      }
      return next ?? null;
    });
  }, [setLegacyActiveSignalThreadId, setStoreActiveSignalId]);

  const setThreadArchivedBySignalId = React.useCallback((action: SetStateAction<Record<string, boolean>>) => {
    setLegacyThreadArchivedBySignalId((prev) => {
      const next = asArchivedMap(resolveNext(action, asArchivedMap(prev)));
      for (const [signalId, archived] of Object.entries(next)) {
        try {
          setStoreArchivedBySignalId(signalId, archived === true);
        } catch {
          // fallback to legacy state only
        }
      }
      return next;
    });
  }, [setLegacyThreadArchivedBySignalId, setStoreArchivedBySignalId]);

  const setSignalStatusReportRunning = React.useCallback((action: SetStateAction<boolean>) => {
    setLegacySignalStatusReportRunning((prev) => {
      const next = resolveNext<boolean>(action, prev) === true;
      try {
        setStoreStatusReportRunning(next);
      } catch {
        // fallback to legacy state only
      }
      return next;
    });
  }, [setLegacySignalStatusReportRunning, setStoreStatusReportRunning]);

  const setSignalStatusReportPending = React.useCallback((action: SetStateAction<'manual' | 'chart_update' | null>) => {
    setLegacySignalStatusReportPending((prev) => {
      const resolved = resolveNext<'manual' | 'chart_update' | null>(action, prev);
      const next = resolved === 'manual' || resolved === 'chart_update' ? resolved : null;
      try {
        setStoreStatusReportPending(next);
      } catch {
        // fallback to legacy state only
      }
      return next;
    });
  }, [setLegacySignalStatusReportPending, setStoreStatusReportPending]);

  return {
    activeSignalThreadId,
    setActiveSignalThreadId,
    threadArchivedBySignalId,
    setThreadArchivedBySignalId,
    signalStatusReportRunning,
    setSignalStatusReportRunning,
    signalStatusReportPending,
    setSignalStatusReportPending
  };
};
