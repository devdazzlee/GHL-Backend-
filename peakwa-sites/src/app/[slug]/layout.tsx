import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteNavbar } from '@/src/components/SiteNavbar';
import { Footer } from '@/src/components/Footer';
import { BackToTopLazy } from '@/src/components/BackToTopLazy';
import { getLocationPages, getSiteBySlug } from '@/src/lib/api';
import type { GeneratedSite } from '@/src/lib/types';
import { parseJson, type ServicesContent } from '@/src/lib/content';
import { resolveTheme } from '@/src/lib/theme';
import { getMetadataBase } from '@/src/lib/seo';
import { designCssVars, resolveDesignPreset } from '@/src/designs/presets';
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
  const design = resolveDesignPreset(site.designVariant);
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
    ...designCssVars(design),
  } as React.CSSProperties;

  return (
    <div
      className={clsx(
        'flex min-h-screen flex-col',
        fontClass,
        `design-family-${design.family}`,
        `design-id-${design.id}`,
      )}
      data-design={design.id}
      data-design-name={design.name}
      data-design-family={design.family}
      style={{
        ...cssVars,
        backgroundColor: 'var(--design-surface, #fff)',
      }}
    >
      <main className="order-2 flex-1">{children}</main>
      <div className="order-1 sticky top-0 z-50 w-full shrink-0">
        <SiteNavbar
          site={site}
          theme={theme}
          servicesContent={servicesContent}
          locations={locations}
          navStyle={design.navStyle}
        />
      </div>
      <div className="order-3">
        <Footer site={site} theme={theme} footerStyle={design.footerStyle} />
        <BackToTopLazy accentColor={theme.accentColor} />
        {design.stickyCallBar && site.phone ? (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 p-3 shadow-lg md:hidden">
            <a
              href={`tel:${site.phone}`}
              className="flex w-full items-center justify-center rounded-[var(--design-button-radius)] px-4 py-3 text-sm font-bold text-white"
              style={{ backgroundColor: theme.accentColor }}
            >
              Call {site.phone}
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
