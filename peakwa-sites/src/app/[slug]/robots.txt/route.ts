import { IS_SEARCH_INDEXABLE, SITE_BASE_URL } from '@/src/config';

type RouteParams = { params: Promise<{ slug: string }> };

/**
 * Per-site robots.txt as an explicit route handler.
 * Nested robots.ts was shadowed by [locationSlug] (404 for robots.txt).
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const base = SITE_BASE_URL.replace(/\/$/, '');
  const sitemap = `${base}/${slug}/sitemap.xml`;

  if (!IS_SEARCH_INDEXABLE) {
    const body = [
      'User-Agent: *',
      'Disallow: /',
      `Host: ${base}`,
      `Sitemap: ${sitemap}`,
      '',
    ].join('\n');
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const body = [
    'User-Agent: *',
    'Allow: /',
    'Disallow: /design-preview/',
    'Disallow: /design-preview/*',
    `Host: ${base}`,
    `Sitemap: ${sitemap}`,
    '',
  ].join('\n');

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
