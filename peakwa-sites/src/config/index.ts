/**
 * Single source of truth for peakwa-sites runtime config.
 * Read process.env only here; import from '@/src/config' everywhere else.
 *
 * Vercel / Railway overrides (optional):
 *   NEXT_PUBLIC_SITE_BASE_URL
 *   NEXT_PUBLIC_API_URL
 *   NEXT_PUBLIC_ALLOW_SEARCH_INDEXING=true|false
 *     unset + production URL → indexable
 *     unset + localhost + `next dev` → indexable (SEO parity while developing)
 *     unset + localhost + `next start` → not indexable
 *   REVALIDATE_SECRET (optional override)
 */
import {
  LOCAL_API_URL,
  LOCAL_REVALIDATE_SECRET,
  LOCAL_SITE_BASE_URL,
  PRODUCTION_API_URL,
  PRODUCTION_REVALIDATE_SECRET,
  PRODUCTION_SITE_BASE_URL,
} from './defaults';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

function isLocalHostUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return url.includes('localhost') || url.includes('127.0.0.1');
  }
}

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const envSiteBase = process.env.NEXT_PUBLIC_SITE_BASE_URL?.trim();
const envApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const envIndexing = process.env.NEXT_PUBLIC_ALLOW_SEARCH_INDEXING?.trim();
const envRevalidateSecret = process.env.REVALIDATE_SECRET?.trim();

export const SITE_BASE_URL = stripTrailingSlash(
  envSiteBase || (IS_PRODUCTION ? PRODUCTION_SITE_BASE_URL : LOCAL_SITE_BASE_URL),
);

export const API_URL = stripTrailingSlash(
  envApiUrl || (IS_PRODUCTION ? PRODUCTION_API_URL : LOCAL_API_URL),
);

export const REVALIDATE_SECRET =
  envRevalidateSecret ||
  (IS_PRODUCTION ? PRODUCTION_REVALIDATE_SECRET : LOCAL_REVALIDATE_SECRET);

export const IS_SEARCH_INDEXABLE =
  envIndexing === 'true'
    ? true
    : envIndexing === 'false'
      ? false
      : !isLocalHostUrl(SITE_BASE_URL) || process.env.NODE_ENV === 'development';

/** Named config object for consumers that prefer a single import. */
export const appConfig = {
  siteBaseUrl: SITE_BASE_URL,
  apiUrl: API_URL,
  revalidateSecret: REVALIDATE_SECRET,
  isProduction: IS_PRODUCTION,
  isSearchIndexable: IS_SEARCH_INDEXABLE,
} as const;
