import Link from 'next/link';
import { headers } from 'next/headers';
import { getSiteBySlug } from '@/src/lib/api';
import { slugFromPathname } from '@/src/lib/indexing';
import { sitePath } from '@/src/lib/siteUrls';
import type { GeneratedSite } from '@/src/lib/types';

/**
 * A page that doesn't exist inside a site that does (an unknown site is handled by the
 * root not-found page, because this segment's own layout can't render it). Shown inside
 * the site's navbar and footer, with a link back to the site's home.
 */
export default async function SitePageNotFound() {
  const path = (await headers()).get('x-pathname') ?? '';
  const slug = slugFromPathname(path);
  let site: GeneratedSite | null = null;
  if (slug) site = await getSiteBySlug(slug).catch(() => null);
  const accent = site?.accentColor || '#6366F1';

  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-white px-6 py-20 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: accent }}>
        404
      </p>
      <h1 className="mt-2 text-4xl font-black tracking-tight text-gray-900 md:text-5xl">Page not found</h1>
      <p className="mt-4 max-w-md text-lg text-gray-600">
        {site
          ? `This page doesn't exist on ${site.businessName}'s website. It may have been renamed or removed.`
          : 'This page does not exist or may have been moved.'}
      </p>
      <Link
        href={site ? sitePath(site) : '/'}
        className="mt-8 inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-90"
        style={{ backgroundColor: accent }}
      >
        {site ? `Go to ${site.businessName} home` : 'Go home'}
      </Link>
    </section>
  );
}
