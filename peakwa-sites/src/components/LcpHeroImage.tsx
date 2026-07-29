import { HERO_DESKTOP_WIDTH, HERO_MOBILE_WIDTH } from '@/src/lib/images';
import { lcpHeroUrl } from '@/src/lib/lcpHero';

type LcpHeroImageProps = {
  slug: string;
  alt: string;
};

/**
 * LCP hero via same-origin `/api/lcp-hero` so preload Link headers match and Vercel CDN caches bytes.
 */
export function LcpHeroImage({ slug, alt }: LcpHeroImageProps) {
  const mobile = lcpHeroUrl(slug, HERO_MOBILE_WIDTH);
  const desktop = lcpHeroUrl(slug, HERO_DESKTOP_WIDTH);

  return (
    <picture className="absolute inset-0 block h-full w-full">
      <source media="(min-width: 769px)" srcSet={desktop} />
      <img
        src={mobile}
        alt={alt}
        width={828}
        height={552}
        fetchPriority="high"
        decoding="async"
        className="h-full w-full object-cover"
      />
    </picture>
  );
}
