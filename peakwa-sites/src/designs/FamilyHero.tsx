import Link from 'next/link';
import { CheckCircle2, Phone } from 'lucide-react';
import clsx from 'clsx';
import { LcpHeroImage } from '@/src/components/LcpHeroImage';
import { SiteImage } from '@/src/components/SiteImage';
import { getDesignRecipe, type HeroMode } from '@/src/designs/catalog';
import type { DesignPreset } from '@/src/designs/presets';
import type { GeneratedSite, SiteTheme } from '@/src/lib/types';
import { darkenHex, getTextColor, hexToRgb } from '@/src/lib/theme';

function colorWithOpacity(hex: string, opacity: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

type HeroProps = {
  site: GeneratedSite;
  theme: SiteTheme;
  design: DesignPreset;
  slug: string;
  heading: string;
  subheading: string;
  ctaButton: string;
  heroImage?: string | null;
};

function CtaRow({
  slug,
  theme,
  phone,
  ctaButton,
  light = false,
  centered = false,
}: {
  slug: string;
  theme: SiteTheme;
  phone?: string | null;
  ctaButton: string;
  light?: boolean;
  centered?: boolean;
}) {
  return (
    <div className={clsx('mt-10 flex flex-col gap-3 sm:flex-row', centered && 'items-center justify-center')}>
      <Link
        href={`/${slug}/contact`}
        className="inline-flex items-center justify-center px-8 py-4 text-sm font-bold"
        style={{
          backgroundColor: light ? '#fff' : theme.accentColor,
          color: light ? theme.primaryColor : getTextColor(theme.accentColor),
          borderRadius: 'var(--design-button-radius)',
        }}
      >
        {ctaButton}
      </Link>
      {phone ? (
        <a
          href={`tel:${phone}`}
          className={clsx(
            'inline-flex items-center justify-center gap-2 border-2 px-8 py-4 text-sm font-semibold',
            light ? 'border-white text-white' : 'border-current',
          )}
          style={{ borderRadius: 'var(--design-button-radius)' }}
        >
          <Phone className="h-4 w-4" />
          {phone}
        </a>
      ) : null}
    </div>
  );
}

/** 20 distinct hero structures driven by design catalog heroMode. */
export function FamilyHero({
  site,
  theme,
  design,
  slug,
  heading,
  subheading,
  ctaButton,
  heroImage,
}: HeroProps) {
  const recipe = getDesignRecipe(design.id);
  const mode: HeroMode = recipe.heroMode;
  const label = `${recipe.name} · #${recipe.id}`;

  if (mode === 'bold-panel' || mode === 'bold-overlay-cta') {
    return (
      <section
        className="relative overflow-hidden"
        style={{ backgroundColor: theme.primaryColor, color: '#fff' }}
        data-hero-mode={mode}
      >
        <div className="absolute inset-0 opacity-30">
          {heroImage ? (
            <LcpHeroImage src={heroImage} alt="" />
          ) : (
            <div className="h-full w-full" style={{ background: darkenHex(theme.primaryColor, 0.25) }} />
          )}
        </div>
        {mode === 'bold-overlay-cta' ? (
          <div
            className="absolute left-0 right-0 top-0 z-20 px-4 py-2 text-center text-xs font-bold uppercase tracking-widest text-white"
            style={{ backgroundColor: theme.accentColor }}
          >
            Call now · Local {site.industry} in {site.city}
          </div>
        ) : null}
        <div className="relative z-10 mx-auto grid max-w-7xl gap-0 lg:grid-cols-[1.2fr_0.8fr]">
          <div className={clsx('px-4 py-20 sm:px-6 lg:px-10 lg:py-28', mode === 'bold-overlay-cta' && 'pt-24')}>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/70">{label}</p>
            <h1 className="mt-6 text-4xl font-black uppercase leading-[0.95] tracking-wide md:text-6xl lg:text-7xl">
              {heading}
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/85">{subheading}</p>
            <CtaRow slug={slug} theme={theme} phone={site.phone} ctaButton={ctaButton} light />
          </div>
          <div
            className="flex flex-col justify-end gap-4 px-4 py-10 sm:px-6 lg:px-8"
            style={{ backgroundColor: theme.accentColor, color: getTextColor(theme.accentColor) }}
          >
            <p className="text-sm font-bold uppercase tracking-widest opacity-80">Act now</p>
            <p className="text-2xl font-black leading-tight md:text-3xl">
              Local {site.industry} experts ready for {site.city}.
            </p>
            <Link
              href={`/${slug}/contact`}
              className="mt-2 inline-flex w-fit items-center justify-center bg-black px-6 py-3 text-sm font-bold uppercase text-white"
            >
              Request service
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (mode === 'bold-stack') {
    return (
      <section
        className="px-4 py-16 text-white sm:px-6 lg:px-8"
        style={{ backgroundColor: darkenHex(theme.primaryColor, 0.15) }}
        data-hero-mode={mode}
      >
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/60">{label}</p>
          <h1 className="mt-6 text-4xl font-black uppercase leading-none md:text-6xl">{heading}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/80">{subheading}</p>
          <CtaRow slug={slug} theme={theme} phone={site.phone} ctaButton={ctaButton} light centered />
        </div>
        {heroImage ? (
          <div className="relative mx-auto mt-12 aspect-[21/9] max-w-5xl overflow-hidden border-4 border-white/20">
            <SiteImage src={heroImage} alt="" fill className="object-cover" sizes="1024px" />
          </div>
        ) : null}
      </section>
    );
  }

  if (mode === 'diagonal-band') {
    return (
      <section className="relative overflow-hidden bg-slate-950 text-white" data-hero-mode={mode}>
        <div
          className="absolute -right-20 top-0 h-full w-1/2 skew-x-[-12deg] opacity-90"
          style={{ backgroundColor: theme.primaryColor }}
        />
        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-10 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/50">{label}</p>
            <h1 className="mt-4 text-5xl font-black leading-[0.95] md:text-6xl">{heading}</h1>
            <p className="mt-6 text-lg text-white/80">{subheading}</p>
            <CtaRow slug={slug} theme={theme} phone={site.phone} ctaButton={ctaButton} light />
          </div>
          <div className="relative min-h-[280px] overflow-hidden rounded-sm border border-white/20">
            {heroImage ? (
              <SiteImage src={heroImage} alt="" fill className="object-cover" sizes="50vw" />
            ) : (
              <div className="flex h-full min-h-[280px] items-center justify-center bg-white/10 p-8 text-center">
                <p className="text-3xl font-black">
                  {site.city}, {site.state}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (mode === 'checklist-hero') {
    const checks = [`Serving ${site.city}`, `${site.industry} specialists`, 'Fast local response'];
    return (
      <section className="border-b border-slate-200 bg-white" data-hero-mode={mode}>
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: theme.accentColor }}>
              {label}
            </p>
            <h1 className="mt-4 text-4xl font-black text-slate-900 md:text-5xl">{heading}</h1>
            <p className="mt-4 text-lg text-slate-600">{subheading}</p>
            <ul className="mt-8 space-y-3">
              {checks.map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm font-semibold text-slate-800">
                  <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: theme.accentColor }} />
                  {item}
                </li>
              ))}
            </ul>
            <CtaRow slug={slug} theme={theme} phone={site.phone} ctaButton={ctaButton} />
          </div>
          <div className="relative min-h-[320px] overflow-hidden" style={{ borderRadius: 'var(--design-card-radius)' }}>
            {heroImage ? (
              <SiteImage src={heroImage} alt="" fill className="object-cover" sizes="50vw" />
            ) : (
              <div className="h-full min-h-[320px]" style={{ backgroundColor: theme.primaryColor }} />
            )}
          </div>
        </div>
      </section>
    );
  }

  if (mode === 'editorial-story' || mode === 'editorial-wide-image' || mode === 'editorial-quote') {
    return (
      <section className="bg-[#fffdf8] px-4 pb-16 pt-20 sm:px-6 lg:px-8" data-hero-mode={mode}>
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.3em]" style={{ color: theme.accentColor }}>
            {mode === 'editorial-quote' ? 'Client-first story' : site.businessName}
          </p>
          {mode === 'editorial-quote' ? (
            <blockquote className="mt-8 font-serif text-3xl font-medium leading-snug text-gray-900 md:text-5xl">
              “{heading}”
            </blockquote>
          ) : (
            <h1 className="mt-8 font-serif text-4xl font-medium leading-[1.15] text-gray-900 md:text-6xl">
              {heading}
            </h1>
          )}
          <p className="mx-auto mt-8 max-w-xl text-lg leading-relaxed text-gray-600">{subheading}</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href={`/${slug}/contact`}
              className="inline-flex border border-gray-900 px-8 py-3 text-sm font-medium text-gray-900 transition hover:bg-gray-900 hover:text-white"
            >
              {ctaButton}
            </Link>
            {site.phone ? (
              <a href={`tel:${site.phone}`} className="text-sm text-gray-600 underline-offset-4 hover:underline">
                {site.phone}
              </a>
            ) : null}
          </div>
        </div>
        {(mode === 'editorial-wide-image' || heroImage) && heroImage ? (
          <div
            className={clsx(
              'relative mx-auto mt-14 w-full overflow-hidden',
              mode === 'editorial-wide-image' ? 'aspect-[21/9] max-w-6xl' : 'aspect-[16/9] max-w-5xl',
            )}
          >
            <SiteImage src={heroImage} alt={site.businessName} fill className="object-cover" sizes="1024px" />
          </div>
        ) : null}
      </section>
    );
  }

  if (mode === 'magazine-cover') {
    return (
      <section className="relative min-h-[90dvh] overflow-hidden bg-black text-white" data-hero-mode={mode}>
        {heroImage ? (
          <div className="absolute inset-0 opacity-70">
            <LcpHeroImage src={heroImage} alt="" />
          </div>
        ) : (
          <div className="absolute inset-0" style={{ backgroundColor: theme.primaryColor }} />
        )}
        <div className="relative z-10 mx-auto flex min-h-[90dvh] max-w-5xl flex-col justify-end px-4 pb-16 pt-28 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-white/70">{label}</p>
          <h1 className="mt-4 max-w-3xl font-serif text-5xl leading-none md:text-7xl">{heading}</h1>
          <p className="mt-6 max-w-xl text-lg text-white/85">{subheading}</p>
          <CtaRow slug={slug} theme={theme} phone={site.phone} ctaButton={ctaButton} light />
        </div>
      </section>
    );
  }

  if (mode === 'minimal-type') {
    return (
      <section className="border-b border-stone-200 bg-[#faf8f5] px-4 py-24 sm:px-6 lg:px-8" data-hero-mode={mode}>
        <div className="mx-auto max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.4em] text-stone-500">{label}</p>
          <h1 className="mt-10 text-4xl font-light leading-tight tracking-tight text-stone-900 md:text-6xl">
            {heading}
          </h1>
          <p className="mt-8 text-base leading-8 text-stone-600">{subheading}</p>
          <Link
            href={`/${slug}/contact`}
            className="mt-12 inline-block border-b border-stone-900 pb-1 text-sm font-medium tracking-wide text-stone-900"
          >
            {ctaButton} →
          </Link>
        </div>
      </section>
    );
  }

  if (mode === 'utility-dashboard' || mode === 'utility-banner' || mode === 'utility-split-info') {
    return (
      <section className="border-b border-slate-200 bg-slate-50" data-hero-mode={mode}>
        {(mode === 'utility-banner' || site.phone) && site.phone ? (
          <div
            className="px-4 py-2 text-center text-sm font-semibold text-white"
            style={{ backgroundColor: theme.primaryColor }}
          >
            Need help now? Call {site.phone}
          </div>
        ) : null}
        <div
          className={clsx(
            'mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:px-8 lg:py-12',
            mode === 'utility-split-info' || mode === 'utility-dashboard'
              ? 'lg:grid-cols-[1fr_320px]'
              : 'lg:grid-cols-1',
          )}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {label} · {site.city}, {site.state}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">{heading}</h1>
            <p className="mt-3 max-w-2xl text-base text-slate-600">{subheading}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/${slug}/contact`}
                className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold text-white"
                style={{
                  backgroundColor: theme.accentColor,
                  borderRadius: 'var(--design-button-radius)',
                }}
              >
                {ctaButton}
              </Link>
              <Link
                href={`/${slug}/services`}
                className="inline-flex items-center justify-center border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800"
                style={{ borderRadius: 'var(--design-button-radius)' }}
              >
                View services
              </Link>
            </div>
          </div>
          {mode !== 'utility-banner' ? (
            <aside className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Quick info</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li>
                  <span className="font-semibold">Area:</span> {site.city}, {site.state}
                </li>
                {site.phone ? (
                  <li>
                    <span className="font-semibold">Phone:</span>{' '}
                    <a href={`tel:${site.phone}`} className="underline">
                      {site.phone}
                    </a>
                  </li>
                ) : null}
                {site.email ? (
                  <li>
                    <span className="font-semibold">Email:</span>{' '}
                    <a href={`mailto:${site.email}`} className="underline">
                      {site.email}
                    </a>
                  </li>
                ) : null}
              </ul>
            </aside>
          ) : null}
        </div>
      </section>
    );
  }

  if (mode === 'split-left-image' || mode === 'split-right-image' || mode === 'split-asymmetric' || mode === 'card-float') {
    const imageLeft = mode === 'split-right-image';
    const asymmetric = mode === 'split-asymmetric';
    const floating = mode === 'card-float';

    return (
      <section className={clsx(floating ? 'bg-slate-100 py-10' : 'bg-white')} data-hero-mode={mode}>
        <div
          className={clsx(
            'mx-auto grid max-w-[1400px]',
            floating ? 'gap-6 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8' : 'lg:grid-cols-2',
            asymmetric && 'lg:grid-cols-[0.9fr_1.1fr]',
            !floating && 'min-h-[85dvh]',
          )}
        >
          <div
            className={clsx(
              'flex flex-col justify-center',
              floating
                ? 'rounded-2xl bg-white p-8 shadow-xl sm:p-12'
                : 'px-6 py-20 sm:px-10 lg:px-16',
              imageLeft && 'lg:order-2',
            )}
          >
            <p className="text-sm font-semibold" style={{ color: theme.accentColor }}>
              {label}
            </p>
            <h1 className="mt-4 text-5xl font-extrabold leading-[1.05] tracking-tight text-gray-900 md:text-6xl">
              {heading}
            </h1>
            <p className="mt-6 max-w-md text-lg text-gray-600">{subheading}</p>
            <CtaRow slug={slug} theme={theme} phone={site.phone} ctaButton={ctaButton} />
          </div>
          <div
            className={clsx(
              'relative min-h-[320px]',
              floating && 'overflow-hidden rounded-2xl shadow-lg',
              imageLeft && 'lg:order-1',
            )}
          >
            {heroImage ? (
              <SiteImage
                src={heroImage}
                alt={site.businessName}
                fill
                className="object-cover object-center"
                sizes="50vw"
                fallback={<div className="h-full w-full" style={{ backgroundColor: theme.primaryColor }} />}
              />
            ) : (
              <div
                className="flex h-full min-h-[420px] items-center justify-center p-10 text-center text-white"
                style={{
                  background: `linear-gradient(145deg, ${theme.primaryColor}, ${darkenHex(theme.primaryColor, 0.3)})`,
                }}
              >
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] opacity-70">Serving</p>
                  <p className="mt-3 text-4xl font-extrabold">
                    {site.city}, {site.state}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  // classic-left | classic-center | classic-compact (default)
  const heroDark = theme.heroStyle === 'dark';
  const heroBg = heroDark
    ? `linear-gradient(135deg, ${theme.primaryColor}, ${darkenHex(theme.primaryColor, 0.2)})`
    : theme.secondaryColor;
  const heroText = heroDark ? '#FFFFFF' : getTextColor(theme.secondaryColor);
  const centered = mode === 'classic-center';
  const compact = mode === 'classic-compact';

  return (
    <section
      className={clsx('relative flex items-center overflow-hidden', compact ? 'min-h-[70dvh]' : 'min-h-[100dvh]')}
      style={heroImage ? { color: '#FFFFFF' } : { background: heroBg, color: heroText }}
      data-hero-mode={mode}
    >
      {heroImage ? (
        <>
          <div className="absolute inset-0">
            <LcpHeroImage src={heroImage} alt={`${site.businessName} hero background`} />
          </div>
          <div
            className="absolute inset-0"
            style={{ backgroundColor: colorWithOpacity(theme.primaryColor, 0.7) }}
          />
        </>
      ) : (
        <div className={heroDark ? 'hero-pattern absolute inset-0' : 'hero-pattern-light absolute inset-0'} />
      )}
      <div
        className={clsx(
          'relative z-10 mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 lg:px-8',
          centered && 'text-center',
        )}
      >
        <p
          className={clsx(
            'mb-4 text-xs font-semibold uppercase tracking-[0.25em] opacity-70',
            centered && 'mx-auto',
          )}
        >
          {label}
        </p>
        <div className={clsx(centered ? 'mx-auto max-w-3xl' : 'max-w-3xl')}>
          <h1 className="text-5xl font-black leading-tight tracking-tight md:text-7xl">{heading}</h1>
          <p className="mt-6 text-xl opacity-80 md:text-2xl">{subheading}</p>
          <CtaRow
            slug={slug}
            theme={theme}
            phone={site.phone}
            ctaButton={ctaButton}
            light={Boolean(heroImage)}
            centered={centered}
          />
        </div>
      </div>
    </section>
  );
}
