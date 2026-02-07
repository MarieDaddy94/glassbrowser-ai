import React from 'react';

type VirtualItemProps = {
  children: React.ReactNode;
  className?: string;
  minHeight?: number;
};

const VirtualItem: React.FC<VirtualItemProps> = ({ children, className, minHeight = 180 }) => {
  return (
    <div
      className={className}
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: `${Math.max(1, Math.floor(minHeight))}px`
      }}
    >
      {children}
    </div>
  );
};

export default VirtualItem;
