import type { MetadataRoute } from 'next';
import { IS_SEARCH_INDEXABLE, SITE_BASE_URL } from '@/src/config';
import { getAllActiveSites } from '@/src/lib/api';
import { siteIsIndexable } from '@/src/lib/seo';
import { rootSitemapUrl } from '@/src/lib/sitemap';

export const dynamic = 'force-dynamic';

/**
 * Set ROBOTS_DISALLOW_NOINDEX_SITES=true to also list every non-indexable site
 * as Disallow here. Leave it off until Google has recrawled those sites and
 * seen their noindex: a robots.txt block stops crawling, so already-indexed
 * pages would never see the noindex and could stay in results.
 */
const DISALLOW_NOINDEX_SITES = process.env.ROBOTS_DISALLOW_NOINDEX_SITES?.trim() === 'true';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = SITE_BASE_URL.replace(/\/$/, '');
  const sitemap = rootSitemapUrl();

  if (!IS_SEARCH_INDEXABLE) {
    return {
      rules: { userAgent: '*', disallow: '/' },
      sitemap,
      host: base,
    };
  }

  const disallow = ['/design-preview/', '/design-preview/*', '/api/', '/api/*'];
  if (DISALLOW_NOINDEX_SITES) {
    const sites = await getAllActiveSites();
    for (const site of sites) {
      if (!siteIsIndexable(site)) disallow.push(`/${site.slug}/`, `/${site.slug}$`);
    }
  }

  return {
    rules: { userAgent: '*', allow: '/', disallow },
    sitemap,
    host: base,
  };
}
