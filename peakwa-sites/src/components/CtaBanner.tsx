import Link from 'next/link';
import { Phone } from 'lucide-react';
import clsx from 'clsx';
import type { GeneratedSite } from '@/src/lib/types';
import {
  getAccessibleForeground,
  getMutedTextOnBackground,
  getTextColor,
  resolveTheme,
} from '@/src/lib/theme';
import { SectionWrapper } from './SectionWrapper';
import { getDesign, sectionPadClass } from '@/src/designs/chrome';

type CtaBannerProps = {
  site: GeneratedSite;
  heading: string;
  subtext?: string;
  buttonText?: string;
};

export function CtaBanner({ site, heading, subtext, buttonText = 'Contact Us' }: CtaBannerProps) {
  const theme = resolveTheme(site);
  const design = getDesign(site.designVariant);
  const textColor = getTextColor(theme.primaryColor);
  const mutedText = getMutedTextOnBackground(theme.primaryColor);
  const primaryOnWhite = getAccessibleForeground(theme.primaryColor, '#FFFFFF');
  const centered = design.family !== 'utility';
  const useAccentBand = design.family === 'bold' || design.sectionRhythm === 'boldBands';

  return (
    <SectionWrapper
      background={useAccentBand ? theme.accentColor : theme.primaryColor}
      className={sectionPadClass(design)}
    >
      <div
        className={clsx(centered ? 'text-center' : 'text-left')}
        style={{ color: useAccentBand ? getTextColor(theme.accentColor) : textColor }}
      >
        <h2
          className={clsx(
            'font-bold',
            design.family === 'bold' ? 'text-3xl uppercase tracking-wide md:text-5xl' : 'text-3xl md:text-4xl',
            design.family === 'editorial' && 'font-medium',
          )}
        >
          {heading}
        </h2>
        {subtext ? (
          <p
            className={clsx(
              'mt-4 text-lg',
              centered ? 'mx-auto max-w-2xl' : 'max-w-2xl',
            )}
            style={{ color: useAccentBand ? 'rgba(255,255,255,0.9)' : mutedText }}
          >
            {subtext}
          </p>
        ) : null}
        <div
          className={clsx(
            'mt-8 flex flex-col gap-4 sm:flex-row',
            centered ? 'items-center justify-center' : 'items-start',
          )}
        >
          <Link
            href={`/${site.slug}/contact`}
            className="px-8 py-3 text-sm font-semibold shadow-lg transition hover:scale-105"
            style={{
              backgroundColor: '#fff',
              color: useAccentBand
                ? getAccessibleForeground(theme.accentColor, '#FFFFFF')
                : primaryOnWhite,
              borderRadius: 'var(--design-button-radius)',
            }}
          >
            {buttonText}
          </Link>
          {site.phone ? (
            <a
              href={`tel:${site.phone}`}
              className="inline-flex items-center gap-2 text-sm font-semibold transition hover:opacity-90"
              style={{ color: useAccentBand ? 'rgba(255,255,255,0.9)' : mutedText }}
            >
              <Phone className="h-4 w-4" />
              {site.phone}
            </a>
          ) : null}
        </div>
      </div>
    </SectionWrapper>
  );
}
