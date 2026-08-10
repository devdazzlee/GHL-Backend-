import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import clsx from 'clsx';
import { Breadcrumbs } from '@/src/components/Breadcrumbs';
import { HeroBanner } from '@/src/components/HeroBanner';
import { SectionWrapper } from '@/src/components/SectionWrapper';
import { SiteImage } from '@/src/components/SiteImage';
import { getDesignRecipe } from '@/src/designs/catalog';
import {
  DESIGN_PREVIEW_ABOUT,
  DESIGN_PREVIEW_IMAGES,
} from '@/src/lib/designPreviewSample';
import { getPreviewContext } from '@/src/lib/designPreviewUtils';
import { hexToRgb } from '@/src/lib/theme';

type PageProps = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return Array.from({ length: 50 }, (_, i) => ({ id: String(i + 1) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const recipe = getDesignRecipe(Number(id));
  return {
    title: `About · Preview ${recipe.name}`,
    robots: { index: false, follow: false },
  };
}

function colorWithOpacity(hex: string, opacity: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export default async function DesignPreviewAboutPage({ params }: PageProps) {
  const { id } = await params;
  const { site, theme, design } = getPreviewContext(id);
  const content = DESIGN_PREVIEW_ABOUT;
  const hero = content.hero ?? {};
  const story = content.story ?? {};
  const mission = content.mission ?? {};
  const values = content.values ?? [];

  const imageOnRight =
    design.family === 'classic' ||
    design.heroLayout === 'splitRight' ||
    design.family === 'bold';
  const storyCentered =
    design.family === 'editorial' && design.heroLayout === 'fullBleedCentered';
  const valuesCols =
    design.family === 'utility' || design.servicesLayout === 'listRows'
      ? 'md:grid-cols-1'
      : design.servicesLayout === 'grid2'
        ? 'md:grid-cols-2'
        : 'md:grid-cols-3';
  const sectionPad =
    design.density === 'airy'
      ? 'py-24 md:py-32'
      : design.density === 'compact'
        ? 'py-12 md:py-16'
        : undefined;
  const cardStyle: CSSProperties = {
    borderRadius: 'var(--design-card-radius)',
    boxShadow: 'var(--design-card-shadow)',
    border: 'var(--design-card-border)',
  };
  const missionBg =
    design.sectionRhythm === 'boldBands' ? theme.primaryColor : theme.secondaryColor;
  const missionText = design.sectionRhythm === 'boldBands' ? '#FFFFFF' : '#1f2937';

  return (
    <>
      <HeroBanner
        site={site}
        heroImage={DESIGN_PREVIEW_IMAGES.hero}
        title={hero.heading || 'About Us'}
        subtitle={hero.subheading}
        compact={design.heroLayout === 'compact' || design.family === 'utility'}
        centered={
          design.heroLayout === 'fullBleedCentered' ||
          design.navStyle === 'centered' ||
          design.family === 'editorial'
        }
      >
        <Breadcrumbs site={site} items={[{ label: 'About' }]} />
      </HeroBanner>

      <SectionWrapper background="#fff" className={sectionPad}>
        {storyCentered ? (
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: theme.accentColor }}>
              Our Story
            </p>
            <h2 className="mt-3 text-3xl font-bold text-gray-900 md:text-5xl">
              {story.heading || 'Our Story'}
            </h2>
            <div className="mx-auto mt-5 h-1 w-16 rounded-full" style={{ backgroundColor: theme.accentColor }} />
            <div className="mt-8 space-y-6 text-base leading-8 text-gray-600 md:text-lg">
              <p>{story.paragraph1}</p>
              <p>{story.paragraph2}</p>
            </div>
            <div
              className="relative mx-auto mt-12 aspect-[16/10] w-full max-w-4xl overflow-hidden"
              style={{ borderRadius: 'var(--design-card-radius)' }}
            >
              <SiteImage
                src={DESIGN_PREVIEW_IMAGES.about}
                alt={`${site.businessName} team`}
                fill
                className="object-cover"
                sizes="896px"
              />
            </div>
          </div>
        ) : (
          <div
            className={clsx(
              'grid items-center gap-12 md:gap-16',
              design.family === 'utility' ? 'md:grid-cols-1' : 'md:grid-cols-2',
            )}
          >
            <div className={clsx(imageOnRight ? 'md:order-1' : 'md:order-2')}>
              <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: theme.accentColor }}>
                Our Story
              </p>
              <h2 className="mt-3 text-3xl font-bold text-gray-900 md:text-4xl">
                {story.heading || 'Our Story'}
              </h2>
              <div className="mt-5 h-1 w-16 rounded-full" style={{ backgroundColor: theme.accentColor }} />
              <div className="mt-8 space-y-6 text-base leading-8 text-gray-600 md:text-lg">
                <p>{story.paragraph1}</p>
                <p>{story.paragraph2}</p>
              </div>
            </div>
            <div className={imageOnRight ? 'md:order-2' : 'md:order-1'}>
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
                  className="relative aspect-[4/3] w-full overflow-hidden shadow-xl md:min-h-[420px] md:aspect-[3/4]"
                  style={{ borderRadius: 'var(--design-card-radius)' }}
                >
                  <SiteImage
                    src={DESIGN_PREVIEW_IMAGES.about}
                    alt={`${site.businessName} team`}
                    fill
                    className="object-cover"
                    sizes="50vw"
                  />
                </div>
              </div>
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
          style={{ borderColor: theme.accentColor, color: missionText }}
        >
          {mission.statement || mission.heading}
        </blockquote>
        {mission.heading && mission.statement ? (
          <p
            className={clsx(
              'mx-auto mt-4 max-w-2xl text-sm font-semibold uppercase tracking-widest',
              design.family === 'editorial' || design.family === 'bold' ? 'text-center' : 'pl-6',
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
            <article key={v.title} className="bg-white p-8" style={cardStyle}>
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
              <h3 className="text-xl font-bold text-gray-900">{v.title}</h3>
              <p className="mt-3 text-gray-600">{v.description}</p>
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
          <div className={clsx('mx-auto max-w-3xl', design.family === 'utility' ? 'text-left' : 'text-center')}>
            <h2
              className="text-3xl font-bold"
              style={{ color: design.sectionRhythm === 'boldBands' ? '#fff' : '#111827' }}
            >
              {content.team.heading}
            </h2>
            <p
              className="mt-5 text-lg leading-8"
              style={{
                color: design.sectionRhythm === 'boldBands' ? 'rgba(255,255,255,0.85)' : '#4b5563',
              }}
            >
              {content.team.description}
            </p>
          </div>
        </SectionWrapper>
      ) : null}
    </>
  );
}
