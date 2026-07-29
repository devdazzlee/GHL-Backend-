import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { IS_SEARCH_INDEXABLE } from '@/src/config';
import { robotsHeaderValue } from '@/src/lib/seo';

export function middleware(_request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('X-Robots-Tag', robotsHeaderValue(IS_SEARCH_INDEXABLE));
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)',
  ],
};
