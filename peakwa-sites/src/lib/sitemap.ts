import type { MetadataRoute } from 'next';
import { SITE_BASE_URL } from '@/src/config';
import { getLocationPages } from '@/src/lib/api';
import { parseJson, type BlogContent, type ServicesContent } from '@/src/lib/content';
import type { GeneratedSite } from '@/src/lib/types';

function slugifyService(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function siteLastModified(site: GeneratedSite): Date {
  const raw = (site as { updatedAt?: string }).updatedAt;
  return raw ? new Date(raw) : new Date();
}

/** All public URLs for one generated site — shared by per-site and root sitemaps. */
export async function buildSiteSitemapEntries(site: GeneratedSite): Promise<MetadataRoute.Sitemap> {
  const baseUrl = `${SITE_BASE_URL.replace(/\/$/, '')}/${site.slug}`;
  const lastModified = siteLastModified(site);

  const entries: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/about`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/services`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/blog`, lastModified, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/contact`, lastModified, changeFrequency: 'yearly', priority: 0.6 },
  ];

  const services = parseJson<ServicesContent>(site.servicesContent, {});
  for (const service of services.services ?? []) {
    const serviceSlug = slugifyService(service.title || '');
    if (!serviceSlug) continue;
    entries.push({
      url: `${baseUrl}/services/${serviceSlug}`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.75,
    });
  }

  const blog = parseJson<BlogContent>(site.blogContent, {});
  (blog.posts ?? []).forEach((_, index) => {
    entries.push({
      url: `${baseUrl}/blog/${index}`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.65,
    });
  });

  const locations = await getLocationPages(site.slug);
  for (const location of locations) {
    entries.push({
      url: `${baseUrl}/${location.slug}`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.85,
    });
  }

  return entries;
}

export function rootSitemapUrl(): string {
  return `${SITE_BASE_URL.replace(/\/$/, '')}/sitemap.xml`;
}
