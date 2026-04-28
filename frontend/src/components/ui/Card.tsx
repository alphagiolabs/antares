import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'normal' | 'large';
}

export default function Card({ children, className = '', padding = 'normal' }: CardProps) {
  const pad = padding === 'none' ? '' : padding === 'large' ? 'p-6' : 'p-5';
  return (
    <div className={`bg-[#111111] rounded-2xl border border-[#1A1A1A] ${pad} ${className}`}>
      {children}
    </div>
  );
}
