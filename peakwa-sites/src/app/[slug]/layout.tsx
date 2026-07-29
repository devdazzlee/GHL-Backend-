import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Navbar } from '@/src/components/Navbar';
import { Footer } from '@/src/components/Footer';
import { BackToTopLazy } from '@/src/components/BackToTopLazy';
import { getLocationPages, getSiteBySlug } from '@/src/lib/api';
import type { GeneratedSite } from '@/src/lib/types';
import { parseJson, type ServicesContent } from '@/src/lib/content';
import { resolveTheme } from '@/src/lib/theme';
import { getMetadataBase } from '@/src/lib/seo';
import clsx from 'clsx';

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

async function fetchSiteBySlug(slug: string): Promise<GeneratedSite | null> {
  return getSiteBySlug(slug);
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { slug } = await params;
  const site = await fetchSiteBySlug(slug);
  if (!site) return { title: 'Site Not Found' };

  return {
    metadataBase: getMetadataBase(),
  };
}

export default async function SiteLayout({ children, params }: LayoutProps) {
  const { slug } = await params;
  const site = await fetchSiteBySlug(slug);
  if (!site) notFound();

  const locations = await getLocationPages(slug);
  const servicesContent = parseJson<ServicesContent>(site.servicesContent, {});
  const theme = resolveTheme(site);
  const fontClass =
    theme.fontStyle === 'classic'
      ? 'font-classic'
      : theme.fontStyle === 'friendly'
        ? 'font-friendly'
        : 'font-modern';

  const cssVars = {
    '--color-primary': theme.primaryColor,
    '--color-secondary': theme.secondaryColor,
    '--color-accent': theme.accentColor,
  } as React.CSSProperties;

  return (
    <div className={clsx('flex min-h-screen flex-col', fontClass)} style={cssVars}>
      <Navbar
        site={site}
        theme={theme}
        servicesContent={servicesContent}
        locations={locations}
      />
      <main className="flex-1">{children}</main>
      <Footer site={site} theme={theme} />
      <BackToTopLazy accentColor={theme.accentColor} />
    </div>
  );
}
