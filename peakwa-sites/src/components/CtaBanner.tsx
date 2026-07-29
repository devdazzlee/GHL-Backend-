import Link from 'next/link';
import { Phone } from 'lucide-react';
import type { GeneratedSite } from '@/src/lib/types';
import {
  getAccessibleForeground,
  getMutedTextOnBackground,
  getTextColor,
  resolveTheme,
} from '@/src/lib/theme';
import { SectionWrapper } from './SectionWrapper';

type CtaBannerProps = {
  site: GeneratedSite;
  heading: string;
  subtext?: string;
  buttonText?: string;
};

export function CtaBanner({ site, heading, subtext, buttonText = 'Contact Us' }: CtaBannerProps) {
  const theme = resolveTheme(site);
  const textColor = getTextColor(theme.primaryColor);
  const mutedText = getMutedTextOnBackground(theme.primaryColor);
  const primaryOnWhite = getAccessibleForeground(theme.primaryColor, '#FFFFFF');

  return (
    <SectionWrapper background={theme.primaryColor} className="py-16 md:py-16">
      <div className="text-center" style={{ color: textColor }}>
        <h2 className="text-3xl font-bold md:text-4xl">{heading}</h2>
        {subtext ? (
          <p className="mx-auto mt-4 max-w-2xl text-lg" style={{ color: mutedText }}>
            {subtext}
          </p>
        ) : null}
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href={`/${site.slug}/contact`}
            className="rounded-full px-8 py-3 text-sm font-semibold shadow-lg transition hover:scale-105"
            style={{ backgroundColor: '#fff', color: primaryOnWhite }}
          >
            {buttonText}
          </Link>
          {site.phone ? (
            <a
              href={`tel:${site.phone}`}
              className="inline-flex items-center gap-2 text-sm font-semibold transition hover:opacity-90"
              style={{ color: mutedText }}
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
