import { cache } from 'react';
import { API_URL, IS_SEARCH_INDEXABLE } from '@/src/config/config';
import { ALL_SITES_CACHE_TAG, siteCacheTag } from '@/src/lib/siteCache';
import type { GeneratedSite, LocationPage } from './types';

type FetchCacheOptions = {
  revalidate: number;
  tags: string[];
};

function fetchInit(cache: FetchCacheOptions): RequestInit {
  if (!IS_SEARCH_INDEXABLE) {
    return { cache: 'no-store' };
  }

  return { next: cache };
}

const MAX_FETCH_ATTEMPTS = 3;

/**
 * The build prerenders every active site, so one dropped connection to the API
 * host would otherwise abort a prerender and fail the whole deploy. Retry
 * transient network errors, and resolve to null rather than throwing so callers
 * degrade the same way they already do for a non-ok response.
 */
async function fetchApi(url: string, init: RequestInit): Promise<Response | null> {
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (attempt === MAX_FETCH_ATTEMPTS) {
        console.warn(
          JSON.stringify({
            event: 'api_fetch_failed',
            url,
            attempts: attempt,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
  return null;
}

export const getSiteBySlug = cache(async (slug: string): Promise<GeneratedSite | null> => {
  const res = await fetchApi(
    `${API_URL}/phase4/sites/${encodeURIComponent(slug)}`,
    fetchInit({ revalidate: 3600, tags: [ALL_SITES_CACHE_TAG, siteCacheTag(slug)] }),
  );
  if (!res || !res.ok) return null;
  const data = await res.json();
  const site = (data.data?.site as GeneratedSite | undefined) || null;
  // Public storefront only serves ACTIVE sites; INACTIVE/PENDING must not open.
  if (!site || site.status !== 'ACTIVE') return null;
  return site;
});

/** Loads every ACTIVE site for the platform sitemap (paginated API). */
export async function getAllActiveSites(): Promise<GeneratedSite[]> {
  const sites: GeneratedSite[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const res = await fetchApi(
      `${API_URL}/phase4/sites?status=ACTIVE&limit=100&page=${page}`,
      fetchInit({ revalidate: 3600, tags: [ALL_SITES_CACHE_TAG] }),
    );
    if (!res || !res.ok) break;

    const data = await res.json();
    const batch: GeneratedSite[] = data.data?.sites ?? [];
    sites.push(...batch);

    totalPages = Number(data.data?.pagination?.totalPages ?? 1);
    page += 1;
  }

  return sites;
}

export async function getAllSites(): Promise<GeneratedSite[]> {
  return getAllActiveSites();
}

export async function getLocationPages(slug: string): Promise<LocationPage[]> {
  try {
    const res = await fetchApi(
      `${API_URL}/phase4/sites/${encodeURIComponent(slug)}/location-pages`,
      fetchInit({
        revalidate: 3600,
        tags: [siteCacheTag(slug), `${siteCacheTag(slug)}-locations`],
      }),
    );
    if (!res || !res.ok) return [];
    const data = await res.json();
    return data.data?.pages || [];
  } catch {
    return [];
  }
}

export async function getServicePageContent(slug: string, serviceSlug: string) {
  const res = await fetchApi(
    `${API_URL}/phase4/sites/${encodeURIComponent(slug)}/services/${encodeURIComponent(serviceSlug)}`,
    fetchInit({
      revalidate: 86400,
      tags: [siteCacheTag(slug), `${siteCacheTag(slug)}-service-${serviceSlug}`],
    }),
  );
  if (!res || !res.ok) return null;
  const data = await res.json();
  return data.data?.content || null;
}
