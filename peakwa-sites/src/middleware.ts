import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { API_URL, IS_SEARCH_INDEXABLE } from '@/src/config';
import { robotsHeaderForPath } from '@/src/lib/indexing';
import { buildRedirectMap, redirectTarget, type RedirectMap } from '@/src/lib/redirects';
import { fetchDomainMap } from '@/src/lib/domainMap';
import { buildDomainMap, normalizeHost, routeRequest, type DomainMap } from '@/src/lib/domainRouting';

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

/** Custom domains change rarely; a new or verified one takes effect within a minute. */
const DOMAINS_TTL_MS = 60 * 1000;

let domainCache: { map: DomainMap; fetchedAt: number } | null = null;

/** Every active site's custom domain. Any failure keeps the last good list (or none). */
async function getDomainMap(): Promise<DomainMap> {
  if (domainCache && Date.now() - domainCache.fetchedAt < DOMAINS_TTL_MS) return domainCache.map;
  const map = await fetchDomainMap();
  if (!map) return domainCache?.map ?? buildDomainMap([]);
  domainCache = { map, fetchedAt: Date.now() };
  return map;
}

/** The platform's own root robots.txt and sitemap.xml (a custom domain gets its site's). */
const PLATFORM_ROOT_FILES = new Set(['/robots.txt', '/sitemap.xml']);

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = normalizeHost(request.headers.get('host'));
  const domains = await getDomainMap();

  const route = routeRequest(host, pathname, search, domains);
  if (route?.kind === 'redirect') {
    // A path on the same host: keep the visitor on https://{their domain}.
    const location = route.location.startsWith('/') ? `https://${host}${route.location}` : route.location;
    return NextResponse.redirect(location, 301);
  }

  if (!route) {
    if (PLATFORM_ROOT_FILES.has(pathname)) return NextResponse.next();

    // A site whose address changed: every old URL moves permanently to the same page
    // (straight to the site's own domain when that is live).
    const target = redirectTarget(pathname, search, await getRedirectMap());
    if (target) {
      const onward = routeRequest(host, new URL(target, request.url).pathname, search, domains);
      return NextResponse.redirect(onward?.kind === 'redirect' ? onward.location : new URL(target, request.url), 301);
    }
  }

  // The path the page is rendered from: /{slug}/... on a custom domain too.
  const sitePath = route?.kind === 'rewrite' ? route.path : pathname;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', sitePath);

  const response =
    route?.kind === 'rewrite'
      ? NextResponse.rewrite(new URL(`${route.path}${search}`, request.url), { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } });

  const slugs = await getIndexableSlugs();
  response.headers.set('X-Robots-Tag', robotsHeaderForPath(sitePath, slugs, IS_SEARCH_INDEXABLE));
  return response;
}

export const config = {
  // robots.txt and sitemap.xml pass through here: on a custom domain they are the site's own.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|api/).*)'],
};
