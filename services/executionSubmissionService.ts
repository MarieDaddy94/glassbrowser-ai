import type { ExecutionSubmissionRequest, ExecutionSubmissionResult } from '../types';
import { areAccountKeysEquivalent, normalizeAccountKeyLoose, selectPrimaryResultByAccountKey } from './accountKeyIdentity';

const normalizeAccountKey = (value: unknown) => String(value || '').trim();

const dedupeAccountKeys = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const original = normalizeAccountKey(raw);
    const key = normalizeAccountKeyLoose(original);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(original);
  }
  return out;
};

export const submitTradeLockerOrderBatch = async (
  input: ExecutionSubmissionRequest
): Promise<ExecutionSubmissionResult> => {
  const route = input.route;
  const targets = dedupeAccountKeys(input.executionTargets);
  const snapshotAccountKey = normalizeAccountKey(input.snapshotAccountKey || '');

  if (targets.length === 0) {
    return {
      ok: false,
      route,
      attempts: 0,
      restoreAttempted: false,
      results: [],
      primaryResult: null
    };
  }

  const runWithLock = input.withAccountLock;
  if (typeof runWithLock !== 'function') {
    return {
      ok: false,
      route,
      attempts: 0,
      restoreAttempted: false,
      restoreError: 'account_lock_unavailable',
      results: [],
      primaryResult: null
    };
  }

  return await runWithLock(async () => {
    const results: ExecutionSubmissionResult['results'] = [];
    const switchReason = input.switchReason ? String(input.switchReason) : route;
    const restoreReason = input.restoreReason ? String(input.restoreReason) : `${route}_restore`;

    for (const accountKey of targets) {
      const switchRes = await input.ensureAccount(accountKey, switchReason);
      if (!switchRes?.ok) {
        results.push({
          accountKey,
          ok: false,
          error: switchRes?.error ? String(switchRes.error) : 'account_switch_failed',
          normalized: false,
          payload: null,
          res: { ok: false, error: switchRes?.error ? String(switchRes.error) : 'account_switch_failed' }
        });
        continue;
      }

      try {
        const submitted = await input.submitForAccount(accountKey);
        const rawResult = submitted?.res;
        const ok = rawResult?.ok !== false;
        results.push({
          accountKey,
          ok,
          error: ok ? null : (rawResult?.error ? String(rawResult.error) : 'order_submission_failed'),
          normalized: !!submitted?.normalized,
          payload: submitted?.payload && typeof submitted.payload === 'object' ? submitted.payload : null,
          res: rawResult
        });
      } catch (error: any) {
        const message = error?.message ? String(error.message) : 'order_submission_failed';
        results.push({
          accountKey,
          ok: false,
          error: message,
          normalized: false,
          payload: null,
          res: { ok: false, error: message }
        });
      }
    }

    let restoreAttempted = false;
    let restoreError: string | null = null;
    let restoredAccountKey: string | null = null;

    if (snapshotAccountKey && typeof input.getActiveAccountKey === 'function') {
      const active = normalizeAccountKey(input.getActiveAccountKey() || '');
      if (active && !areAccountKeysEquivalent(active, snapshotAccountKey)) {
        restoreAttempted = true;
        const restoreRes = await input.ensureAccount(snapshotAccountKey, restoreReason);
        if (restoreRes?.ok) {
          restoredAccountKey = snapshotAccountKey;
        } else {
          restoreError = restoreRes?.error ? String(restoreRes.error) : 'restore_account_failed';
        }
      }
    }

    const primaryAccountKey =
      (snapshotAccountKey && targets.some((target) => areAccountKeysEquivalent(target, snapshotAccountKey))
        ? snapshotAccountKey
        : null) || targets[0];
    const primaryResult = selectPrimaryResultByAccountKey(results, primaryAccountKey) || results[0] || null;

    return {
      ok: !!primaryResult?.ok,
      route,
      attempts: results.length,
      restoreAttempted,
      restoreError,
      restoredAccountKey,
      results,
      primaryResult
    };
  });
};
