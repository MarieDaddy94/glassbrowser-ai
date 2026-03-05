import React from 'react';

export interface AppShellProps {
  isFullscreen: boolean;
  overlaySlot?: React.ReactNode;
  chromeSlot?: React.ReactNode;
  mainSlot?: React.ReactNode;
  children?: React.ReactNode;
}

const AppShell: React.FC<AppShellProps> = ({ isFullscreen, overlaySlot, chromeSlot, mainSlot, children }) => {
  const resolvedMain = mainSlot ?? children;
  return (
    <div
      className={
        isFullscreen
          ? 'flex items-stretch justify-stretch h-screen w-full p-0 relative'
          : 'flex items-center justify-center min-h-screen w-full p-4 sm:p-8 md:p-12 relative'
      }
    >
      {overlaySlot}
      {chromeSlot}
      {resolvedMain}
    </div>
  );
};

export default AppShell;
