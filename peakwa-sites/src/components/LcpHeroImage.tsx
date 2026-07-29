import { heroDesktopSrc, heroMobileSrc } from '@/src/lib/images';

type LcpHeroImageProps = {
  src: string;
  alt: string;
};

/**
 * Hero LCP: mobile-first `src` + responsive srcSet so Slow 4G never starts on a 1920px
 * fallback (Lighthouse uses the <img src> when picture fallback is desktop-sized).
 */
export function LcpHeroImage({ src, alt }: LcpHeroImageProps) {
  const mobile = heroMobileSrc(src);
  const desktop = heroDesktopSrc(src);

  return (
    <img
      src={mobile}
      srcSet={`${mobile} ${640}w, ${desktop} ${1280}w`}
      sizes="100vw"
      alt={alt}
      width={640}
      height={427}
      fetchPriority="high"
      decoding="async"
      referrerPolicy="no-referrer"
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}
