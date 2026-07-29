import { pexelsImageSrc } from '@/src/lib/images';

type HeroPreloadProps = {
  src: string;
};

/** Early LCP discovery: preload the same URLs the hero <picture> will request. */
export function HeroPreload({ src }: HeroPreloadProps) {
  if (!src.includes('pexels.com')) return null;

  const mobile = pexelsImageSrc(src, 750);
  const desktop = pexelsImageSrc(src, 1920);

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
