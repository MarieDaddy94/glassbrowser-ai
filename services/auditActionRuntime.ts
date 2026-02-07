type ActionResult = { ok: boolean; error?: string; data?: any };

export type RunAuditActionRuntimeInput = {
  actionId: string;
  payload: Record<string, any>;
  executeAgentToolRequest: (action: any, onProgress?: (update: any) => void) => Promise<any>;
  liveErrors: any[];
  getTechAgentLogs: () => any[];
};

export async function runAuditActionRuntime(
  input: RunAuditActionRuntimeInput
): Promise<{ handled: boolean; result?: ActionResult }> {
  const actionId = String(input.actionId || '').trim();
  const payload = input.payload && typeof input.payload === 'object' ? input.payload : {};

  if (actionId === 'audit.list') {
    const ledger = (window as any).glass?.tradeLedger;
    if (!ledger?.list) return { handled: true, result: { ok: false, error: 'Audit log unavailable.' } };
    const limit = Number.isFinite(Number(payload.limit)) ? Math.max(1, Math.floor(Number(payload.limit))) : 500;
    const res = await ledger.list({ limit });
    if (!res?.ok) return { handled: true, result: { ok: false, error: res?.error || 'Failed to load audit events.' } };
    let entries = Array.isArray(res.entries) ? res.entries : [];
    entries = entries.filter((entry: any) => entry?.kind === 'audit_event');
    const symbol = String(payload.symbol || '').trim().toLowerCase();
    const eventType = String(payload.eventType || '').trim().toLowerCase();
    const level = String(payload.level || '').trim().toLowerCase();
    const sinceMs = Number.isFinite(Number(payload.sinceMs)) ? Number(payload.sinceMs) : null;
    const rangeHours = Number.isFinite(Number(payload.rangeHours)) ? Number(payload.rangeHours) : null;
    const cutoffMs = rangeHours ? Date.now() - rangeHours * 60 * 60 * 1000 : null;
    entries = entries.filter((entry: any) => {
      if (symbol && String(entry?.symbol || '').toLowerCase() !== symbol) return false;
      if (eventType && String(entry?.eventType || '').toLowerCase() !== eventType) return false;
      if (level && String(entry?.level || '').toLowerCase() !== level) return false;
      const createdAtMs = Number(entry?.createdAtMs || 0);
      if (sinceMs && createdAtMs < sinceMs) return false;
      if (cutoffMs && createdAtMs < cutoffMs) return false;
      return true;
    });
    return { handled: true, result: { ok: true, data: { entries } } };
  }

  if (actionId === 'audit.filters.set') {
    const detail = payload && typeof payload === 'object' ? payload : {};
    try {
      window.dispatchEvent(new CustomEvent('glass_audit_filters', { detail }));
    } catch {
      return { handled: true, result: { ok: false, error: 'Unable to update audit filters.' } };
    }
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'audit.export') {
    const ledger = (window as any).glass?.tradeLedger;
    if (!ledger?.list) return { handled: true, result: { ok: false, error: 'Audit log unavailable.' } };
    const limit = Number.isFinite(Number(payload.limit)) ? Math.max(1, Math.floor(Number(payload.limit))) : 1000;
    const res = await ledger.list({ limit });
    if (!res?.ok) return { handled: true, result: { ok: false, error: res?.error || 'Failed to load audit events.' } };
    let entries = Array.isArray(res.entries) ? res.entries : [];
    entries = entries.filter((entry: any) => entry?.kind === 'audit_event');
    const symbol = String(payload.symbol || '').trim().toLowerCase();
    const eventType = String(payload.eventType || '').trim().toLowerCase();
    const level = String(payload.level || '').trim().toLowerCase();
    const sinceMs = Number.isFinite(Number(payload.sinceMs)) ? Number(payload.sinceMs) : null;
    const rangeHours = Number.isFinite(Number(payload.rangeHours)) ? Number(payload.rangeHours) : null;
    const cutoffMs = rangeHours ? Date.now() - rangeHours * 60 * 60 * 1000 : null;
    entries = entries.filter((entry: any) => {
      if (symbol && String(entry?.symbol || '').toLowerCase() !== symbol) return false;
      if (eventType && String(entry?.eventType || '').toLowerCase() !== eventType) return false;
      if (level && String(entry?.level || '').toLowerCase() !== level) return false;
      const createdAtMs = Number(entry?.createdAtMs || 0);
      if (sinceMs && createdAtMs < sinceMs) return false;
      if (cutoffMs && createdAtMs < cutoffMs) return false;
      return true;
    });

    const format = String(payload.format || payload.type || 'json').trim().toLowerCase();
    const mode = String(payload.mode || 'return').trim().toLowerCase();
    let output = '';
    let mimeType = 'application/json';
    let ext = 'json';
    if (format === 'csv') {
      const header = ['createdAt', 'eventType', 'level', 'symbol', 'message', 'payload'];
      const escapeCsv = (value: any) => {
        const raw = value == null ? '' : String(value);
        if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
          return `"${raw.replace(/\"/g, '""')}"`;
        }
        return raw;
      };
      const rows = entries.map((entry: any) => [
        entry?.createdAtMs ? new Date(entry.createdAtMs).toISOString() : '',
        entry?.eventType || '',
        entry?.level || '',
        entry?.symbol || '',
        entry?.message || '',
        entry?.payload ? JSON.stringify(entry.payload) : ''
      ]);
      output = [header.join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join('\n');
      mimeType = 'text/csv';
      ext = 'csv';
    } else {
      output = JSON.stringify(
        {
          schemaVersion: 1,
          exportedAtMs: Date.now(),
          entries
        },
        null,
        2
      );
    }

    if (mode === 'return') return { handled: true, result: { ok: true, data: { payload: output } } };
    if (mode === 'clipboard') {
      try {
        const fn = (window as any).glass?.clipboard?.writeText;
        if (fn) {
          const resCopy = fn(output);
          if (resCopy && typeof resCopy.then === 'function') await resCopy;
          return { handled: true, result: { ok: true, data: { copied: true } } };
        }
      } catch {
        // ignore
      }
      return { handled: true, result: { ok: false, error: 'Clipboard unavailable.' } };
    }
    const saver = (window as any).glass?.saveUserFile;
    if (!saver) return { handled: true, result: { ok: false, error: 'Save unavailable.' } };
    const resSave = await saver({
      data: output,
      mimeType,
      subdir: 'audit-exports',
      prefix: `audit_export_${ext}`
    });
    if (!resSave?.ok) return { handled: true, result: { ok: false, error: resSave?.error || 'Export failed.' } };
    return { handled: true, result: { ok: true, data: { filename: resSave.filename || null } } };
  }

  if (actionId === 'diagnostics.export') {
    const detail = String(payload.detail || 'full').trim().toLowerCase() === 'summary' ? 'summary' : 'full';
    const mode = String(payload.mode || 'download').trim().toLowerCase();
    const includeAudit = payload.includeAudit !== false;
    const includeErrors = payload.includeErrors !== false;
    const includeTechLogs = payload.includeTechLogs !== false;
    const maxItems = Number.isFinite(Number(payload.maxItems))
      ? Math.max(1, Math.min(20, Math.floor(Number(payload.maxItems))))
      : detail === 'full'
        ? 12
        : 6;
    const auditLimit = Number.isFinite(Number(payload.limit))
      ? Math.max(50, Math.min(2000, Math.floor(Number(payload.limit))))
      : 400;
    const maxErrors = Number.isFinite(Number(payload.maxErrors))
      ? Math.max(10, Math.min(1000, Math.floor(Number(payload.maxErrors))))
      : 200;
    const maxTechLogs = Number.isFinite(Number(payload.maxTechLogs))
      ? Math.max(10, Math.min(1000, Math.floor(Number(payload.maxTechLogs))))
      : 200;

    let systemState: any = null;
    let systemStateError: string | null = null;
    try {
      const toolRes = await input.executeAgentToolRequest({
        type: 'GET_SYSTEM_STATE',
        detail,
        maxItems,
        source: 'diagnostics'
      });
      if (toolRes?.ok) {
        systemState = toolRes.payload ?? null;
      } else {
        systemStateError = toolRes?.text || 'System snapshot failed.';
      }
    } catch (err: any) {
      systemStateError = err?.message ? String(err.message) : 'System snapshot failed.';
    }

    let auditEntries: any[] | null = null;
    let auditError: string | null = null;
    if (includeAudit) {
      const ledger = (window as any).glass?.tradeLedger;
      if (ledger?.list) {
        try {
          const res = await ledger.list({ limit: auditLimit });
          if (res?.ok && Array.isArray(res.entries)) {
            auditEntries = res.entries.filter((entry: any) => entry?.kind === 'audit_event');
          } else {
            auditError = res?.error || 'Failed to load audit log.';
          }
        } catch (err: any) {
          auditError = err?.message ? String(err.message) : 'Failed to load audit log.';
        }
      } else {
        auditError = 'Audit log unavailable.';
      }
    }

    const errors = includeErrors ? (input.liveErrors || []).slice(-maxErrors) : null;
    const techLogs = includeTechLogs ? input.getTechAgentLogs().slice(-maxTechLogs) : null;
    let appMeta: any = null;
    let appMetaError: string | null = null;
    let releaseArtifacts: any[] | null = null;
    let releaseError: string | null = null;
    let bundleStats: any = null;
    let bundleStatsError: string | null = null;
    try {
      const diag = (window as any).glass?.diagnostics;
      if (diag?.getAppMeta) {
        const res = await diag.getAppMeta();
        if (res?.ok) appMeta = res.meta ?? null;
        else appMetaError = res?.error || 'Failed to load app metadata.';
      } else {
        appMetaError = 'Diagnostics API unavailable.';
      }
      if (diag?.listReleases) {
        const res = await diag.listReleases({ includeHashes: false, maxFiles: 20 });
        if (res?.ok) releaseArtifacts = Array.isArray(res.releases) ? res.releases : [];
        else releaseError = res?.error || 'Failed to list release artifacts.';
      }
      if (diag?.getBundleStats) {
        const res = await diag.getBundleStats();
        if (res?.ok) {
          bundleStats = {
            path: res.path || null,
            summary: res.summary || null
          };
        } else {
          bundleStatsError = res?.error || 'Failed to read bundle stats.';
        }
      } else {
        bundleStatsError = 'Bundle stats API unavailable.';
      }
    } catch (err: any) {
      releaseError = err?.message ? String(err.message) : 'Diagnostics lookup failed.';
    }

    const bundle = {
      schemaVersion: 1,
      exportedAtMs: Date.now(),
      appMeta,
      appMetaError,
      releaseArtifacts,
      releaseError,
      bundleStats,
      bundleStatsError,
      systemState,
      systemStateError,
      audit: includeAudit ? { entries: auditEntries, error: auditError, limit: auditLimit } : null,
      liveErrors: includeErrors ? errors : null,
      techAgentLogs: includeTechLogs ? techLogs : null
    };

    const output = JSON.stringify(bundle, null, 2);

    if (mode === 'return') return { handled: true, result: { ok: true, data: { payload: output } } };
    if (mode === 'clipboard') {
      try {
        const fn = (window as any).glass?.clipboard?.writeText;
        if (fn) {
          const res = fn(output);
          if (res && typeof res.then === 'function') await res;
          return { handled: true, result: { ok: true, data: { copied: true } } };
        }
      } catch {
        // ignore
      }
      return { handled: true, result: { ok: false, error: 'Clipboard unavailable.' } };
    }

    const saver = (window as any).glass?.saveUserFile;
    if (!saver) return { handled: true, result: { ok: false, error: 'Save unavailable.' } };
    const encoder = new TextEncoder();
    const bytes = encoder.encode(output);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const resSave = await saver({
      data: base64,
      mimeType: 'application/json',
      subdir: 'diagnostics',
      prefix: 'diagnostics_bundle_json'
    });
    if (!resSave?.ok) return { handled: true, result: { ok: false, error: resSave?.error || 'Export failed.' } };
    return { handled: true, result: { ok: true, data: { filename: resSave.filename || null } } };
  }

  return { handled: false };
}
