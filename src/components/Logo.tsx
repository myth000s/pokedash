import { useId } from 'react';

/** The pokedash mark: a card with a moon shadow. Decorative; the wordmark next to it carries the name. */
export function Logo({ size = 32 }: { size?: number }) {
  const gradient = `logo-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7b3fe4" />
          <stop offset=".6" stopColor="#c13ccf" />
          <stop offset="1" stopColor="#ff5fa2" />
        </linearGradient>
      </defs>
      <rect x="22" y="10" width="56" height="80" rx="8" fill="#140f2a" stroke={`url(#${gradient})`} strokeWidth="6" />
      <circle cx="48" cy="50" r="20" fill={`url(#${gradient})`} />
      <circle cx="57" cy="43" r="17" fill="#140f2a" />
    </svg>
  );
}
