import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(({ className = '', ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={`bg-[#1A1A1A] text-white border border-[#222222] rounded-lg px-3 py-2 text-sm outline-none transition-all duration-200 placeholder:text-[#555555] focus:border-[#5E6AD2] focus:shadow-[0_0_0_3px_rgba(94,106,210,0.15)] ${className}`}
      {...props}
    />
  );
});

Input.displayName = 'Input';
export default Input;
