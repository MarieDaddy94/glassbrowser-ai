type ActionResult = { ok: boolean; error?: string; data?: any };

export type RunNotesActionRuntimeInput = {
  actionId: string;
  payload: Record<string, any>;
};

export async function runNotesActionRuntime(
  input: RunNotesActionRuntimeInput
): Promise<{ handled: boolean; result?: ActionResult }> {
  const actionId = String(input.actionId || '').trim();
  const payload = input.payload && typeof input.payload === 'object' ? input.payload : {};

  if (actionId === 'notes.append') {
    const now = Date.now();
    const templateId = String(payload.templateId || payload.template || 'blank').trim() || 'blank';
    const title = String(payload.title || '').trim() || `${templateId} - ${new Date(now).toLocaleDateString()}`;
    const entry = {
      id: payload.id ? String(payload.id) : `note_${now}_${Math.random().toString(16).slice(2, 6)}`,
      templateId,
      title,
      fields: payload.fields && typeof payload.fields === 'object' ? payload.fields : {},
      checklist: payload.checklist && typeof payload.checklist === 'object' ? payload.checklist : {},
      body: payload.body != null ? String(payload.body) : '',
      context: payload.context && typeof payload.context === 'object' ? payload.context : null,
      tradeLinks: Array.isArray(payload.tradeLinks) ? payload.tradeLinks : [],
      tags: Array.isArray(payload.tags) ? payload.tags.map((tag: any) => String(tag || '').trim()).filter(Boolean) : [],
      createdAtMs: Number.isFinite(Number(payload.createdAtMs)) ? Number(payload.createdAtMs) : now,
      updatedAtMs: now
    };
    try {
      const raw = localStorage.getItem('glass_notes_v1');
      const existing = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(existing) ? existing : [];
      const next = [entry, ...list].slice(0, 500);
      localStorage.setItem('glass_notes_v1', JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
    try {
      window.dispatchEvent(new CustomEvent('glass_notes_append', { detail: entry }));
    } catch {
      // ignore event errors
    }
    return { handled: true, result: { ok: true, data: { noteId: entry.id } } };
  }

  if (actionId === 'notes.list') {
    const limit = Number.isFinite(Number(payload.limit)) ? Math.max(1, Math.floor(Number(payload.limit))) : 200;
    const raw = localStorage.getItem('glass_notes_v1');
    const parsed = (() => {
      try {
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    })();
    let list = Array.isArray(parsed) ? parsed : [];
    const search = String(payload.search || '').trim().toLowerCase();
    const templateId = String(payload.templateId || payload.template || '').trim();
    const tags = Array.isArray(payload.tags) ? payload.tags.map((t: any) => String(t || '').trim()).filter(Boolean) : [];
    const tag = String(payload.tag || '').trim();
    const sinceMs = Number.isFinite(Number(payload.sinceMs)) ? Number(payload.sinceMs) : null;
    const untilMs = Number.isFinite(Number(payload.untilMs)) ? Number(payload.untilMs) : null;
    if (templateId) {
      list = list.filter((note) => String(note?.templateId || '') === templateId);
    }
    if (tag || tags.length > 0) {
      const tagSet = new Set([tag, ...tags].filter(Boolean).map((t) => t.toLowerCase()));
      list = list.filter((note) => {
        const noteTags = Array.isArray(note?.tags) ? note.tags.map((t: any) => String(t || '').toLowerCase()) : [];
        return noteTags.some((t: string) => tagSet.has(t));
      });
    }
    if (search) {
      list = list.filter((note) => {
        const text = `${note?.title || ''} ${note?.body || ''}`.toLowerCase();
        return text.includes(search);
      });
    }
    if (sinceMs) {
      list = list.filter((note) => Number(note?.createdAtMs || 0) >= sinceMs);
    }
    if (untilMs) {
      list = list.filter((note) => Number(note?.createdAtMs || 0) <= untilMs);
    }
    return { handled: true, result: { ok: true, data: { notes: list.slice(0, limit) } } };
  }

  if (actionId === 'notes.filters.set') {
    const detail = {
      search: payload.search != null ? String(payload.search) : undefined,
      tags: Array.isArray(payload.tags) ? payload.tags.map((t: any) => String(t || '').trim()).filter(Boolean) : undefined,
      tag: payload.tag != null ? String(payload.tag).trim() : undefined,
      templateId: payload.templateId != null ? String(payload.templateId) : payload.template != null ? String(payload.template) : undefined,
      dateKey: payload.dateKey != null ? String(payload.dateKey) : payload.date != null ? String(payload.date) : undefined,
      clear: payload.clear === true
    };
    try {
      window.dispatchEvent(new CustomEvent('glass_notes_filters', { detail }));
    } catch {
      // ignore
    }
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'notes.entry.open') {
    const detail = payload && typeof payload === 'object' ? payload : {};
    try {
      window.dispatchEvent(new CustomEvent('glass_notes_entry', { detail }));
    } catch {
      return { handled: true, result: { ok: false, error: 'Unable to open note entry.' } };
    }
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'notes.checklist.toggle') {
    const detail = payload && typeof payload === 'object' ? payload : {};
    try {
      window.dispatchEvent(new CustomEvent('glass_notes_checklist', { detail }));
    } catch {
      return { handled: true, result: { ok: false, error: 'Unable to toggle checklist item.' } };
    }
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'notes.mistake.toggle') {
    const detail = payload && typeof payload === 'object' ? payload : {};
    try {
      window.dispatchEvent(new CustomEvent('glass_notes_mistake', { detail }));
    } catch {
      return { handled: true, result: { ok: false, error: 'Unable to toggle mistake tag.' } };
    }
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'notes.trade_link.add' || actionId === 'notes.trade_link.remove') {
    const detail = payload && typeof payload === 'object' ? payload : {};
    try {
      window.dispatchEvent(new CustomEvent('glass_notes_trade_link', { detail: { ...detail, action: actionId } }));
    } catch {
      return { handled: true, result: { ok: false, error: 'Unable to update trade links.' } };
    }
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'notes.trade.replay') {
    const detail = payload && typeof payload === 'object' ? payload : {};
    try {
      window.dispatchEvent(new CustomEvent('glass_notes_trade_replay', { detail }));
    } catch {
      return { handled: true, result: { ok: false, error: 'Unable to replay linked trade.' } };
    }
    return { handled: true, result: { ok: true, data: { replay: true } } };
  }

  if (actionId === 'notes.context.attach' || actionId === 'notes.context.clear') {
    const detail = payload && typeof payload === 'object' ? payload : {};
    try {
      window.dispatchEvent(new CustomEvent('glass_notes_context', { detail: { ...detail, action: actionId } }));
    } catch {
      return { handled: true, result: { ok: false, error: 'Unable to update note context.' } };
    }
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'notes.auto_link.set' || actionId === 'notes.auto_recap.set') {
    const enabled = payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : payload.on !== undefined ? !!payload.on : true;
    const detail = actionId === 'notes.auto_link.set' ? { autoLink: enabled } : { autoRecap: enabled };
    try {
      window.dispatchEvent(new CustomEvent('glass_notes_preferences', { detail }));
    } catch {
      return { handled: true, result: { ok: false, error: 'Unable to update notes preferences.' } };
    }
    return { handled: true, result: { ok: true, data: detail } };
  }

  if (actionId === 'notes.summary.set') {
    const detail = {
      show: payload.show !== undefined ? !!payload.show : payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : undefined,
      toggle: payload.toggle === true
    };
    try {
      window.dispatchEvent(new CustomEvent('glass_notes_summary', { detail }));
    } catch {
      return { handled: true, result: { ok: false, error: 'Unable to update notes summary.' } };
    }
    return { handled: true, result: { ok: true, data: detail } };
  }

  if (actionId === 'notes.calendar.set_month') {
    const detail = {
      month: payload.month,
      monthIndex: payload.monthIndex,
      year: payload.year,
      date: payload.date,
      show: payload.show !== undefined ? !!payload.show : payload.open !== undefined ? !!payload.open : true
    };
    try {
      window.dispatchEvent(new CustomEvent('glass_notes_calendar', { detail }));
    } catch {
      return { handled: true, result: { ok: false, error: 'Unable to update calendar month.' } };
    }
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'notes.update') {
    const id = String(payload.id || payload.noteId || '').trim();
    if (!id) return { handled: true, result: { ok: false, error: 'Note id is required.' } };
    const raw = localStorage.getItem('glass_notes_v1');
    const parsed = (() => {
      try {
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    })();
    const list = Array.isArray(parsed) ? parsed : [];
    const idx = list.findIndex((note) => String(note?.id || '') === id);
    if (idx < 0) return { handled: true, result: { ok: false, error: 'Note not found.' } };
    const prev = list[idx] || {};
    const updated = {
      ...prev,
      title: payload.title != null ? String(payload.title) : prev.title,
      body: payload.body != null ? String(payload.body) : prev.body,
      fields: payload.fields && typeof payload.fields === 'object' ? payload.fields : prev.fields,
      checklist: payload.checklist && typeof payload.checklist === 'object' ? payload.checklist : prev.checklist,
      tags: Array.isArray(payload.tags) ? payload.tags.map((t: any) => String(t || '').trim()).filter(Boolean) : prev.tags,
      templateId: payload.templateId != null ? String(payload.templateId) : prev.templateId,
      tradeLinks: Array.isArray(payload.tradeLinks) ? payload.tradeLinks : prev.tradeLinks,
      context: payload.context && typeof payload.context === 'object' ? payload.context : prev.context,
      updatedAtMs: Date.now()
    };
    list[idx] = updated;
    try {
      localStorage.setItem('glass_notes_v1', JSON.stringify(list));
    } catch {
      return { handled: true, result: { ok: false, error: 'Failed to persist note update.' } };
    }
    try {
      window.dispatchEvent(new CustomEvent('glass_notes_append', { detail: updated }));
    } catch {
      // ignore event failures
    }
    return { handled: true, result: { ok: true, data: { noteId: id } } };
  }

  if (actionId === 'notes.delete') {
    const id = String(payload.id || payload.noteId || '').trim();
    if (!id) return { handled: true, result: { ok: false, error: 'Note id is required.' } };
    const raw = localStorage.getItem('glass_notes_v1');
    const parsed = (() => {
      try {
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    })();
    const list = Array.isArray(parsed) ? parsed : [];
    const next = list.filter((note) => String(note?.id || '') !== id);
    if (next.length === list.length) return { handled: true, result: { ok: false, error: 'Note not found.' } };
    try {
      localStorage.setItem('glass_notes_v1', JSON.stringify(next));
    } catch {
      return { handled: true, result: { ok: false, error: 'Failed to persist note delete.' } };
    }
    try {
      window.dispatchEvent(new CustomEvent('glass_notes_delete', { detail: { id } }));
    } catch {
      // ignore event failures
    }
    return { handled: true, result: { ok: true, data: { noteId: id } } };
  }

  if (actionId === 'notes.export') {
    const format = String(payload.format || payload.type || 'markdown').trim().toLowerCase();
    const mode = String(payload.mode || 'return').trim().toLowerCase();
    const raw = localStorage.getItem('glass_notes_v1');
    let parsed: any = [];
    try {
      parsed = raw ? JSON.parse(raw) : [];
    } catch {
      parsed = [];
    }
    let list = Array.isArray(parsed) ? parsed : [];
    const tag = String(payload.tag || '').trim();
    const tags = Array.isArray(payload.tags) ? payload.tags.map((t: any) => String(t || '').trim()).filter(Boolean) : [];
    const templateId = String(payload.templateId || payload.template || '').trim();
    const sinceMs = Number.isFinite(Number(payload.sinceMs)) ? Number(payload.sinceMs) : null;
    const untilMs = Number.isFinite(Number(payload.untilMs)) ? Number(payload.untilMs) : null;
    const rangeHours = Number.isFinite(Number(payload.rangeHours)) ? Number(payload.rangeHours) : null;
    const rangeCutoff = rangeHours ? Date.now() - rangeHours * 60 * 60 * 1000 : null;
    if (tag || tags.length > 0) {
      const tagSet = new Set([tag, ...tags].filter(Boolean).map((t) => t.toLowerCase()));
      list = list.filter((note) => {
        const noteTags = Array.isArray(note?.tags) ? note.tags.map((t: any) => String(t || '').toLowerCase()) : [];
        return noteTags.some((t: string) => tagSet.has(t));
      });
    }
    if (templateId) {
      list = list.filter((note) => String(note?.templateId || '') === templateId);
    }
    if (sinceMs) {
      list = list.filter((note) => Number(note?.createdAtMs || 0) >= sinceMs);
    }
    if (untilMs) {
      list = list.filter((note) => Number(note?.createdAtMs || 0) <= untilMs);
    }
    if (rangeCutoff) {
      list = list.filter((note) => Number(note?.createdAtMs || 0) >= rangeCutoff);
    }
    const escapeCsv = (value: string) => {
      const rawValue = String(value ?? '');
      if (rawValue.includes('"') || rawValue.includes(',') || rawValue.includes('\n')) {
        return `"${rawValue.replace(/"/g, '""')}"`;
      }
      return rawValue;
    };
    const notesToCsv = (items: any[]) => {
      const headers = [
        'id',
        'template',
        'title',
        'tags',
        'createdAt',
        'updatedAt',
        'contextUrl',
        'contextSymbol',
        'contextTimeframe',
        'contextBias',
        'tradeLinks',
        'fields',
        'body'
      ];
      const rows = items.map((note) => {
        const tradeLinks = (note.tradeLinks || []).map((link: any) => {
          const pnlVal = link.realizedPnl ?? link.pnlEstimate;
          return `${link.symbol || 'UNKNOWN'}:${link.action || ''}:${pnlVal ?? ''}`;
        }).join(' | ');
        const fields = Object.entries(note.fields || {}).map(([k, v]) => `${k}=${v}`).join('; ');
        return [
          note.id,
          note.templateId,
          note.title,
          (note.tags || []).join('|'),
          note.createdAtMs ? new Date(note.createdAtMs).toISOString() : '',
          note.updatedAtMs ? new Date(note.updatedAtMs).toISOString() : '',
          note.context?.url || '',
          note.context?.symbol || '',
          note.context?.timeframe || '',
          note.context?.sessionBias || '',
          tradeLinks,
          fields,
          note.body || ''
        ].map(escapeCsv).join(',');
      });
      return `${headers.join(',')}\n${rows.join('\n')}`;
    };
    const notesToMarkdown = (items: any[]) => {
      return items.map((note) => {
        const lines: string[] = [];
        lines.push(`## ${note.title || 'Untitled'}`);
        lines.push(`- Template: ${note.templateId || 'unknown'}`);
        if (note.createdAtMs) lines.push(`- Created: ${new Date(note.createdAtMs).toLocaleString()}`);
        if (note.updatedAtMs) lines.push(`- Updated: ${new Date(note.updatedAtMs).toLocaleString()}`);
        if (note.tags && note.tags.length > 0) lines.push(`- Tags: ${note.tags.join(', ')}`);
        if (note.context?.url) lines.push(`- Context: ${note.context.url}`);
        if (note.context?.symbol || note.context?.timeframe || note.context?.sessionBias) {
          lines.push(`- Context Meta: ${[note.context.symbol, note.context.timeframe, note.context.sessionBias].filter(Boolean).join(' | ')}`);
        }
        if (note.tradeLinks && note.tradeLinks.length > 0) {
          lines.push(`- Linked Trades:`);
          note.tradeLinks.forEach((link: any) => {
            const pnlVal = link.realizedPnl ?? link.pnlEstimate;
            lines.push(`  - ${link.symbol || 'UNKNOWN'} ${link.action || ''} ${pnlVal ?? ''}`);
          });
        }
        if (note.fields && Object.keys(note.fields).length > 0) {
          lines.push(`- Fields:`);
          Object.entries(note.fields).forEach(([k, v]) => {
            lines.push(`  - ${k}: ${v}`);
          });
        }
        if (note.body) {
          lines.push('', note.body);
        }
        lines.push('');
        return lines.join('\n');
      }).join('\n');
    };
    const payloadText = format === 'csv' ? notesToCsv(list) : notesToMarkdown(list);
    if (mode === 'return') return { handled: true, result: { ok: true, data: { text: payloadText } } };
    if (mode === 'clipboard') {
      try {
        const fn = (window as any)?.glass?.clipboard?.writeText;
        if (fn) {
          const res = fn(payloadText);
          if (res && typeof res.then === 'function') await res;
          return { handled: true, result: { ok: true, data: { copied: true } } };
        }
      } catch {
        // ignore
      }
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(payloadText);
          return { handled: true, result: { ok: true, data: { copied: true } } };
        }
      } catch {
        return { handled: true, result: { ok: false, error: 'Clipboard unavailable.' } };
      }
    }
    const saver = (window as any)?.glass?.saveUserFile;
    if (typeof saver === 'function') {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(payloadText);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const ext = format === 'csv' ? 'csv' : 'md';
      const res = await saver({
        data: base64,
        mimeType: format === 'csv' ? 'text/csv' : 'text/markdown',
        subdir: 'note-exports',
        prefix: `notes_export_${ext}`
      });
      if (!res?.ok) return { handled: true, result: { ok: false, error: res?.error || 'Export failed.' } };
      return { handled: true, result: { ok: true, data: { filename: res.filename || null } } };
    }
    return { handled: true, result: { ok: false, error: 'Save unavailable.' } };
  }

  return { handled: false };
}
