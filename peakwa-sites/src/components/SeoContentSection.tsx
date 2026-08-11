import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { FaqAccordion } from '@/src/components/FaqAccordion';
import { SectionWrapper } from '@/src/components/SectionWrapper';
import {
  cardChromeStyle,
  getDesign,
  headingAlignClass,
  sectionPadClass,
} from '@/src/designs/chrome';
import type { SeoExtraContent } from '@/src/lib/content';
import type { GeneratedSite } from '@/src/lib/types';
import { resolveTheme } from '@/src/lib/theme';

type LinkItem = { label?: string; href?: string };

type SeoContentSectionProps = {
  site: GeneratedSite;
  seoExtra?: SeoExtraContent | null;
  /** When false, skip rendering FAQs from seoExtra (page already has FAQs). */
  showFaqs?: boolean;
  /** Path key for the current page (e.g. "about", "services/private-workshops") so it is hidden from links. */
  currentPath?: string;
  /** Extra page-specific links (usually services) merged ahead of stored seoExtra.links. */
  relatedLinks?: LinkItem[];
};

function normalizePathKey(href: string): string {
  return String(href || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
}

function resolveInternalHref(siteSlug: string, href: string): string {
  const key = normalizePathKey(href);
  if (!key) return `/${siteSlug}`;
  return `/${siteSlug}/${key}`;
}

function mergeLinks(
  primary: LinkItem[],
  secondary: LinkItem[],
  currentPath?: string,
): Array<{ label: string; href: string }> {
  const current = normalizePathKey(currentPath || '');
  const seen = new Set<string>();
  const out: Array<{ label: string; href: string }> = [];

  for (const link of [...primary, ...secondary]) {
    if (!link?.label?.trim()) continue;
    const href = normalizePathKey(link.href || '');
    if (href === current) continue;
    const key = href || '__home__';
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: link.label.trim(), href });
  }

  return out.slice(0, 6);
}

/**
 * Bottom-of-page keyword SEO block shared across all 50 design variants.
 */
export function SeoContentSection({
  site,
  seoExtra,
  showFaqs = true,
  currentPath,
  relatedLinks = [],
}: SeoContentSectionProps) {
  if (!seoExtra?.heading && !seoExtra?.paragraphs?.length) return null;

  const theme = resolveTheme(site);
  const design = getDesign(site.designVariant);
  const paragraphs = (seoExtra.paragraphs || []).filter((p) => Boolean(p?.trim()));
  const links = mergeLinks(relatedLinks, seoExtra.links || [], currentPath);
  const faqs = showFaqs
    ? (seoExtra.faqs || []).filter(
        (f): f is { question: string; answer: string } =>
          Boolean(f?.question?.trim() && f?.answer?.trim()),
      )
    : [];
  const align = headingAlignClass(design);
  const centered = align.includes('center');

  if (!seoExtra.heading && paragraphs.length === 0 && links.length === 0 && faqs.length === 0) {
    return null;
  }

  return (
    <SectionWrapper background={theme.secondaryColor} className={sectionPadClass(design)}>
      <div className="mx-auto max-w-4xl">
        {seoExtra.heading ? (
          <div className={clsx(align)}>
            <p
              className="text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ color: theme.accentColor }}
            >
              Local guide
            </p>
            <h2
              className={clsx(
                'mt-3 text-3xl text-gray-900 md:text-4xl',
                design.family === 'editorial' ? 'font-medium' : 'font-bold',
                design.family === 'bold' && 'uppercase tracking-wide',
              )}
            >
              {seoExtra.heading}
            </h2>
            <div
              className={clsx('mt-5 h-1 w-16 rounded-full', centered && 'mx-auto')}
              style={{ backgroundColor: theme.accentColor }}
              aria-hidden
            />
          </div>
        ) : null}

        {paragraphs.length > 0 ? (
          <div className={clsx('mt-8 space-y-5', centered ? 'mx-auto max-w-3xl' : 'max-w-3xl')}>
            {paragraphs.map((paragraph, i) => (
              <p key={`seo-p-${i}`} className="text-base leading-relaxed text-gray-700 md:text-lg">
                {paragraph}
              </p>
            ))}
          </div>
        ) : null}

        {links.length > 0 ? (
          <div className="mt-12">
            <h3
              className={clsx(
                'text-sm font-semibold uppercase tracking-[0.18em] text-gray-500',
                align,
              )}
            >
              Continue exploring
            </h3>
            <ul
              className={clsx(
                'mt-5 grid gap-3 sm:grid-cols-2',
                links.length >= 3 && 'lg:grid-cols-3',
              )}
            >
              {links.map((link) => (
                <li key={`seo-link-${link.href}-${link.label}`}>
                  <Link
                    href={resolveInternalHref(site.slug, link.href)}
                    className="group flex h-full items-center justify-between gap-3 bg-white px-5 py-4 transition duration-300 hover:-translate-y-0.5"
                    style={cardChromeStyle()}
                  >
                    <span className="text-base font-semibold text-gray-900 group-hover:underline">
                      {link.label}
                    </span>
                    <span
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition group-hover:scale-105"
                      style={{
                        backgroundColor: theme.accentColor,
                        color: '#fff',
                      }}
                      aria-hidden
                    >
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {faqs.length > 0 ? (
          <div className="mt-14">
            <h3
              className={clsx(
                'mb-6 text-2xl font-bold text-gray-900 md:text-3xl',
                align,
                design.family === 'editorial' && 'font-medium',
              )}
            >
              Frequently Asked Questions
            </h3>
            <div className={clsx(centered && 'mx-auto max-w-3xl')}>
              <FaqAccordion faqs={faqs} accentColor={theme.accentColor} />
            </div>
          </div>
        ) : null}
      </div>
    </SectionWrapper>
  );
}
