import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';

export type CommandAction = {
  id: string;
  label: string;
  group?: string;
  hint?: string;
  shortcut?: string;
  onSelect: () => void;
};

type CommandPaletteProps = {
  isOpen: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  actions: CommandAction[];
  onClose: () => void;
};

type CommandRow =
  | { type: 'group'; label: string }
  | { type: 'action'; action: CommandAction; index: number };

const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  query,
  onQueryChange,
  actions,
  onClose
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const needle = String(query || '').trim().toLowerCase();
    if (!needle) return actions;
    return actions.filter((action) => {
      const haystack = [action.label, action.group, action.hint, action.shortcut].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [actions, query]);

  const rows = useMemo(() => {
    const next: CommandRow[] = [];
    let lastGroup = '';
    filtered.forEach((action, index) => {
      const group = action.group || 'Actions';
      if (group !== lastGroup) {
        next.push({ type: 'group', label: group });
        lastGroup = group;
      }
      next.push({ type: 'action', action, index });
    });
    return next;
  }, [filtered]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [isOpen, query]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (filtered.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(filtered.length - 1, prev + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const action = filtered[activeIndex];
        if (action) {
          action.onSelect();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeIndex, filtered, isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="mt-24 w-[620px] max-w-[92vw] rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
          <Search size={16} className="text-emerald-300" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500 focus:outline-none"
          />
          <span className="text-[10px] text-gray-500">Esc</span>
        </div>
        <div className="max-h-[420px] overflow-y-auto custom-scrollbar">
          {rows.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-500">No commands found.</div>
          ) : (
            rows.map((row, idx) => {
              if (row.type === 'group') {
                return (
                  <div key={`group-${row.label}-${idx}`} className="px-4 pt-3 pb-2 text-[10px] uppercase tracking-wider text-gray-500">
                    {row.label}
                  </div>
                );
              }
              const isActive = row.index === activeIndex;
              return (
                <button
                  key={row.action.id}
                  type="button"
                  onClick={() => {
                    row.action.onSelect();
                    onClose();
                  }}
                  className={`w-full px-4 py-2 text-left flex items-center justify-between text-sm transition ${
                    isActive ? 'bg-emerald-500/15 text-emerald-100' : 'text-gray-200 hover:bg-white/5'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{row.action.label}</span>
                    {row.action.hint && <span className="text-[10px] text-gray-500">{row.action.hint}</span>}
                  </div>
                  {row.action.shortcut && (
                    <span className="text-[10px] text-gray-500">{row.action.shortcut}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
      <button type="button" className="absolute inset-0 w-full h-full" onClick={onClose} />
    </div>
  );
};

export default CommandPalette;
