import React from 'react';

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  label?: React.ReactNode;
}

export default function Slider({ value, min = 1, max = 100, onChange, label }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="w-full">
      {label && <div className="mb-2">{label}</div>}
      <div className="relative h-1 w-full rounded-full bg-[#222222]">
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: '#5E6AD2' }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <div
          className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-md pointer-events-none"
          style={{ left: `calc(${pct}% - 8px)` }}
        />
      </div>
    </div>
  );
}
