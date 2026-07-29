import { HERO_DESKTOP_WIDTH, HERO_MOBILE_WIDTH } from '@/src/lib/images';

/** Same-origin LCP image (edge-cached proxy). Preload must match this URL exactly. */
export function lcpHeroUrl(slug: string, width: number = HERO_MOBILE_WIDTH): string {
  const w = width >= HERO_DESKTOP_WIDTH ? HERO_DESKTOP_WIDTH : HERO_MOBILE_WIDTH;
  return `/api/lcp-hero/${encodeURIComponent(slug)}?w=${w}`;
}
