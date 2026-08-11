import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import clsx from 'clsx';
import { buildPageMetadata } from '@/src/lib/seo';
import { Breadcrumbs } from '@/src/components/Breadcrumbs';
import { HeroBanner } from '@/src/components/HeroBanner';
import { AboutPageJsonLd } from '@/src/components/SchemaMarkup';
import { SeoContentSection } from '@/src/components/SeoContentSection';
import { SectionWrapper } from '@/src/components/SectionWrapper';
import { SiteImage } from '@/src/components/SiteImage';
import { getSiteBySlug } from '@/src/lib/api';
import { parseJson, type AboutContent, type ServicesContent } from '@/src/lib/content';
import { getSiteImages } from '@/src/lib/images';
import { serviceRelatedLinks } from '@/src/lib/seoLinks';
import { hexToRgb, resolveTheme } from '@/src/lib/theme';
import { resolveDesignPreset } from '@/src/designs/presets';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) return {};

  const about = parseJson<AboutContent>(site.aboutContent, {});
  if (!about.seo?.title || !about.seo?.metaDescription) return {};

  return buildPageMetadata({
    site,
    title: about.seo.title,
    description: about.seo.metaDescription,
    pathParts: [site.slug, 'about'],
  });
}

function colorWithOpacity(hex: string, opacity: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export default async function AboutPage({ params }: PageProps) {
  const { slug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) notFound();

  const images = await getSiteImages(slug);
  const content = parseJson<AboutContent>(site.aboutContent, {});
  const servicesCatalog = parseJson<ServicesContent>(site.servicesContent, {});
  const theme = resolveTheme(site);
  const design = resolveDesignPreset(site.designVariant);
  const hero = content.hero ?? {};
  const story = content.story ?? {};
  const mission = content.mission ?? {};
  const values = content.values ?? [];

  const imageOnRight =
    design.family === 'classic' ||
    design.heroLayout === 'splitRight' ||
    design.family === 'bold';
  const storyCentered = design.family === 'editorial' && design.heroLayout === 'fullBleedCentered';
  const valuesCols =
    design.family === 'utility' || design.servicesLayout === 'listRows'
      ? 'md:grid-cols-1'
      : design.servicesLayout === 'grid2'
        ? 'md:grid-cols-2'
        : 'md:grid-cols-3';
  const sectionPad =
    design.density === 'airy' ? 'py-24 md:py-32' : design.density === 'compact' ? 'py-12 md:py-16' : undefined;
  const cardStyle: CSSProperties = {
    borderRadius: 'var(--design-card-radius)',
    boxShadow: 'var(--design-card-shadow)',
    border: 'var(--design-card-border)',
  };
  const missionBg =
    design.sectionRhythm === 'boldBands' ? theme.primaryColor : theme.secondaryColor;
  const missionText =
    design.sectionRhythm === 'boldBands' ? '#FFFFFF' : '#1f2937';

  return (
    <>
      <AboutPageJsonLd
        site={site}
        description={
          content.seo?.metaDescription ||
          story.paragraph1 ||
          story.paragraph2 ||
          site.description ||
          undefined
        }
        breadcrumbItems={[{ label: 'About' }]}
      />
      <HeroBanner
        site={site}
        heroImage={images.hero}
        title={hero.heading || 'About Us'}
        subtitle={hero.subheading}
        compact={design.heroLayout === 'compact' || design.family === 'utility'}
        centered={
          design.heroLayout === 'fullBleedCentered' ||
          design.navStyle === 'centered' ||
          design.family === 'editorial'
        }
      >
        <Breadcrumbs site={site} skipSchema items={[{ label: 'About' }]} />
      </HeroBanner>

      <SectionWrapper background="#fff" className={sectionPad}>
        {storyCentered ? (
          <div className="mx-auto max-w-3xl text-center">
            <p
              className="text-sm font-semibold uppercase tracking-widest"
              style={{ color: theme.accentColor }}
            >
              Our Story
            </p>
            <h2 className="mt-3 text-3xl font-bold text-gray-900 md:text-5xl">
              {story.heading || 'Our Story'}
            </h2>
            <div
              className="mx-auto mt-5 h-1 w-16 rounded-full"
              style={{ backgroundColor: theme.accentColor }}
            />
            <div className="mt-8 space-y-6 text-base leading-8 text-gray-600 md:text-lg md:leading-8">
              <p>{story.paragraph1}</p>
              <p>{story.paragraph2}</p>
            </div>
            {images.about ? (
              <div
                className="relative mx-auto mt-12 aspect-[16/10] w-full max-w-4xl overflow-hidden"
                style={{ borderRadius: 'var(--design-card-radius)' }}
              >
                <SiteImage
                  src={images.about}
                  alt={`${site.businessName} team and story`}
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 768px) 100vw, 896px"
                  fallback={
                    <div
                      className="h-full w-full"
                      style={{ backgroundColor: colorWithOpacity(theme.accentColor, 0.15) }}
                    />
                  }
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className={clsx(
              'grid items-center gap-12 md:gap-16',
              design.family === 'utility' ? 'md:grid-cols-1' : 'md:grid-cols-2',
            )}
          >
            <div
              className={clsx(
                imageOnRight ? 'md:order-1' : 'md:order-2',
                design.family === 'split' && 'md:pr-4',
              )}
            >
              <p
                className="text-sm font-semibold uppercase tracking-widest"
                style={{ color: theme.accentColor }}
              >
                Our Story
              </p>
              <h2
                className={clsx(
                  'mt-3 font-bold text-gray-900',
                  design.density === 'compact' ? 'text-2xl md:text-3xl' : 'text-3xl md:text-4xl',
                )}
              >
                {story.heading || 'Our Story'}
              </h2>
              <div
                className="mt-5 h-1 w-16 rounded-full"
                style={{ backgroundColor: theme.accentColor }}
              />
              <div className="mt-8 max-w-2xl space-y-6 text-base leading-8 text-gray-600 md:text-lg md:leading-8">
                <p>{story.paragraph1}</p>
                <p>{story.paragraph2}</p>
              </div>
            </div>

            <div className={imageOnRight ? 'md:order-2' : 'md:order-1'}>
              {images.about ? (
                <div className="relative">
                  {design.family !== 'utility' ? (
                    <div
                      className="absolute -bottom-5 -right-5 hidden h-full w-full md:block"
                      style={{
                        backgroundColor: colorWithOpacity(theme.accentColor, 0.15),
                        borderRadius: 'var(--design-card-radius)',
                      }}
                    />
                  ) : null}
                  <div
                    className={clsx(
                      'relative w-full overflow-hidden shadow-xl',
                      design.density === 'compact'
                        ? 'aspect-[4/3] md:aspect-[5/4]'
                        : 'aspect-[4/3] md:aspect-[3/4] md:min-h-[420px]',
                    )}
                    style={{ borderRadius: 'var(--design-card-radius)' }}
                  >
                    <SiteImage
                      src={images.about}
                      alt={`${site.businessName} team and story`}
                      fill
                      className="object-cover object-center"
                      sizes="(max-width: 768px) 100vw, 50vw"
                      fallback={
                        <div
                          className="h-full w-full"
                          style={{ backgroundColor: colorWithOpacity(theme.accentColor, 0.15) }}
                        />
                      }
                    />
                  </div>
                </div>
              ) : (
                <div
                  className="flex aspect-[4/3] items-center justify-center md:min-h-[320px]"
                  style={{
                    backgroundColor: colorWithOpacity(theme.secondaryColor, 0.5),
                    borderRadius: 'var(--design-card-radius)',
                  }}
                >
                  <p className="text-6xl font-serif opacity-20" style={{ color: theme.accentColor }}>
                    “
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </SectionWrapper>

      <SectionWrapper background={missionBg} className={sectionPad}>
        <blockquote
          className={clsx(
            'mx-auto max-w-3xl py-2 text-2xl italic md:text-3xl',
            design.family === 'editorial' || design.family === 'bold'
              ? 'border-none text-center'
              : 'border-l-4 pl-6 text-left',
          )}
          style={{
            borderColor: theme.accentColor,
            color: missionText,
          }}
        >
          {mission.statement || mission.heading}
        </blockquote>
        {mission.heading && mission.statement ? (
          <p
            className={clsx(
              'mx-auto mt-4 max-w-2xl text-sm font-semibold uppercase tracking-widest',
              design.family === 'editorial' || design.family === 'bold'
                ? 'text-center'
                : 'pl-6',
            )}
            style={{ color: design.sectionRhythm === 'boldBands' ? '#fff' : theme.accentColor }}
          >
            {mission.heading}
          </p>
        ) : null}
      </SectionWrapper>

      <SectionWrapper
        background={design.sectionRhythm === 'alternating' ? theme.secondaryColor : '#fff'}
        className={sectionPad}
      >
        <h2
          className={clsx(
            'mb-10 font-bold text-gray-900',
            design.family === 'editorial' || design.navStyle === 'centered'
              ? 'text-center text-3xl md:text-4xl'
              : 'text-left text-3xl',
          )}
        >
          Our Values
        </h2>
        <div className={clsx('grid gap-6 md:gap-8', valuesCols)}>
          {values.map((v, i) => (
            <article
              key={`${v.title}-${i}`}
              className={clsx(
                'bg-white p-8',
                design.servicesLayout === 'listRows' && 'flex flex-col sm:flex-row sm:items-start sm:gap-6',
              )}
              style={cardStyle}
            >
              {design.family === 'bold' || design.family === 'utility' ? (
                <span
                  className="mb-4 inline-flex h-10 w-10 items-center justify-center text-sm font-bold text-white"
                  style={{
                    backgroundColor: theme.accentColor,
                    borderRadius: 'var(--design-button-radius)',
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
              ) : null}
              <div>
                <h3 className="text-xl font-bold text-gray-900">{v.title}</h3>
                <p className="mt-3 text-gray-600">{v.description}</p>
              </div>
            </article>
          ))}
        </div>
      </SectionWrapper>

      {content.team ? (
        <SectionWrapper
          background={
            design.sectionRhythm === 'boldBands' ? theme.primaryColor : theme.secondaryColor
          }
          className={sectionPad}
        >
          <div
            className={clsx(
              'mx-auto max-w-3xl',
              design.family === 'utility' ? 'text-left' : 'text-center',
            )}
          >
            <h2
              className="text-3xl font-bold"
              style={{
                color: design.sectionRhythm === 'boldBands' ? '#fff' : '#111827',
              }}
            >
              {content.team.heading}
            </h2>
            <p
              className="mt-4 text-lg"
              style={{
                color: design.sectionRhythm === 'boldBands' ? 'rgba(255,255,255,0.85)' : '#4b5563',
              }}
            >
              {content.team.description}
            </p>
          </div>
        </SectionWrapper>
      ) : null}

      <SeoContentSection
        site={site}
        seoExtra={content.seoExtra}
        currentPath="about"
        relatedLinks={[
          { label: 'All services', href: 'services' },
          ...serviceRelatedLinks(servicesCatalog.services, { limit: 2 }),
          { label: 'Get in touch', href: 'contact' },
          { label: 'Read the blog', href: 'blog' },
        ]}
      />
    </>
  );
}
