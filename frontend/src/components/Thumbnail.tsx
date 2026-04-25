import React from 'react';

interface ThumbnailProps {
  path: string;
  size?: number;
}

export default function Thumbnail({ path, size = 48 }: ThumbnailProps) {
  const parts = path.split(/[\\/]/);
  const filename = parts[parts.length - 1] || path;
  const ext = filename.split('.').pop()?.toUpperCase() ?? '';
  const src = path.startsWith('file://') ? path : `file://${path}`;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <img
        src={src}
        alt=""
        className="w-full h-full rounded-full object-cover border border-mc-dust/40"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <span className="absolute -bottom-0.5 -right-0.5 bg-mc-ink text-mc-canvas text-[9px] font-bold px-1 py-0.5 rounded-pill">
        {ext}
      </span>
    </div>
  );
}
