import type { MetadataRoute } from 'next';
import { getAllActiveSites } from '@/src/lib/api';
import { buildSiteSitemapEntries } from '@/src/lib/sitemap';

/** Platform sitemap — every active site URL for crawlers and SEO tools. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sites = await getAllActiveSites();

  const batches = await Promise.all(sites.map((site) => buildSiteSitemapEntries(site)));
  return batches.flat();
}
