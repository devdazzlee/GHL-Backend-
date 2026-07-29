import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { IS_SEARCH_INDEXABLE } from '@/src/config';
import { robotsHeaderValue } from '@/src/lib/seo';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set('X-Robots-Tag', robotsHeaderValue(IS_SEARCH_INDEXABLE));
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|robots.txt|sitemap.xml|api/).*)',
  ],
};
