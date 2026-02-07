import React from 'react';
import { X, CheckCircle, AlertTriangle, Bell } from 'lucide-react';
import { Notification } from '../types';

interface ToastContainerProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ notifications, onDismiss }) => {
  return (
    <div className="absolute top-20 right-8 z-[60] flex flex-col gap-3 pointer-events-none">
      {notifications.map(n => (
        <div 
          key={n.id}
          className="pointer-events-auto w-80 bg-[#121212]/90 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl overflow-hidden animate-slideInRight flex flex-col"
        >
          <div className="flex items-start p-3 gap-3">
             <div className="mt-0.5">
                {n.type === 'success' && <CheckCircle size={18} className="text-green-400" />}
                {n.type === 'warning' && <AlertTriangle size={18} className="text-yellow-400" />}
                {n.type === 'error' && <AlertTriangle size={18} className="text-red-400" />}
                {n.type === 'info' && <Bell size={18} className="text-blue-400" />}
             </div>
             <div className="flex-1">
                <h4 className="text-sm font-semibold text-gray-100">{n.title}</h4>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">{n.message}</p>
                <span className="text-[10px] text-gray-600 mt-2 block">{n.timestamp.toLocaleTimeString()}</span>
             </div>
             <button 
                onClick={() => onDismiss(n.id)}
                className="text-gray-500 hover:text-white transition-colors"
             >
                <X size={14} />
             </button>
          </div>
          {/* Progress bar animation for auto-dismiss could go here */}
          <div className={`h-0.5 w-full ${
             n.type === 'success' ? 'bg-green-500' :
             n.type === 'warning' ? 'bg-yellow-500' :
             n.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
          } opacity-50`}></div>
        </div>
      ))}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slideInRight {
          animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
};

export default ToastContainer;
