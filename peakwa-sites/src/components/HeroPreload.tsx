import { heroDesktopSrc, heroMobileSrc } from '@/src/lib/images';

type HeroPreloadProps = {
  src: string;
};

/** Preload must match LcpHeroImage URLs byte-for-byte. */
export function HeroPreload({ src }: HeroPreloadProps) {
  if (!src.includes('pexels.com')) return null;

  const mobile = heroMobileSrc(src);
  const desktop = heroDesktopSrc(src);

  return (
    <>
      <link
        rel="preload"
        as="image"
        href={mobile}
        media="(max-width: 768px)"
        fetchPriority="high"
      />
      <link
        rel="preload"
        as="image"
        href={desktop}
        media="(min-width: 769px)"
        fetchPriority="high"
      />
    </>
  );
}
