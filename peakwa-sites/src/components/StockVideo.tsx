'use client';

import { useEffect, useRef } from 'react';
import type { StockVideoData } from '@/src/lib/stockVideo';

/**
 * A short, silent, looping stock clip (the 551 HVAC home page video).
 * Only the poster image loads with the page; the video itself is fetched when it
 * scrolls near the screen. Visitors who ask for reduced motion get the poster with
 * play controls instead of autoplay. Without JavaScript the poster is shown.
 */
export function StockVideo({ video, label }: { video: StockVideoData; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const start = () => {
      if (el.getAttribute('src')) return;
      el.muted = true; // set as a property: React does not render the muted attribute on the server
      el.src = video.url;
      if (reduceMotion) {
        el.controls = true;
        return;
      }
      el.play().catch(() => {
        el.controls = true;
      });
    };

    if (!('IntersectionObserver' in window)) {
      start();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          start();
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [video.url]);

  return (
    <video
      ref={ref}
      className="block aspect-video w-full bg-gray-200 object-cover shadow-xl"
      style={{ borderRadius: 'var(--design-card-radius)' }}
      poster={video.poster}
      muted
      loop
      playsInline
      preload="none"
      aria-label={label}
      width={video.width}
      height={video.height}
    />
  );
}
