import React from 'react';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  onClick,
  disabled = false,
  className = '',
  children,
}: ButtonProps) {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-5 py-2 text-sm',
    lg: 'px-7 py-3 text-base',
  };

  const variants = {
    primary: 'text-white font-medium',
    secondary: 'bg-[#1A1A1A] text-[#A0A0A0] border border-[#222222] hover:text-white hover:border-[#444444]',
    ghost: 'bg-transparent text-[#A0A0A0] hover:bg-[#1A1A1A] hover:text-white',
    danger: 'bg-transparent text-[#EF4444] border border-[#EF4444]/30 hover:bg-[#EF4444]/10',
  };

  const isPrimary = variant === 'primary';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-full transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] ${sizeClasses[size]} ${variants[variant]} ${className}`}
      style={isPrimary ? { backgroundColor: disabled ? '#222222' : 'var(--accent-primary)' } : undefined}
      onMouseEnter={(e) => { if (isPrimary && !disabled) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--accent-primary-hover)'; }}
      onMouseLeave={(e) => { if (isPrimary && !disabled) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--accent-primary)'; }}
    >
      {children}
    </button>
  );
}
