/**
 * Search-indexing rules for generated sites. Pure (no imports) so it can be
 * unit tested with plain Node.
 *
 * A site is indexable only when BOTH are true:
 *   - the platform allows indexing at all (NEXT_PUBLIC_ALLOW_SEARCH_INDEXING kill switch), and
 *   - the site was explicitly switched on in the dashboard (searchIndexable === true).
 * Everything else — new sites, demo businesses, unknown slugs — is noindex.
 */

export type IndexableFlag = { searchIndexable?: boolean | null } | null | undefined;

export function isSiteIndexable(site: IndexableFlag, platformAllowsIndexing: boolean): boolean {
  return platformAllowsIndexing && site?.searchIndexable === true;
}

export function robotsDirective(indexable: boolean): 'index, follow' | 'noindex, nofollow' {
  return indexable ? 'index, follow' : 'noindex, nofollow';
}

/** Top-level path segments that are not site slugs. */
const RESERVED_SEGMENTS = new Set([
  '',
  'api',
  'design-preview',
  '_next',
  'robots.txt',
  'sitemap.xml',
  'favicon.ico',
  'icon.svg',
  'apple-icon.png',
]);

/** The site slug a request path belongs to, or null for platform paths. */
export function slugFromPathname(pathname: string): string | null {
  const first = pathname.split('/')[1] ?? '';
  const segment = decodeURIComponent(first).toLowerCase();
  return RESERVED_SEGMENTS.has(segment) ? null : segment;
}

/**
 * X-Robots-Tag for a request path. Site paths are indexable only when the slug
 * is in the indexable set; design previews never are; other platform paths
 * follow the platform switch.
 */
export function robotsHeaderForPath(
  pathname: string,
  indexableSlugs: ReadonlySet<string> | null,
  platformAllowsIndexing: boolean,
): 'index, follow' | 'noindex, nofollow' {
  if (!platformAllowsIndexing) return 'noindex, nofollow';
  if (pathname.startsWith('/design-preview')) return 'noindex, nofollow';
  const slug = slugFromPathname(pathname);
  if (slug === null) return 'index, follow';
  // Unknown or unavailable list → fail closed.
  return indexableSlugs?.has(slug) ? 'index, follow' : 'noindex, nofollow';
}
