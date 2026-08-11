/** Build internal path keys for SeoContentSection related links. */
export function slugifyServiceTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export function serviceRelatedLinks(
  services: Array<{ title?: string }> | undefined,
  options?: { excludeSlug?: string; limit?: number },
): Array<{ label: string; href: string }> {
  const limit = options?.limit ?? 4;
  const exclude = options?.excludeSlug || '';
  return (services || [])
    .map((s) => {
      const title = s.title?.trim();
      if (!title) return null;
      const slug = slugifyServiceTitle(title);
      if (!slug || slug === exclude) return null;
      return { label: title, href: `services/${slug}` };
    })
    .filter((l): l is { label: string; href: string } => Boolean(l))
    .slice(0, limit);
}
