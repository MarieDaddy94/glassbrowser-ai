import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, User, Sparkles } from 'lucide-react';
import { Agent } from '../types';
import { normalizeAgentCapabilities } from '../services/agentCapabilities';

interface AgentConfigModalProps {
  agent: Agent;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedAgent: Agent) => void;
  onDelete: (id: string) => void;
}

const COLORS = [
  'bg-blue-600', 'bg-purple-600', 'bg-green-600', 'bg-orange-600', 
  'bg-pink-600', 'bg-teal-600', 'bg-cyan-600', 'bg-rose-600',
  'bg-indigo-600', 'bg-red-600', 'bg-yellow-600', 'bg-gray-600'
];

const AgentConfigModal: React.FC<AgentConfigModalProps> = ({ agent, isOpen, onClose, onSave, onDelete }) => {
  const [name, setName] = useState(agent.name);
  const [instruction, setInstruction] = useState(agent.systemInstruction || '');
  const [selectedColor, setSelectedColor] = useState(agent.color);
  const [capabilities, setCapabilities] = useState(() => normalizeAgentCapabilities(agent.capabilities));

  useEffect(() => {
    if (isOpen) {
      setName(agent.name);
      setInstruction(agent.systemInstruction || '');
      setSelectedColor(agent.color);
      setCapabilities(normalizeAgentCapabilities(agent.capabilities));
    }
  }, [agent, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      ...agent,
      name,
      systemInstruction: instruction,
      color: selectedColor,
      capabilities
    });
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-[380px] bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-scaleIn">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-2 text-gray-200">
             <User size={16} />
             <span className="font-semibold text-sm">Agent Studio</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
            
            {/* Name Input */}
            <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Nickname</label>
                <div className="relative">
                    <input 
                        type="text" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors"
                        placeholder="e.g. Coder, Designer..."
                    />
                </div>
            </div>

            {/* Instruction Input */}
            <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                    <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Role & Context</label>
                    <Sparkles size={12} className="text-yellow-500/50" />
                </div>
                <textarea 
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    className="w-full h-24 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-blue-500/50 transition-colors resize-none leading-relaxed"
                    placeholder="Describe how this agent should behave. E.g., 'You are a strict code reviewer who loves Rust.'"
                />
            </div>

            {/* Color Picker */}
            <div className="space-y-2">
                <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Identity Color</label>
                <div className="flex flex-wrap gap-2">
                    {COLORS.map(color => (
                        <button
                            key={color}
                            onClick={() => setSelectedColor(color)}
                            className={`w-6 h-6 rounded-full ${color} transition-all ring-2 ring-offset-2 ring-offset-[#1a1a1a] ${selectedColor === color ? 'ring-white scale-110' : 'ring-transparent hover:scale-105'}`}
                        />
                    ))}
                </div>
            </div>

            {/* Capability Scopes */}
            <div className="space-y-2">
                <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Capability Scope</label>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-300">
                    <label className="flex items-center gap-2 bg-black/20 border border-white/10 rounded-lg px-2 py-2">
                        <input
                            type="checkbox"
                            checked={capabilities.trade}
                            onChange={(e) => setCapabilities(prev => ({ ...prev, trade: e.target.checked }))}
                            className="accent-emerald-500"
                        />
                        Trade Proposals
                    </label>
                    <label className="flex items-center gap-2 bg-black/20 border border-white/10 rounded-lg px-2 py-2">
                        <input
                            type="checkbox"
                            checked={capabilities.autoExecute}
                            onChange={(e) => setCapabilities(prev => ({ ...prev, autoExecute: e.target.checked }))}
                            className="accent-emerald-500"
                        />
                        Auto-Execute
                    </label>
                    <label className="flex items-center gap-2 bg-black/20 border border-white/10 rounded-lg px-2 py-2">
                        <input
                            type="checkbox"
                            checked={capabilities.broker}
                            onChange={(e) => setCapabilities(prev => ({ ...prev, broker: e.target.checked }))}
                            className="accent-emerald-500"
                        />
                        Broker Actions
                    </label>
                    <label className="flex items-center gap-2 bg-black/20 border border-white/10 rounded-lg px-2 py-2">
                        <input
                            type="checkbox"
                            checked={capabilities.tools}
                            onChange={(e) => setCapabilities(prev => ({ ...prev, tools: e.target.checked }))}
                            className="accent-emerald-500"
                        />
                        Tool Calls
                    </label>
                </div>
                <div className="text-[10px] text-gray-500">
                    Auto-execute applies only when AutoPilot is enabled and trade proposals are allowed.
                </div>
            </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-white/5 flex justify-between items-center">
            <button 
                onClick={() => { onDelete(agent.id); onClose(); }}
                className="text-red-400 hover:text-red-300 p-2 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Delete Agent"
            >
                <Trash2 size={16} />
            </button>
            <div className="flex gap-2">
                <button 
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                    Cancel
                </button>
                <button 
                    onClick={handleSave}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2"
                >
                    <Save size={14} />
                    Save Agent
                </button>
            </div>
        </div>

      </div>
      <style>{`
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes scaleIn {
            from { transform: scale(0.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        .animate-scaleIn { animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </div>
  );
};

export default AgentConfigModal;
