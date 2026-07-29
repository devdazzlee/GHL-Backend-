import { pexelsImageSrc } from '@/src/lib/images';

type LcpHeroImageProps = {
  src: string;
  alt: string;
};

/**
 * Hero LCP element: responsive Pexels URLs in HTML (no client lazy-load, no
 * /_next/image round-trip) so Slow 4G can start the download from the first document.
 */
export function LcpHeroImage({ src, alt }: LcpHeroImageProps) {
  const mobile = pexelsImageSrc(src, 750);
  const desktop = pexelsImageSrc(src, 1920);

  return (
    <picture className="absolute inset-0 block h-full w-full">
      <source media="(max-width: 768px)" srcSet={mobile} />
      <img
        src={desktop}
        alt={alt}
        width={1920}
        height={1080}
        fetchPriority="high"
        decoding="async"
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover"
        sizes="100vw"
      />
    </picture>
  );
}
