'use client';

import { useState } from 'react';

/** 5:7 card picture. Falls back to a lettered placeholder when there is no picture or it fails to load. */
export function CardImage({ src, alt, className = '' }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const box = `holo-tilt aspect-[5/7] w-full rounded-lg ${className}`;
  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`${box} flex items-center justify-center bg-gradient-to-br from-holo-cyan/30 via-holo-purple/30 to-holo-pink/30 font-display text-5xl text-white/70`}
      >
        {alt.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <div className={box}>
      {/* Plain img on purpose: pictures are CardTrader links and are not routed through next/image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className="block h-full w-full object-cover" />
    </div>
  );
}
