import type { MetadataRoute } from 'next';
import { getSiteBySlug } from '@/src/lib/api';
import { buildSiteSitemapEntries } from '@/src/lib/sitemap';

type SitemapProps = {
  params: Promise<{ slug: string }>;
};

export default async function sitemap({ params }: SitemapProps): Promise<MetadataRoute.Sitemap> {
  const { slug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) return [];

  return buildSiteSitemapEntries(site);
}
