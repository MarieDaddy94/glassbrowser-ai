import React, { ReactNode } from 'react';
import { X, MessageSquare, FileText, Activity, Lock, Trophy, BarChart2, Target, Database, Layers, ListChecks, History, Signal, Camera, Calendar, BookOpen, FingerprintPattern, Cpu, Eye, Monitor, Bot } from 'lucide-react';
import { SidebarMode } from '../types';

interface SidebarFrameProps {
  isVisible: boolean;
  onClose: () => void;
  activeMode: SidebarMode;
  onSwitchMode: (mode: SidebarMode) => void;
  onPrefetchMode?: (mode: SidebarMode) => void;
  children: ReactNode;
}

const SidebarFrame: React.FC<SidebarFrameProps> = ({ 
  isVisible, 
  onClose, 
  activeMode, 
  onSwitchMode,
  onPrefetchMode,
  children 
}) => {
  if (!isVisible) return null;

  const prefetch = (mode: SidebarMode) => {
    try { onPrefetchMode?.(mode); } catch { /* ignore */ }
  };

  const isChatMode = activeMode === 'chat' || activeMode === 'chartchat';
  const widthClass = isChatMode ? 'w-[420px]' : 'w-[100vw] max-w-[100vw]';

  return (
    <div className={`absolute top-0 right-0 h-full ${widthClass} flex flex-col border-l border-white/5 shadow-[-10px_0_40px_rgba(0,0,0,0.6)] z-50 transition-all duration-300 animate-slideInRight backdrop-blur-2xl bg-[#050505]/60 text-gray-100`}>
      
      {/* Sidebar Header with Tabs */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/5 backdrop-blur-md">
        
        {/* Feature Switcher Tabs */}
        <div className="flex bg-black/40 rounded-lg p-1 gap-1 overflow-x-auto custom-scrollbar border border-white/5">
            <button 
                onClick={() => onSwitchMode('chat')}
                onMouseEnter={() => prefetch('chat')}
                onFocus={() => prefetch('chat')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'chat' 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <MessageSquare size={14} />
                <span>Chat</span>
            </button>
            <button 
                onClick={() => onSwitchMode('chartchat')}
                onMouseEnter={() => prefetch('chartchat')}
                onFocus={() => prefetch('chartchat')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'chartchat'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <BarChart2 size={14} />
                <span>Chart Chat</span>
            </button>
            <button 
                onClick={() => onSwitchMode('signal')}
                onMouseEnter={() => prefetch('signal')}
                onFocus={() => prefetch('signal')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'signal'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <Signal size={14} />
                <span>Signal</span>
            </button>
            <button 
                onClick={() => onSwitchMode('snapshot')}
                onMouseEnter={() => prefetch('snapshot')}
                onFocus={() => prefetch('snapshot')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'snapshot'
                    ? 'bg-lime-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <Camera size={14} />
                <span>Snapshot</span>
            </button>
            <button 
                onClick={() => onSwitchMode('calendar')}
                onMouseEnter={() => prefetch('calendar')}
                onFocus={() => prefetch('calendar')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'calendar'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <Calendar size={14} />
                <span>Calendar</span>
            </button>
            <button 
                onClick={() => onSwitchMode('patterns')}
                onMouseEnter={() => prefetch('patterns')}
                onFocus={() => prefetch('patterns')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'patterns'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <FingerprintPattern size={14} />
                <span>Patterns</span>
            </button>
            <button 
                onClick={() => onSwitchMode('shadow')}
                onMouseEnter={() => prefetch('shadow')}
                onFocus={() => prefetch('shadow')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'shadow'
                    ? 'bg-slate-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <Eye size={14} />
                <span>Shadow</span>
            </button>
            <button 
                onClick={() => onSwitchMode('notes')}
                onMouseEnter={() => prefetch('notes')}
                onFocus={() => prefetch('notes')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'notes' 
                    ? 'bg-yellow-600 text-white shadow-sm' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <FileText size={14} />
                <span>Notes</span>
            </button>
            <button 
                onClick={() => onSwitchMode('leaderboard')}
                onMouseEnter={() => prefetch('leaderboard')}
                onFocus={() => prefetch('leaderboard')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'leaderboard' 
                    ? 'bg-orange-600 text-white shadow-sm' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <Trophy size={14} />
                <span>Rank</span>
            </button>
            <button 
                onClick={() => onSwitchMode('academy')}
                onMouseEnter={() => prefetch('academy')}
                onFocus={() => prefetch('academy')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'academy' 
                    ? 'bg-emerald-700 text-white shadow-sm' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <BookOpen size={14} />
                <span>Academy</span>
            </button>
            <button 
                onClick={() => onSwitchMode('dashboard')}
                onMouseEnter={() => prefetch('dashboard')}
                onFocus={() => prefetch('dashboard')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'dashboard' 
                    ? 'bg-indigo-600 text-white shadow-sm' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <BarChart2 size={14} />
                <span>Dash</span>
            </button>
            <button
                onClick={() => onSwitchMode('monitor')}
                onMouseEnter={() => prefetch('monitor')}
                onFocus={() => prefetch('monitor')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'monitor'
                    ? 'bg-cyan-700 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <Monitor size={14} />
                <span>Monitor</span>
            </button>
            <button 
                onClick={() => onSwitchMode('mt5')}
                onMouseEnter={() => prefetch('mt5')}
                onFocus={() => prefetch('mt5')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'mt5' 
                    ? 'bg-green-600 text-white shadow-sm' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <Activity size={14} />
                <span>MT5</span>
            </button>
            <button 
                onClick={() => onSwitchMode('tradelocker')}
                onMouseEnter={() => prefetch('tradelocker')}
                onFocus={() => prefetch('tradelocker')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'tradelocker' 
                    ? 'bg-purple-600 text-white shadow-sm' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <Lock size={14} />
                <span>Locker</span>
            </button>
            <button 
                onClick={() => onSwitchMode('nativechart')}
                onMouseEnter={() => prefetch('nativechart')}
                onFocus={() => prefetch('nativechart')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'nativechart'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <BarChart2 size={14} />
                <span>Chart</span>
            </button>
            <button 
                onClick={() => onSwitchMode('backtester')}
                onMouseEnter={() => prefetch('backtester')}
                onFocus={() => prefetch('backtester')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'backtester'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <Target size={14} />
                <span>Backtest</span>
            </button>
            <button 
                onClick={() => onSwitchMode('setups')}
                onMouseEnter={() => prefetch('setups')}
                onFocus={() => prefetch('setups')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'setups'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <Layers size={14} />
                <span>Setups</span>
            </button>
            <button
                onClick={() => onSwitchMode('agentcreator')}
                onMouseEnter={() => prefetch('agentcreator')}
                onFocus={() => prefetch('agentcreator')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'agentcreator'
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <Bot size={14} />
                <span>Agent</span>
            </button>
            <button 
                onClick={() => onSwitchMode('agentmemory')}
                onMouseEnter={() => prefetch('agentmemory')}
                onFocus={() => prefetch('agentmemory')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'agentmemory'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <Database size={14} />
                <span>Memory</span>
            </button>
            <button
                onClick={() => onSwitchMode('agentlab')}
                onMouseEnter={() => prefetch('agentlab')}
                onFocus={() => prefetch('agentlab')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'agentlab'
                    ? 'bg-fuchsia-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <Cpu size={14} />
                <span>Lab</span>
            </button>
            <button
                onClick={() => onSwitchMode('audit')}
                onMouseEnter={() => prefetch('audit')}
                onFocus={() => prefetch('audit')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'audit'
                    ? 'bg-slate-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <ListChecks size={14} />
                <span>Audit</span>
            </button>
            <button
                onClick={() => onSwitchMode('changes')}
                onMouseEnter={() => prefetch('changes')}
                onFocus={() => prefetch('changes')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeMode === 'changes'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
                <History size={14} />
                <span>Changes</span>
            </button>
        </div>

        <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors flex-shrink-0" title="Close Sidebar">
            <X size={18} />
        </button>
      </div>

      {/* Content Container */}
      <div className="flex-1 overflow-hidden flex flex-col relative min-h-0">
        {children}
      </div>
    </div>
  );
};

export default SidebarFrame;
