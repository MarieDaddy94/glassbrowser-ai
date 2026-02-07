import React, { ReactNode } from 'react';

interface WindowFrameProps {
  children: ReactNode;
  variant?: 'framed' | 'full';
}

const WindowFrame: React.FC<WindowFrameProps> = ({ children, variant = 'framed' }) => {
  const className =
    variant === 'full'
      ? 'relative w-full h-full bg-[#121212] flex flex-col overflow-hidden'
      : 'relative w-full max-w-[1400px] h-[85vh] bg-[#121212] rounded-xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.7)] border border-white/10 flex flex-col overflow-hidden ring-1 ring-white/5';
  return (
    <div className={className}>
      {children}
    </div>
  );
};

export default WindowFrame;
