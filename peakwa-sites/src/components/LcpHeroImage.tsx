import Image from 'next/image';
import { heroImageSrc } from '@/src/lib/images';

type LcpHeroImageProps = {
  src: string;
  alt: string;
};

/** Server-rendered hero image so LCP is discoverable immediately (priority + no client lazy-load). */
export function LcpHeroImage({ src, alt }: LcpHeroImageProps) {
  return (
    <Image
      src={heroImageSrc(src)}
      alt={alt}
      fill
      priority
      fetchPriority="high"
      sizes="100vw"
      className="object-cover"
      referrerPolicy="no-referrer"
    />
  );
}
