import React from 'react';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

export default function Button({
  variant = 'primary',
  onClick,
  disabled = false,
  className = '',
  children,
}: ButtonProps) {
  const base = 'inline-flex items-center gap-2 px-4 py-2 rounded-btn text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:translate-y-[1px]';
  const variants = {
    primary: 'text-white shadow-md hover:shadow-glow',
    secondary: 'bg-dark-elevated text-txt-secondary border border-bdr-medium hover:border-bdr-active hover:text-txt-primary',
    ghost: 'bg-transparent text-txt-secondary hover:bg-dark-elevated hover:text-txt-primary',
  };

  const primaryStyle = variant === 'primary'
    ? { background: 'linear-gradient(135deg, #FF6B2C, #FF8F5E)' }
    : {};

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${className}`}
      style={primaryStyle}
    >
      {children}
    </button>
  );
}
