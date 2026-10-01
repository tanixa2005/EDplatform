import React from 'react';

interface EdLogoProps {
  size?: number;
  className?: string;
  showWordmark?: boolean;
  wordmarkClassName?: string;
}

export function EdLogo({
  size = 24,
  className = '',
  showWordmark = false,
  wordmarkClassName = ''
}: EdLogoProps) {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform group-hover:scale-105"
        aria-label="EDplatform Logo"
      >
        {/* Platform vertical foundation pillar */}
        <rect
          x="3.5"
          y="4"
          width="4.5"
          height="24"
          rx="1.25"
          className="fill-foreground"
        />
        {/* Ascending learning tiers forming an architectural progressive 'E' */}
        {/* Tier 1: Foundation */}
        <rect
          x="11"
          y="23.5"
          width="8"
          height="4.5"
          rx="1.25"
          className="fill-foreground"
        />
        {/* Tier 2: Practice & Application */}
        <rect
          x="11"
          y="13.75"
          width="12"
          height="4.5"
          rx="1.25"
          className="fill-foreground"
        />
        {/* Tier 3: Mastery & Progress - In Signature Confident Deep Red */}
        <rect
          x="11"
          y="4"
          width="17"
          height="4.5"
          rx="1.25"
          fill="#E53935"
        />
      </svg>
      {showWordmark && (
        <span className={`text-lg font-black tracking-tight text-foreground select-none ${wordmarkClassName}`}>
          ED<span className="font-semibold text-foreground/80">platform</span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary ml-0.5 mb-1" />
        </span>
      )}
    </div>
  );
}
