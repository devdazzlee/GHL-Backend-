import type { ReactNode } from 'react';
import clsx from 'clsx';
import { LcpHeroImage } from '@/src/components/LcpHeroImage';
import type { GeneratedSite } from '@/src/lib/types';
import { getTextColor, hexToRgb, resolveTheme } from '@/src/lib/theme';

type HeroBannerProps = {
  site: GeneratedSite;
  heroImage?: string | null;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  compact?: boolean;
  centered?: boolean;
};

function colorWithOpacity(hex: string, opacity: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function HeroBanner({
  site,
  heroImage,
  title,
  subtitle,
  children,
  compact = false,
  centered = false,
}: HeroBannerProps) {
  const theme = resolveTheme(site);
  const textColor = heroImage ? '#FFFFFF' : getTextColor(theme.primaryColor);

  return (
    <section
      className={clsx(
        'relative overflow-hidden',
        compact ? 'py-14 md:py-18' : 'py-20 md:py-28',
      )}
      style={heroImage ? undefined : { backgroundColor: theme.primaryColor, color: textColor }}
    >
      {heroImage ? (
        <>
          <div className="absolute inset-0">
            <LcpHeroImage src={heroImage} alt={`${site.businessName} hero banner`} />
          </div>
          <div
            className="absolute inset-0"
            style={{ backgroundColor: colorWithOpacity(theme.primaryColor, 0.7) }}
          />
        </>
      ) : null}
      <div
        className={clsx(
          'relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8',
          centered && 'text-center',
        )}
        style={{ color: textColor }}
      >
        {children}
        <h1
          className={clsx(
            'font-bold',
            compact ? 'text-3xl md:text-4xl' : 'text-4xl md:text-5xl',
            centered && 'mx-auto',
          )}
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            className={clsx(
              'mt-4 text-lg opacity-90',
              centered ? 'mx-auto max-w-2xl' : 'max-w-2xl',
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </section>
  );
}
