import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'red';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.99] select-none';

    const variants = {
      // Primary button is solid near-black: crisp, confident, student-first
      default:
        'bg-[#111111] text-white hover:bg-[#262626] shadow-xs',
      // Emphasized red call-to-action
      red:
        'bg-primary text-primary-foreground hover:bg-brand-600 shadow-xs',
      destructive:
        'bg-brand-700 text-white hover:bg-brand-800 shadow-xs',
      outline:
        'border border-border bg-card/60 text-foreground hover:bg-secondary hover:border-foreground/30',
      secondary:
        'bg-secondary text-foreground hover:bg-secondary/80 border border-border/70',
      ghost: 'hover:bg-muted text-foreground',
      link: 'text-primary underline-offset-4 hover:underline'
    };

    const sizes = {
      default: 'h-10 px-4 py-2 text-sm',
      sm: 'h-8 px-3 text-xs',
      lg: 'h-11 px-6 text-sm font-semibold',
      icon: 'h-9 w-9'
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
