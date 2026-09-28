import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { API_URL, IS_SEARCH_INDEXABLE } from '@/src/config';
import { robotsHeaderForPath } from '@/src/lib/indexing';
import { buildRedirectMap, redirectTarget, type RedirectMap } from '@/src/lib/redirects';

/** How long the indexable-site list is reused before refetching. */
const INDEXABLE_TTL_MS = 5 * 60 * 1000;

let indexableCache: { slugs: Set<string>; fetchedAt: number } | null = null;

/**
 * Slugs switched to indexable in the dashboard. Any failure returns the last
 * good list, or null — which makes every site path noindex (fail closed).
 */
async function getIndexableSlugs(): Promise<Set<string> | null> {
  if (!IS_SEARCH_INDEXABLE) return null;
  if (indexableCache && Date.now() - indexableCache.fetchedAt < INDEXABLE_TTL_MS) {
    return indexableCache.slugs;
  }
  try {
    const key = process.env.SITE_RENDERER_API_KEY?.trim();
    const res = await fetch(`${API_URL}/phase4/indexable-sites`, {
      headers: key ? { 'x-site-api-key': key } : {},
      cache: 'no-store',
    });
    if (!res.ok) return indexableCache?.slugs ?? null;
    const data = await res.json();
    const slugs: string[] = Array.isArray(data?.data?.slugs) ? data.data.slugs : [];
    indexableCache = { slugs: new Set(slugs.map((s) => s.toLowerCase())), fetchedAt: Date.now() };
    return indexableCache.slugs;
  } catch {
    return indexableCache?.slugs ?? null;
  }
}

/** Old site addresses change rarely; a new one takes effect within a minute. */
const REDIRECTS_TTL_MS = 60 * 1000;

let redirectCache: { map: RedirectMap; fetchedAt: number } | null = null;

/** Old slug -> current slug. Any failure keeps the last good list (or none). */
async function getRedirectMap(): Promise<RedirectMap> {
  if (redirectCache && Date.now() - redirectCache.fetchedAt < REDIRECTS_TTL_MS) return redirectCache.map;
  try {
    const key = process.env.SITE_RENDERER_API_KEY?.trim();
    const res = await fetch(`${API_URL}/phase4/site-redirects`, {
      headers: key ? { 'x-site-api-key': key } : {},
      cache: 'no-store',
    });
    if (!res.ok) return redirectCache?.map ?? new Map();
    const data = await res.json();
    redirectCache = { map: buildRedirectMap(Array.isArray(data?.data?.redirects) ? data.data.redirects : []), fetchedAt: Date.now() };
    return redirectCache.map;
  } catch {
    return redirectCache?.map ?? new Map();
  }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // A site whose address changed: every old URL moves permanently to the same page.
  const target = redirectTarget(pathname, request.nextUrl.search, await getRedirectMap());
  if (target) return NextResponse.redirect(new URL(target, request.url), 301);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const slugs = await getIndexableSlugs();
  response.headers.set('X-Robots-Tag', robotsHeaderForPath(pathname, slugs, IS_SEARCH_INDEXABLE));
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|robots.txt|sitemap.xml|api/).*)',
  ],
};
