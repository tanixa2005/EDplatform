import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'brand';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'border-transparent bg-[#111111] text-white font-medium',
    secondary: 'border-border bg-secondary text-foreground font-medium',
    destructive: 'bg-brand-50 text-brand-700 border-brand-200 font-medium',
    outline: 'text-foreground border-border bg-card/60',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-medium',
    warning: 'bg-cream text-amber-900 border-amber-300 font-medium',
    info: 'bg-sky-50 text-sky-800 border-sky-200 font-medium',
    brand: 'bg-brand-50 text-brand-700 border-brand-200/80 font-semibold'
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
