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
  const date = raw ? new Date(raw) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
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

  try {
    const locations = await getLocationPages(site.slug);
    for (const location of locations) {
      if (!location?.slug) continue;
      entries.push({
        url: `${baseUrl}/${location.slug}`,
        lastModified,
        changeFrequency: 'monthly',
        priority: 0.85,
      });
    }
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'sitemap_locations_skipped',
        slug: site.slug,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  return entries;
}

export function rootSitemapUrl(): string {
  return `${SITE_BASE_URL.replace(/\/$/, '')}/sitemap.xml`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Serialize sitemap entries to XML for the per-site route handler. */
export function entriesToXml(entries: MetadataRoute.Sitemap): string {
  const urls = entries
    .map((entry) => {
      const lastmod =
        entry.lastModified instanceof Date
          ? entry.lastModified.toISOString()
          : entry.lastModified
            ? new Date(entry.lastModified).toISOString()
            : new Date().toISOString();
      const changefreq = entry.changeFrequency
        ? `\n    <changefreq>${entry.changeFrequency}</changefreq>`
        : '';
      const priority =
        typeof entry.priority === 'number' ? `\n    <priority>${entry.priority}</priority>` : '';
      return `  <url>\n    <loc>${escapeXml(entry.url)}</loc>\n    <lastmod>${lastmod}</lastmod>${changefreq}${priority}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
