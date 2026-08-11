import { getSiteBySlug } from '@/src/lib/api';
import { buildSiteSitemapEntries, entriesToXml } from '@/src/lib/sitemap';

type RouteParams = { params: Promise<{ slug: string }> };

/**
 * Per-site sitemap as an explicit route handler.
 * Nested MetadataRoute sitemap.ts under [slug] was 500ing in production.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { slug } = await params;
    const site = await getSiteBySlug(slug);
    if (!site) {
      return new Response('Not found', { status: 404 });
    }

    const entries = await buildSiteSitemapEntries(site);
    return new Response(entriesToXml(entries), {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'site_sitemap_failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return new Response('Sitemap unavailable', { status: 500 });
  }
}
