import { heroDesktopSrc, heroMobileSrc } from '@/src/lib/images';

type LcpHeroImageProps = {
  src: string;
  alt: string;
};

/**
 * Mobile never uses srcSet — high-DPR phones were picking 1280w (~164 KiB) plus 640w.
 * Desktop is served only via <source media="(min-width: 769px)">.
 */
export function LcpHeroImage({ src, alt }: LcpHeroImageProps) {
  const mobile = heroMobileSrc(src);
  const desktop = heroDesktopSrc(src);

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
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover"
      />
    </picture>
  );
}
