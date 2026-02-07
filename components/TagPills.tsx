import React from 'react';

type TagPillsProps = {
  tags: Array<string | null | undefined>;
  className?: string;
  max?: number;
};

const TagPills: React.FC<TagPillsProps> = ({ tags, className, max = 6 }) => {
  const cleaned = Array.from(
    new Set(
      tags
        .map((tag) => String(tag || '').trim())
        .filter(Boolean)
    )
  ).slice(0, Math.max(1, Math.floor(max)));

  if (cleaned.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className || ''}`}>
      {cleaned.map((tag) => (
        <span key={tag} className="px-2 py-0.5 rounded-full border border-white/10 text-[10px] text-gray-400">
          {tag}
        </span>
      ))}
    </div>
  );
};

export default TagPills;
