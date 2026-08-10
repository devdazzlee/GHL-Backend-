import clsx from 'clsx';
import { Footer } from '@/src/components/Footer';
import { SiteNavbar } from '@/src/components/SiteNavbar';
import { getDesignRecipe } from '@/src/designs/catalog';
import { designCssVars, resolveDesignPreset } from '@/src/designs/presets';
import {
  buildDesignPreviewSite,
  DESIGN_PREVIEW_LOCATIONS,
  DESIGN_PREVIEW_SERVICES,
} from '@/src/lib/designPreviewSample';
import { parsePreviewDesignId } from '@/src/lib/designPreviewUtils';
import { resolveTheme } from '@/src/lib/theme';

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export default async function DesignPreviewLayout({ children, params }: LayoutProps) {
  const { id } = await params;
  const designId = parsePreviewDesignId(id);
  const site = buildDesignPreviewSite(designId);
  const theme = resolveTheme(site);
  const design = resolveDesignPreset(designId);
  const recipe = getDesignRecipe(designId);

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
      style={{
        ...cssVars,
        backgroundColor: 'var(--design-surface, #fff)',
      }}
    >
      <div className="sticky top-0 z-[60] border-b border-amber-500/30 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
        <span className="font-semibold">
          Design preview #{design.id} · {recipe.name}
        </span>
        <span className="mx-2 text-amber-700/70">·</span>
        <span className="capitalize text-amber-800/90">{design.family} family</span>
        <span className="mx-2 text-amber-700/70">·</span>
        <span className="text-amber-800/80">Sample data only — nav pages work inside this preview</span>
      </div>

      <div className="sticky top-[37px] z-50 w-full shrink-0">
        <SiteNavbar
          site={site}
          theme={theme}
          servicesContent={DESIGN_PREVIEW_SERVICES}
          locations={DESIGN_PREVIEW_LOCATIONS}
          navStyle={design.navStyle}
        />
      </div>

      <main className="flex-1">{children}</main>

      <Footer site={site} theme={theme} footerStyle={design.footerStyle} />
    </div>
  );
}
