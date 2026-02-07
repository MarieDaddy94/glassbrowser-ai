import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, Search, Lock, Star, Settings, Sidebar, Eye, EyeOff, Maximize2, Minimize2, X, Pin, Tag } from 'lucide-react';
import { Tab } from '../types';
import { coerceUrlString } from '../services/url';

interface BrowserChromeProps {
  currentTab: Tab;
  tabs: Tab[]; // New prop
  onNavigate: (url: string) => void;
  onRefresh: () => void;
  onBack: () => void;
  onForward: () => void;
  toggleChat: () => void;
  isChatOpen: boolean;
  onToggleWatch: (id: string) => void; // New prop
  onSwitchTab: (id: string) => void; // New prop
  onAddTab: () => void;
  onCloseTab: (id: string) => void;
  onTogglePin: (id: string) => void;
  onSetLabel: (id: string, label: string) => void;
  onOpenSettings: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const BrowserChrome: React.FC<BrowserChromeProps> = ({ 
  currentTab, 
  tabs,
  onNavigate, 
  onRefresh, 
  onBack,
  onForward,
  toggleChat,
  isChatOpen,
  onToggleWatch,
  onSwitchTab,
  onAddTab,
  onCloseTab,
  onTogglePin,
  onSetLabel,
  onOpenSettings,
  isFullscreen,
  onToggleFullscreen
}) => {
  const safeUrl = coerceUrlString(currentTab.url);
  const [urlInput, setUrlInput] = useState(safeUrl);

  useEffect(() => {
    setUrlInput(safeUrl);
  }, [safeUrl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let target = coerceUrlString(urlInput);
    if (!target.startsWith('http')) {
      target = `https://${target}`;
    }
    onNavigate(target);
  };

  return (
    <div className="w-full bg-[#1e1e1e]/90 backdrop-blur-md border-b border-white/10 text-gray-200 select-none">
      {/* Tab Bar (Simulated) */}
      <div className="flex items-center px-2 pt-2 gap-2 h-10 overflow-x-auto custom-scrollbar">
        <div className="flex items-center gap-2 px-2 flex-shrink-0">
           <div className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors shadow-inner" />
           <div className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors shadow-inner" />
           <div className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-colors shadow-inner" />
        </div>
        
        {/* Tab List */}
        {tabs.map(tab => (
            <div 
                key={tab.id}
                onClick={() => onSwitchTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg max-w-[200px] text-sm shadow-lg relative group cursor-pointer transition-colors ${
                    tab.id === currentTab.id 
                    ? 'bg-[#2d2d2d] text-gray-100' 
                    : 'text-gray-400 hover:bg-white/5'
                }`}
            >
                <div className="w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] text-blue-400">
                    {tab.title.charAt(0)}
                </div>
                <span className="truncate max-w-[100px]">{tab.title}</span>

                {tab.aiLabel && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300 font-mono">
                        {tab.aiLabel}
                    </span>
                )}
                
                {/* Watch Indicator */}
                {tab.isWatched && (
                    <Eye size={10} className={tab.watchSource === 'auto' ? "text-blue-400 animate-pulse" : "text-red-400 animate-pulse"} />
                )}

                {tab.id === currentTab.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full"></div>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onTogglePin(tab.id);
                  }}
                  className={`ml-1 p-0.5 rounded hover:bg-white/10 transition-opacity flex-shrink-0 ${
                    tab.aiPinned ? 'text-yellow-300 opacity-100' : 'text-gray-500 opacity-0 group-hover:opacity-100'
                  }`}
                  title={tab.aiPinned ? 'Unpin from AI context' : 'Pin tab for AI context'}
                >
                  <Pin size={12} />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const current = tab.aiLabel ? String(tab.aiLabel) : '';
                    const next = window.prompt('Set AI label for this tab (e.g., 15m, 30m, H1)', current);
                    if (next == null) return;
                    onSetLabel(tab.id, next);
                  }}
                  className="p-0.5 rounded text-gray-500 hover:text-gray-200 hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  title="Set AI label"
                >
                  <Tag size={12} />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  className="ml-1 p-0.5 rounded text-gray-500 hover:text-gray-200 hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  title="Close tab"
                >
                  <X size={12} />
                </button>
            </div>
        ))}
        
        <button 
          onClick={onAddTab}
          className="p-1 hover:bg-white/10 rounded-md text-gray-400 flex-shrink-0"
          title="New Tab"
        >
           <span className="text-lg leading-none">+</span>
        </button>
      </div>

      {/* Navigation Bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#252525] h-12 shadow-md">
        <div className="flex gap-1">
          <button 
            onClick={onBack}
            disabled={!currentTab.canGoBack}
            className="p-1.5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors disabled:opacity-30"
          >
            <ArrowLeft size={18} />
          </button>
          <button 
            onClick={onForward}
            disabled={!currentTab.canGoForward}
            className="p-1.5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors disabled:opacity-30"
          >
            <ArrowRight size={18} />
          </button>
          <button 
            onClick={onRefresh}
            className={`p-1.5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors ${currentTab.isLoading ? 'animate-spin' : ''}`}
          >
            <RotateCw size={18} />
          </button>
        </div>

        {/* Address Bar */}
        <form onSubmit={handleSubmit} className="flex-1 flex items-center">
          <div className="w-full relative flex items-center group">
             <div className="absolute left-3 text-gray-500 group-focus-within:text-blue-400 transition-colors">
                {safeUrl.startsWith('https') ? <Lock size={14} /> : <Search size={14} />}
             </div>
             <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#333] hover:border-[#444] focus:border-blue-500/50 rounded-full py-1.5 pl-9 pr-20 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner"
                placeholder="Search or enter website name"
             />
             <div className="absolute right-2 flex gap-1 items-center">
               
               {/* Watchdog Toggle */}
                <button 
                     type="button" 
                     onClick={() => onToggleWatch(currentTab.id)}
                     className={`p-1 rounded-full transition-all ${
                         currentTab.isWatched 
                         ? 'text-red-400 bg-red-900/20 hover:bg-red-900/40' 
                         : 'text-gray-500 hover:text-gray-300 hover:bg-white/10'
                     }`}
                     title={currentTab.isWatched ? (currentTab.watchSource === 'auto' ? "Auto-watching TradingView tab (click to override)" : "Agents are watching this tab") : "Let Agents watch this tab"}
                >
                  {currentTab.isWatched ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>

               <button type="button" className="p-1 text-gray-500 hover:text-yellow-400 transition-colors">
                 <Star size={14} />
               </button>
             </div>
          </div>
        </form>

        <div className="flex gap-2">
            {/* Extensions Placeholder */}
            <div className="w-px h-6 bg-gray-700 mx-1"></div>

            <button
                type="button"
                onClick={onToggleFullscreen}
                className="p-1.5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
                title={isFullscreen ? 'Exit Full Screen (F11 / Esc)' : 'Enter Full Screen (F11)'}
            >
                {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            
            <button 
                onClick={toggleChat}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${isChatOpen ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
                <Sidebar size={16} />
                <span>Side Panel</span>
            </button>
            
            <button 
                onClick={onOpenSettings}
                className="p-1.5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors" 
                title="Settings"
            >
                <Settings size={18} />
            </button>
        </div>
      </div>
    </div>
  );
};

const MemoBrowserChrome = React.memo(BrowserChrome);
MemoBrowserChrome.displayName = 'BrowserChrome';

export default MemoBrowserChrome;
