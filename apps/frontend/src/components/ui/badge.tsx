import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'brand';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'border-transparent bg-solid text-solid-foreground font-medium',
    secondary: 'border-border bg-secondary text-foreground font-medium',
    destructive: 'bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-200 dark:border-brand-500/30 font-medium',
    outline: 'text-foreground border-border bg-card/60',
    success: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30 font-medium',
    warning: 'bg-cream text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-500/40 font-medium',
    info: 'bg-sky-50 dark:bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-500/30 font-medium',
    brand: 'bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-200/80 dark:border-brand-500/30 font-semibold'
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
