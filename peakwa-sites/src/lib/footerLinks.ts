import type { ServicesContent } from '@/src/lib/content';
import type { LocationPage } from '@/src/lib/types';

export type FooterLink = { label: string; href: string };

/** "paws" or "/paws" -> "/paws"; "" (the site's own domain) stays "". */
function linkPrefix(base: string): string {
  return base === '' || base.startsWith('/') ? base : `/${base}`;
}

/** How many service / city links each footer column shows (the rest are on the site's pages). */
export const FOOTER_LINK_LIMIT = 8;

function slugifyService(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/** Service page links, in page order (same URLs as the navbar). */
export function footerServiceLinks(slug: string, servicesContent: ServicesContent): FooterLink[] {
  return (servicesContent.services ?? [])
    .map((s) => ({ label: String(s?.title ?? '').trim(), href: `${linkPrefix(slug)}/services/${slugifyService(String(s?.title ?? ''))}` }))
    .filter((l) => l.label && !l.href.endsWith('/services/'));
}

/** City page links (same URLs as the navbar). */
export function footerAreaLinks(slug: string, locations: LocationPage[]): FooterLink[] {
  return (locations ?? [])
    .filter((l) => l?.slug && l?.city)
    .map((l) => ({ label: l.city, href: `${linkPrefix(slug)}/${l.slug}` }));
}


function mixHex(hex: string, target: string, amount: number): string {
  const parse = (h: string) => {
    const v = h.replace('#', '');
    const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
    return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
  };
  const a = parse(hex);
  const b = parse(target);
  return `#${a
    .map((c, i) => Math.round(c + (b[i] - c) * amount).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/**
 * Footer link color: the site's accent color, lightened (dark footer) or
 * darkened (light footer) only as much as needed to be readable (WCAG AA 4.5:1)
 * on the footer background, so links look like links, not like the labels.
 */
export function footerLinkColor(
  accentHex: string,
  backgroundHex: string,
  contrastRatio: (fg: string, bg: string) => number,
  minRatio = 4.5,
): string {
  if (contrastRatio(accentHex, backgroundHex) >= minRatio) return accentHex;
  const towards = contrastRatio('#FFFFFF', backgroundHex) >= contrastRatio('#111827', backgroundHex) ? '#FFFFFF' : '#111827';
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mixHex(accentHex, towards, step * 0.05);
    if (contrastRatio(candidate, backgroundHex) >= minRatio) return candidate;
  }
  return towards;
}
