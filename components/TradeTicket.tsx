import React from 'react';
import { TrendingUp, TrendingDown, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { TradeProposal } from '../types';

interface TradeTicketProps {
  messageId: string;
  proposal: TradeProposal;
  onExecute: (messageId: string, proposal: TradeProposal) => void;
  onReject: (messageId: string, reason?: string) => void;
}

const TradeTicket: React.FC<TradeTicketProps> = ({ messageId, proposal, onExecute, onReject }) => {
  const isBuy = proposal.action === 'BUY';
  const colorClass = isBuy ? 'text-green-400' : 'text-red-400';
  const bgClass = isBuy ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30';
  const formatPrice = (value: any) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '--';
    const abs = Math.abs(num);
    const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
    return num.toFixed(decimals).replace(/\.?0+$/, '');
  };

  const handleExecute = () => {
    if (proposal.status !== 'PENDING') return;
    onExecute(messageId, proposal);
  };

  const handleReject = () => {
    if (proposal.status !== 'PENDING') return;
    onReject(messageId, 'Rejected by user');
  };

  if (proposal.status === 'SUBMITTING') {
    return (
      <div className="mt-3 mb-1 w-full max-w-sm rounded-xl border border-white/10 bg-white/5 overflow-hidden font-mono text-sm shadow-lg opacity-90">
        <div className="p-4 flex items-center justify-center gap-2 text-blue-300">
          <Loader2 size={18} className="animate-spin" />
          <span className="font-bold tracking-wider">SUBMITTING...</span>
        </div>
      </div>
    );
  }

  if (proposal.status === 'EXECUTED') {
      return (
        <div className={`mt-3 mb-1 w-full max-w-sm rounded-xl border border-white/10 bg-white/5 overflow-hidden font-mono text-sm shadow-lg opacity-75`}>
            <div className="p-4 flex items-center justify-center gap-2 text-green-400">
                <CheckCircle size={18} />
                <span className="font-bold tracking-wider">ORDER EXECUTED</span>
            </div>
        </div>
      );
  }

  if (proposal.status === 'REJECTED') {
    return (
      <div className="mt-3 mb-1 w-full max-w-sm rounded-xl border border-red-500/20 bg-red-900/10 overflow-hidden font-mono text-sm shadow-lg opacity-90">
        <div className="p-4 flex items-center justify-center gap-2 text-red-300">
          <AlertTriangle size={18} />
          <span className="font-bold tracking-wider">ORDER REJECTED</span>
        </div>
        {proposal.executionError && (
          <div className="px-4 pb-4 text-[11px] text-red-200/80">
            {proposal.executionError}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`mt-3 mb-1 w-full max-w-sm rounded-xl border ${bgClass} overflow-hidden font-mono text-sm shadow-lg animate-slideInRight`}>
      {/* Header */}
      <div className={`px-4 py-2 flex items-center justify-between border-b ${isBuy ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
        <div className="flex items-center gap-2">
           {isBuy ? <TrendingUp size={16} className="text-green-500" /> : <TrendingDown size={16} className="text-red-500" />}
           <span className={`font-bold tracking-wider ${colorClass}`}>{proposal.action} {proposal.symbol}</span>
           {proposal.fallbackLevels && (
             <span
               className="ml-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200"
               title={`Fallback levels (${proposal.fallbackLevels.model || 'model'}${proposal.fallbackLevels.rr ? `, RR ${proposal.fallbackLevels.rr}` : ''})\nEntry ${formatPrice(proposal.fallbackLevels.entryPrice)} | SL ${formatPrice(proposal.fallbackLevels.stopLoss)} | TP ${formatPrice(proposal.fallbackLevels.takeProfit)}`}
             >
               FALLBACK
             </span>
           )}
        </div>
        <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">RR:</span>
            <span className="font-bold text-gray-300">1:{proposal.riskRewardRatio}</span>
        </div>
      </div>

      {/* Grid Data */}
      <div className="p-4 grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase text-gray-500">Entry</span>
            <span className="text-white font-semibold">{formatPrice(proposal.entryPrice)}</span>
        </div>
        <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase text-gray-500">Stop Loss</span>
            <span className="text-red-400 font-semibold">{formatPrice(proposal.stopLoss)}</span>
        </div>
        <div className="flex flex-col gap-1 col-span-2 border-t border-white/5 pt-2">
             <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase text-gray-500">Take Profit</span>
                <span className="text-green-400 font-semibold text-lg">{formatPrice(proposal.takeProfit)}</span>
             </div>
        </div>
      </div>

      {proposal.evidence && (
        <div className="px-4 pb-3 text-[10px] text-gray-400 border-t border-white/5 space-y-1">
          {(() => {
            const levels = proposal.evidence?.levels || null;
            const risk = proposal.evidence?.risk || null;
            const levelBits = [
              levels?.entry != null ? `entry ${formatPrice(levels.entry)}` : '',
              levels?.stopLoss != null ? `sl ${formatPrice(levels.stopLoss)}` : '',
              levels?.takeProfit != null ? `tp ${formatPrice(levels.takeProfit)}` : '',
              levels?.rr != null ? `rr ${levels.rr}` : ''
            ].filter(Boolean);
            const riskBits = [
              risk?.stopDistance != null ? `stop dist ${formatPrice(risk.stopDistance)}` : '',
              risk?.rewardDistance != null ? `reward dist ${formatPrice(risk.rewardDistance)}` : '',
              risk?.riskReward != null ? `rr ${risk.riskReward}` : ''
            ].filter(Boolean);
            return (
              <>
                {levelBits.length > 0 && <div>Levels: {levelBits.join(' | ')}</div>}
                {riskBits.length > 0 && <div>Risk: {riskBits.join(' | ')}</div>}
              </>
            );
          })()}
          {proposal.evidence.bias && <div>Bias: {proposal.evidence.bias}</div>}
          {proposal.evidence.setup && <div>Setup: {proposal.evidence.setup}</div>}
          {proposal.evidence.invalidation && <div>Invalidation: {proposal.evidence.invalidation}</div>}
          {proposal.evidence.confidence?.score != null && (
            <div>Confidence: {Math.round(Number(proposal.evidence.confidence.score) * 100)}%</div>
          )}
        </div>
      )}

       {/* Action Buttons */}
       <div className="flex border-t border-white/10">
         <button 
             onClick={handleExecute}
             className="flex-1 py-2.5 bg-white/5 hover:bg-green-500/20 text-gray-400 hover:text-green-400 transition-colors flex items-center justify-center gap-2 text-xs font-medium border-r border-white/10"
         >
             <CheckCircle size={14} />
             EXECUTE
         </button>
         <button
           onClick={handleReject}
           className="flex-1 py-2.5 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors flex items-center justify-center gap-2 text-xs font-medium"
         >
             <XCircle size={14} />
             REJECT
         </button>
       </div>
    </div>
  );
};

export default TradeTicket;
