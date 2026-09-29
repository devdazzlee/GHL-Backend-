import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getSiteBySlug } from '@/src/lib/api';
import { parseJson, type ServicesContent } from '@/src/lib/content';
import { slugifyServiceTitle } from '@/src/lib/seoLinks';

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ slug: string; serviceSlug: string }>;
};

/**
 * Decides whether the service exists before page.tsx starts streaming behind
 * loading.tsx. Once streaming starts the status is already 200, so the page's own
 * notFound() can only show a "not found" page; checking here makes an old, renamed
 * or deleted service URL answer a real 404.
 */
export default async function ServiceLayout({ children, params }: LayoutProps) {
  const { slug, serviceSlug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) notFound();
  const services = parseJson<ServicesContent>(site.servicesContent, {})?.services ?? [];
  if (!services.some((s) => slugifyServiceTitle(s.title || '') === serviceSlug)) notFound();
  return children;
}
