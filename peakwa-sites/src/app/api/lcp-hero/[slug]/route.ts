import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  fetchHeroImageUrl,
  HERO_DESKTOP_WIDTH,
  HERO_MOBILE_WIDTH,
  pexelsImageSrc,
} from '@/src/lib/images';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const requested = Number(request.nextUrl.searchParams.get('w') ?? HERO_MOBILE_WIDTH);
  const width = requested >= HERO_DESKTOP_WIDTH ? HERO_DESKTOP_WIDTH : HERO_MOBILE_WIDTH;
  const height = width >= HERO_DESKTOP_WIDTH ? 720 : 552;

  const hero = await fetchHeroImageUrl(slug);
  if (!hero) {
    return new NextResponse(null, { status: 404 });
  }

  const upstreamUrl = pexelsImageSrc(hero, width, height);
  const upstream = await fetch(upstreamUrl, {
    next: { revalidate: 86400 },
  });

  if (!upstream.ok) {
    return new NextResponse(null, { status: 502 });
  }

  const body = await upstream.arrayBuffer();
  return new NextResponse(body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
