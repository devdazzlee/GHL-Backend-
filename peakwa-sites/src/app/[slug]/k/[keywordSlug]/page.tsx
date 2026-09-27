import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import clsx from 'clsx';
import { Breadcrumbs } from '@/src/components/Breadcrumbs';
import { CtaBanner } from '@/src/components/CtaBanner';
import { FaqAccordion } from '@/src/components/FaqAccordion';
import { HeroBanner } from '@/src/components/HeroBanner';
import { FAQSchema } from '@/src/components/SchemaMarkup';
import { SectionWrapper } from '@/src/components/SectionWrapper';
import { resolveDesignPreset } from '@/src/designs/presets';
import { headingAlignClass, heroBannerProps, sectionBg, sectionPadClass } from '@/src/designs/chrome';
import { getLocationPages, getPublishedKeywordPage, getSiteBySlug } from '@/src/lib/api';
import { buildPageMetadata } from '@/src/lib/seo';
import { resolveTheme } from '@/src/lib/theme';

type PageProps = { params: Promise<{ slug: string; keywordSlug: string }> };

/** Keyword + city landing page (published pages only; drafts are never served). */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, keywordSlug } = await params;
  const [site, page] = await Promise.all([getSiteBySlug(slug), getPublishedKeywordPage(slug, keywordSlug)]);
  if (!site || !page) return {};
  const title = page.content.seo?.title || page.content.h1 || page.keyword;
  const description =
    page.content.seo?.metaDescription || `${page.keyword} in ${page.locationPage.city} from ${site.businessName}.`;
  return buildPageMetadata({ site, title, description, pathParts: [slug, 'k', keywordSlug] });
}

export default async function KeywordLandingPage({ params }: PageProps) {
  const { slug, keywordSlug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) notFound();
  const page = await getPublishedKeywordPage(slug, keywordSlug);
  if (!page) notFound();

  const cities = await getLocationPages(slug);
  const city = cities.find((c) => c.slug === page.locationPage.slug);
  const { content } = page;
  const theme = resolveTheme(site);
  const design = resolveDesignPreset(site.designVariant);
  const hero = heroBannerProps(design);
  const pad = sectionPadClass(design);
  const cityHref = `/${slug}/${page.locationPage.slug}`;
  const faqs = (content.faqs ?? []).filter(
    (f): f is { question: string; answer: string } => Boolean(f.question && f.answer),
  );
  const headingClass = clsx(
    'text-3xl text-gray-900',
    headingAlignClass(design),
    design.family === 'bold' ? 'font-bold uppercase tracking-wide' : 'font-bold',
  );

  let sectionIndex = 0;
  const nextBg = () => sectionBg(design, sectionIndex++ % 2 === 1 ? 'soft' : 'plain', theme);

  return (
    <>
      <HeroBanner
        site={site}
        heroImage={city?.imageUrl ?? null}
        title={content.h1 || `${page.keyword} in ${page.locationPage.city}`}
        subtitle={`${site.businessName} · ${page.locationPage.city}, ${page.locationPage.state}`}
        compact={hero.compact}
        centered={hero.centered}
      >
        <Breadcrumbs
          site={site}
          items={[
            { label: `${page.locationPage.city}, ${page.locationPage.county} County`, href: cityHref },
            { label: page.keyword },
          ]}
        />
      </HeroBanner>

      {content.intro ? (
        <SectionWrapper background={nextBg()} className={pad}>
          <p className="mx-auto max-w-3xl text-lg leading-relaxed text-gray-700">{content.intro}</p>
        </SectionWrapper>
      ) : null}

      {(content.sections ?? []).map((section, i) =>
        section.heading || section.paragraphs?.length ? (
          <SectionWrapper key={`${section.heading}-${i}`} background={nextBg()} className={pad}>
            <div className="mx-auto max-w-3xl">
              {section.heading ? <h2 className={headingClass}>{section.heading}</h2> : null}
              {(section.paragraphs ?? []).map((p, j) => (
                <p key={j} className="mt-6 text-lg leading-relaxed text-gray-600">
                  {p}
                </p>
              ))}
            </div>
          </SectionWrapper>
        ) : null,
      )}

      {content.localNotes?.length ? (
        <SectionWrapper background={nextBg()} className={pad}>
          <div className="mx-auto max-w-3xl">
            <h2 className={headingClass}>In {page.locationPage.city}</h2>
            <ul className="mt-6 list-disc space-y-2 pl-6 text-lg text-gray-600">
              {content.localNotes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
            <p className="mt-6">
              <Link href={cityHref} className="font-semibold underline" style={{ color: theme.accentColor }}>
                More about {site.businessName} in {page.locationPage.city}
              </Link>
            </p>
          </div>
        </SectionWrapper>
      ) : null}

      {faqs.length ? (
        <SectionWrapper background={nextBg()} className={pad}>
          <FAQSchema faqs={faqs} />
          <div className="mx-auto max-w-3xl">
            <h2 className={clsx(headingClass, 'mb-8')}>Frequently Asked Questions</h2>
            <FaqAccordion faqs={faqs} accentColor={theme.accentColor} />
          </div>
        </SectionWrapper>
      ) : null}

      <CtaBanner
        site={site}
        heading={content.ctaHeading || `Talk to ${site.businessName}`}
        subtext={content.ctaText || `Contact us about ${page.keyword} in ${page.locationPage.city}.`}
        buttonText="Contact Us"
      />
    </>
  );
}
