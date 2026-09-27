import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { REVALIDATE_SECRET } from '@/src/config';
import { ALL_SITES_CACHE_TAG, siteCacheTag } from '@/src/lib/siteCache';

type RevalidateBody = {
  slug?: string;
  secret?: string;
};

export async function POST(request: NextRequest) {
  let body: RevalidateBody = {};
  try {
    body = (await request.json()) as RevalidateBody;
  } catch {
    body = {};
  }

  const secret = body.secret?.trim() || request.nextUrl.searchParams.get('secret')?.trim();
  if (!REVALIDATE_SECRET) {
    return NextResponse.json({ success: false, error: 'Revalidation not configured.' }, { status: 503 });
  }
  if (secret !== REVALIDATE_SECRET) {
    return NextResponse.json({ success: false, error: 'Invalid secret.' }, { status: 401 });
  }

  const slug = body.slug?.trim() || request.nextUrl.searchParams.get('slug')?.trim();
  if (slug) {
    revalidateTag(siteCacheTag(slug), { expire: 0 });
  } else {
    revalidateTag(ALL_SITES_CACHE_TAG, { expire: 0 });
  }

  return NextResponse.json({
    success: true,
    revalidated: slug ? [siteCacheTag(slug)] : [ALL_SITES_CACHE_TAG],
    timestamp: new Date().toISOString(),
  });
}
