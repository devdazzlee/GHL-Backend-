import type { ServicesContent } from '@/src/lib/content';
import type { LocationPage } from '@/src/lib/types';

export type FooterLink = { label: string; href: string };

/** How many service / city links each footer column shows (the rest are on the site's pages). */
export const FOOTER_LINK_LIMIT = 8;

function slugifyService(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/** Service page links, in page order (same URLs as the navbar). */
export function footerServiceLinks(slug: string, servicesContent: ServicesContent): FooterLink[] {
  return (servicesContent.services ?? [])
    .map((s) => ({ label: String(s?.title ?? '').trim(), href: `/${slug}/services/${slugifyService(String(s?.title ?? ''))}` }))
    .filter((l) => l.label && !l.href.endsWith('/services/'));
}

/** City page links (same URLs as the navbar). */
export function footerAreaLinks(slug: string, locations: LocationPage[]): FooterLink[] {
  return (locations ?? [])
    .filter((l) => l?.slug && l?.city)
    .map((l) => ({ label: l.city, href: `/${slug}/${l.slug}` }));
}

