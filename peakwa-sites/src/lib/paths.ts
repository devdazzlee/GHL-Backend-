/** True when pathname is the site home (/{slug} only). */
export function isSiteHomePath(pathname: string, slug: string): boolean {
  const path = pathname.split('?')[0]?.replace(/\/$/, '') ?? '';
  return path === `/${slug}`;
}
