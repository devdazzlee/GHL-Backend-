import Image from 'next/image';
import { heroMobileSrc } from '@/src/lib/images';

type LcpHeroImageProps = {
  /** Raw hero URL from the site API (Pexels). */
  src: string;
  alt: string;
};

/**
 * LCP hero: Next.js Image `priority` injects a matching `<link rel=preload>` in `<head>`
 * and serves AVIF/WebP from the edge — no dynamic `/api` hop.
 */
export function LcpHeroImage({ src, alt }: LcpHeroImageProps) {
  const pexels = heroMobileSrc(src);

  return (
    <Image
      src={pexels}
      alt={alt}
      fill
      priority
      fetchPriority="high"
      sizes="(max-width: 768px) 100vw, 1280px"
      quality={68}
      className="object-cover object-center"
    />
  );
}
