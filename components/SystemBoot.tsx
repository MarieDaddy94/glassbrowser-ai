import { useState, useEffect } from 'react';
import App from '../App';
import { Package, Play, Cpu, Zap, Terminal, HardDrive, Wifi, ShieldCheck, Power } from 'lucide-react';

// --- Installer Component ---
const Installer = ({ onComplete }: { onComplete: () => void }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Initializing package manager...");
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const steps = [
      { pct: 5, msg: "Initializing kernel..." },
      { pct: 15, msg: "Verifying secure boot signatures..." },
      { pct: 25, msg: "Mounting virtual file systems..." },
      { pct: 40, msg: "Downloading neural network weights (2.4GB)..." },
      { pct: 55, msg: "Configuring Gemini 3.0 Pro bridge..." },
      { pct: 70, msg: "Optimizing WebGL rendering context..." },
      { pct: 85, msg: "Registering AI agents: Technician, Macro, Risk..." },
      { pct: 95, msg: "Finalizing installation..." },
      { pct: 100, msg: "Installation complete." },
    ];

    let currentStep = 0;

    const interval = setInterval(() => {
      if (currentStep >= steps.length) {
        clearInterval(interval);
        setTimeout(onComplete, 800);
        return;
      }

      const step = steps[currentStep];
      setProgress(step.pct);
      setStatus(step.msg);
      setLogs(prev => [...prev, `> ${step.msg}`].slice(-6));
      currentStep++;
    }, 600); // Speed of install

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div className="flex items-center justify-center min-h-screen w-full font-mono bg-[#050505] text-gray-200 relative overflow-hidden selection:bg-blue-500/30">
      
      {/* Background Matrix-like effect */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #1a1a1a 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
      </div>

      <div className="w-[480px] bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-8 flex flex-col gap-6 relative z-10 animate-fadeIn">
        
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-white/5 pb-6">
          <div className="w-12 h-12 bg-blue-600/10 rounded-xl flex items-center justify-center border border-blue-500/20 shadow-[0_0_15px_rgba(37,99,235,0.2)]">
            <Package size={24} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-white font-bold text-xl tracking-tight">GlassBrowser AI Setup</h1>
            <p className="text-xs text-gray-500 mt-0.5">Installer Wizard v0.1.182</p>
          </div>
        </div>

        {/* Progress Section */}
        <div className="space-y-3">
          <div className="flex justify-between text-xs font-medium text-gray-400 uppercase tracking-wider">
            <span>{status}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full bg-[#1a1a1a] rounded-full overflow-hidden border border-white/5">
            <div 
              className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Terminal Output */}
        <div className="h-40 bg-black/60 rounded-lg border border-white/5 p-4 text-[11px] text-green-400/90 font-mono shadow-inner flex flex-col justify-end">
          {logs.map((log, i) => (
            <div key={i} className="truncate opacity-80">{log}</div>
          ))}
          <div className="animate-pulse mt-1">_</div>
        </div>

        <div className="flex justify-between items-center text-[10px] text-gray-600 pt-2">
            <span>Secure Installer</span>
            <span>Signed by Google GenAI</span>
        </div>
      </div>
      
      <style>{`
        @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.98); }
            to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeIn { animation: fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </div>
  );
};

// --- Launcher Component ---
const Launcher = ({ onLaunch }: { onLaunch: () => void }) => {
  const [isHovering, setIsHovering] = useState(false);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col min-h-screen w-full relative overflow-hidden font-sans text-gray-100 selection:bg-purple-500/30">
       
       {/* Wallpaper Overlay to darken the body background */}
       <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"></div>

       {/* Top Bar (OS Style) */}
       <div className="absolute top-0 w-full h-8 bg-black/40 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-4 z-20">
          <div className="flex items-center gap-4 text-xs font-medium">
             <span className="hover:text-white cursor-pointer transition-colors">Finder</span>
             <span className="hover:text-white cursor-pointer transition-colors">File</span>
             <span className="hover:text-white cursor-pointer transition-colors">View</span>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
             <span className="flex items-center gap-1.5"><Wifi size={12}/> WiFi</span>
             <span className="flex items-center gap-1.5"><Power size={12}/> 100%</span>
             <span>{time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          </div>
       </div>

       {/* Desktop Area */}
       <div className="flex-1 relative z-10 flex flex-col items-center justify-center p-8">
          
          {/* Desktop Icons */}
          <div className="absolute top-12 left-6 flex flex-col gap-8">
             <div className="group flex flex-col items-center gap-2 cursor-pointer w-20">
                <div className="w-14 h-14 bg-gray-800/40 rounded-xl border border-white/10 flex items-center justify-center backdrop-blur-sm group-hover:bg-white/10 transition-colors shadow-lg">
                    <HardDrive size={28} className="text-gray-300" />
                </div>
                <span className="text-[11px] font-medium text-white drop-shadow-md bg-black/20 px-2 py-0.5 rounded">Macintosh HD</span>
             </div>
             <div className="group flex flex-col items-center gap-2 cursor-pointer w-20">
                <div className="w-14 h-14 bg-gray-800/40 rounded-xl border border-white/10 flex items-center justify-center backdrop-blur-sm group-hover:bg-white/10 transition-colors shadow-lg">
                    <Terminal size={28} className="text-gray-300" />
                </div>
                <span className="text-[11px] font-medium text-white drop-shadow-md bg-black/20 px-2 py-0.5 rounded">Terminal</span>
             </div>
          </div>

          {/* Center Launcher Card */}
          <div className="scale-100 transition-all duration-500 hover:scale-[1.02]">
              <div className="bg-[#121212]/40 backdrop-blur-xl border border-white/10 p-10 rounded-[32px] shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex flex-col items-center gap-8 text-center max-w-sm mx-auto">
                
                <div 
                    className="relative cursor-pointer group"
                    onMouseEnter={() => setIsHovering(true)}
                    onMouseLeave={() => setIsHovering(false)}
                    onClick={onLaunch}
                >
                    <div className={`absolute inset-0 bg-blue-500 rounded-[28px] blur-xl opacity-40 group-hover:opacity-60 transition-opacity duration-500 ${isHovering ? 'scale-110' : 'scale-100'}`}></div>
                    <div className="w-32 h-32 bg-gradient-to-br from-[#1e1e1e] to-[#000] rounded-[28px] border border-white/10 flex items-center justify-center relative z-10 shadow-2xl group-hover:translate-y-[-5px] transition-transform duration-300">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-[28px]"></div>
                        <Zap size={56} className={`text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-transform duration-500 ${isHovering ? 'scale-110 text-blue-300' : ''}`} />
                    </div>
                </div>

                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight mb-2">GlassBrowser AI</h2>
                    <p className="text-sm text-gray-400">Secure Environment v0.1.182</p>
                </div>

                <button 
                    onClick={onLaunch}
                    className="group relative px-8 py-3 bg-white text-black font-bold rounded-full overflow-hidden transition-all hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:scale-105 active:scale-95 w-full"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-400 opacity-0 group-hover:opacity-10 transition-opacity"></div>
                    <span className="flex items-center justify-center gap-2">
                        <Play size={16} fill="currentColor" />
                        Launch
                    </span>
                </button>

              </div>
          </div>

       </div>

       {/* Dock (Simulated) */}
       <div className="absolute bottom-4 left-1/2 -translate-x-1/2 h-16 bg-white/10 backdrop-blur-2xl border border-white/10 rounded-2xl flex items-center px-4 gap-4 shadow-2xl z-20 hover:scale-105 transition-transform duration-300 origin-bottom">
            {[Cpu, ShieldCheck, Terminal, Zap].map((Icon, i) => (
                <div key={i} className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center hover:bg-white/20 hover:-translate-y-2 transition-all cursor-pointer">
                    <Icon size={20} className="text-white/80" />
                </div>
            ))}
       </div>

    </div>
  );
};

// --- Main System Boot Controller ---
export const SystemBoot = () => {
    // State to track boot phase
    const [bootPhase, setBootPhase] = useState<'install' | 'launcher' | 'running'>('install');

    // Effect to prevent scrolling during boot phases
    useEffect(() => {
        if (bootPhase !== 'running') {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }, [bootPhase]);

    if (bootPhase === 'running') {
        return <App />;
    }

    if (bootPhase === 'install') {
        return <Installer onComplete={() => setBootPhase('launcher')} />;
    }

    return <Launcher onLaunch={() => setBootPhase('running')} />;
};

export default SystemBoot;
