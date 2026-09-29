import { NextResponse, type NextRequest } from 'next/server';
import { fetchDomainMap } from '@/src/lib/domainMap';
import { normalizeHost } from '@/src/lib/domainRouting';

export const dynamic = 'force-dynamic';

/**
 * Which site this host serves. The backend calls https://{domain}/api/domain-check when
 * verifying a custom domain: an answer with the right slug proves DNS, nginx, the
 * certificate and the renderer are all in place for it.
 */
export async function GET(request: NextRequest) {
  const host = normalizeHost(request.headers.get('host'));
  const map = await fetchDomainMap();
  if (!map) {
    return NextResponse.json({ success: false, error: 'Domain list unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const site = map.byHost.get(host);
  return NextResponse.json(
    { success: true, data: { host, slug: site?.slug ?? null } },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
