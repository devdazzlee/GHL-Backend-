import type { ReactNode } from 'react';
import { LcpHeroImage } from '@/src/components/LcpHeroImage';
import type { GeneratedSite } from '@/src/lib/types';
import { getTextColor, hexToRgb, resolveTheme } from '@/src/lib/theme';

type HeroBannerProps = {
  site: GeneratedSite;
  heroImage?: string | null;
  title: string;
  subtitle?: string;
  children?: ReactNode;
};

function colorWithOpacity(hex: string, opacity: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function HeroBanner({ site, heroImage, title, subtitle, children }: HeroBannerProps) {
  const theme = resolveTheme(site);
  const textColor = heroImage ? '#FFFFFF' : getTextColor(theme.primaryColor);

  return (
    <section
      className="relative overflow-hidden py-20 md:py-28"
      style={heroImage ? undefined : { backgroundColor: theme.primaryColor, color: textColor }}
    >
      {heroImage ? (
        <>
          <div className="absolute inset-0">
            <LcpHeroImage
              src={heroImage}
              alt={`${site.businessName} hero banner`}
            />
          </div>
          <div
            className="absolute inset-0"
            style={{ backgroundColor: colorWithOpacity(theme.primaryColor, 0.7) }}
          />
        </>
      ) : null}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" style={{ color: textColor }}>
        {children}
        <h1 className="text-4xl font-bold md:text-5xl">{title}</h1>
        {subtitle ? <p className="mt-4 max-w-2xl text-lg opacity-90">{subtitle}</p> : null}
      </div>
    </section>
  );
}
