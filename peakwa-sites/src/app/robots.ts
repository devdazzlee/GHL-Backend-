import type { MetadataRoute } from 'next';
import { IS_SEARCH_INDEXABLE, SITE_BASE_URL } from '@/src/config';
import { rootSitemapUrl } from '@/src/lib/sitemap';

export default function robots(): MetadataRoute.Robots {
  const base = SITE_BASE_URL.replace(/\/$/, '');
  const sitemap = rootSitemapUrl();

  if (!IS_SEARCH_INDEXABLE) {
    return {
      rules: { userAgent: '*', disallow: '/' },
      sitemap,
      host: base,
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/design-preview/', '/design-preview/*', '/api/', '/api/*'],
    },
    sitemap,
    host: base,
  };
}
