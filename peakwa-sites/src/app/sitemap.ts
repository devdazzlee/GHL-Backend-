import type { MetadataRoute } from 'next';
import { getAllActiveSites } from '@/src/lib/api';
import { siteIsIndexable } from '@/src/lib/seo';
import { buildSiteSitemapEntries } from '@/src/lib/sitemap';

/**
 * Rendered per request, not at build time: this route walks every active site,
 * so prerendering it made each deploy depend on the API answering during the
 * build. The fetches underneath stay cached, so crawlers still get a fast reply.
 */
export const dynamic = 'force-dynamic';

/** Platform sitemap — only sites switched to indexable in the dashboard. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sites = (await getAllActiveSites()).filter((site) => siteIsIndexable(site));

  const batches = await Promise.all(sites.map((site) => buildSiteSitemapEntries(site)));
  return batches.flat();
}
