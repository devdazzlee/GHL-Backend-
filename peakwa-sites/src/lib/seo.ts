import type { Metadata } from 'next';
import { IS_SEARCH_INDEXABLE, SITE_BASE_URL } from '@/src/config';
import { isSiteIndexable, robotsDirective } from '@/src/lib/indexing';
import { siteOriginFor, siteUrlFor } from '@/src/lib/siteLinks';
import type { GeneratedSite } from '@/src/lib/types';

/** HTTP X-Robots-Tag value — must stay in sync with getSiteRobots(). */
export function robotsHeaderValue(indexable: boolean): string {
  return robotsDirective(indexable);
}

/** True when this site may be indexed (platform switch AND per-site switch). */
export function siteIsIndexable(site: GeneratedSite | null | undefined): boolean {
  return isSiteIndexable(site, IS_SEARCH_INDEXABLE);
}

/** Robots metadata for a site's pages — noindex unless the site is switched on. */
export function getSiteRobots(site: GeneratedSite | null | undefined): NonNullable<Metadata['robots']> {
  if (!siteIsIndexable(site)) {
    return { index: false, follow: false };
  }

  return {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  };
}

/** Builds an absolute canonical URL for a site page path segments. */
export function buildCanonicalUrl(...pathParts: string[]): string {
  const base = SITE_BASE_URL.replace(/\/$/, '');
  const path = pathParts.filter(Boolean).join('/');
  return path ? `${base}/${path}` : base;
}

export function getMetadataBase(): URL {
  return new URL(`${SITE_BASE_URL.replace(/\/$/, '')}/`);
}

/** Metadata base for one site: its own domain once that is live. */
export function getSiteMetadataBase(site: GeneratedSite): URL {
  return new URL(`${siteOriginFor(site)}/`);
}

/** Canonical URL of a site page; pathParts start with the site slug, as the pages pass them. */
export function buildSiteCanonicalUrl(site: GeneratedSite, pathParts: string[]): string {
  const rest = pathParts[0] === site.slug ? pathParts.slice(1) : pathParts;
  const path = rest.filter(Boolean).join('/');
  return siteUrlFor(site, path ? `/${path}` : '');
}

/** Keywords derived from canonical site business data — not hand-written per page. */
export function buildSiteKeywords(site: GeneratedSite): string[] {
  const industry = site.industry.trim();
  const city = site.city.trim();
  const state = site.state.trim();

  return [
    site.businessName.trim(),
    industry,
    city,
    state,
    `${industry} ${city}`,
    `${industry} ${state}`,
    `${site.businessName.trim()} ${city}`,
  ].filter((value, index, list) => value.length > 0 && list.indexOf(value) === index);
}

type BuildPageMetadataInput = {
  site: GeneratedSite;
  title: string;
  description: string;
  pathParts: string[];
  openGraphType?: 'website' | 'article';
};

/**
 * Single metadata builder for all site pages — canonical, robots, Open Graph,
 * publisher, and authorship from one place.
 */
export function buildPageMetadata({
  site,
  title,
  description,
  pathParts,
  openGraphType = 'website',
}: BuildPageMetadataInput): Metadata {
  const canonical = buildSiteCanonicalUrl(site, pathParts);
  const keywords = buildSiteKeywords(site);

  return {
    title,
    description,
    alternates: { canonical },
    robots: getSiteRobots(site),
    keywords,
    authors: [{ name: site.businessName }],
    creator: site.businessName,
    publisher: site.businessName,
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: site.businessName,
      locale: 'en_US',
      type: openGraphType,
    },
    other: {
      publisher: site.businessName,
      keywords: keywords.join(', '),
    },
  };
}
