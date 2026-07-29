import { API_URL } from '@/src/config/config';

/** Mobile LCP width (Moto-class ~412px viewport × DPR ≈ 640–750). */
export const HERO_MOBILE_WIDTH = 640;
export const HERO_DESKTOP_WIDTH = 1280;

export function pexelsImageSrc(src: string, width: number, height?: number): string {
  if (!src.includes('pexels.com')) return src;
  try {
    const url = new URL(src);
    url.searchParams.set('auto', 'compress');
    url.searchParams.set('cs', 'tinysrgb');
    url.searchParams.set('w', String(Math.min(Math.max(width, 320), 2400)));
    if (height) url.searchParams.set('h', String(height));
    url.searchParams.set('fit', 'crop');
    return url.toString();
  } catch {
    return src;
  }
}

export function heroMobileSrc(src: string): string {
  return pexelsImageSrc(src, HERO_MOBILE_WIDTH, 427);
}

export function heroDesktopSrc(src: string): string {
  return pexelsImageSrc(src, HERO_DESKTOP_WIDTH, 720);
}

export function heroImageSrc(src: string): string {
  return heroDesktopSrc(src);
}

/** Rough max width from a `sizes` attribute for remote URL tuning. */
export function widthHintFromSizes(sizes?: string): number {
  if (!sizes) return 800;
  if (sizes.includes('33vw')) return 640;
  if (sizes.includes('50vw')) return 800;
  if (sizes.includes('100vw')) return 1200;
  if (sizes.includes('90vw')) return 900;
  if (sizes.includes('45vw')) return 720;
  return 800;
}

export function contentImageSrc(src: string, sizes?: string): string {
  return pexelsImageSrc(src, widthHintFromSizes(sizes));
}

export type SiteImages = {
  hero: string | null;
  about: string | null;
  services: (string | null)[];
  blog: (string | null)[];
};

const emptyImages: SiteImages = {
  hero: null,
  about: null,
  services: [],
  blog: [],
};

export async function getSiteImages(slug: string): Promise<SiteImages> {
  try {
    const res = await fetch(`${API_URL}/phase4/sites/${encodeURIComponent(slug)}/images`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return emptyImages;
    const data = await res.json();
    const images = data.data?.images;
    if (!images) return emptyImages;
    return {
      hero: images.hero ?? null,
      about: images.about ?? null,
      services: Array.isArray(images.services) ? images.services : [],
      blog: Array.isArray(images.blog) ? images.blog : [],
    };
  } catch {
    return emptyImages;
  }
}
