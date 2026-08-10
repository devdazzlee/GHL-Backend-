import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';
import clsx from 'clsx';
import type { GeneratedSite, SiteTheme } from '@/src/lib/types';
import { getMutedTextOnBackground, getTextColor } from '@/src/lib/theme';
import type { FooterStyle } from '@/src/designs/presets';
import { resolveDesignPreset } from '@/src/designs/presets';

type FooterProps = {
  site: GeneratedSite;
  theme: SiteTheme;
  footerStyle?: FooterStyle;
};

type SocialLink = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={clsx('block shrink-0', className)}
      aria-hidden
    >
      {/* Letter "f" only — full circular brand mark was clipping inside the button */}
      <path d="M14.5 8.25V6.4c0-.86.17-1.2 1.4-1.2H17.5V3h-2.4C12.1 3 10.75 4.5 10.75 7.3v.95H8.5V11h2.25v10h3.25V11H16.4l.6-2.75H14.5z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={clsx('block shrink-0', className)}
      aria-hidden
    >
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={clsx('block shrink-0', className)}
      aria-hidden
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function buildSocialLinks(site: GeneratedSite): SocialLink[] {
  return [
    {
      href: site.facebookUrl || '',
      label: 'Facebook',
      icon: <FacebookIcon className="h-5 w-5" />,
    },
    {
      href: site.instagramUrl || '',
      label: 'Instagram',
      icon: <InstagramIcon className="h-5 w-5" />,
    },
    {
      // No dedicated X URL field yet — reuse websiteUrl when set
      href: site.websiteUrl || '',
      label: 'X',
      icon: <XIcon className="h-[18px] w-[18px]" />,
    },
  ];
}

function SocialIconButton({
  href,
  label,
  icon,
  accentColor,
  accentText,
}: SocialLink & { accentColor: string; accentText: string }) {
  const className =
    'inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-full shadow-md transition duration-200';
  const style = { backgroundColor: accentColor, color: accentText };

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        title={label}
        className={`${className} hover:-translate-y-0.5 hover:shadow-lg`}
        style={style}
      >
        {icon}
      </a>
    );
  }

  return (
    <span aria-label={label} title={label} className={`${className} cursor-default opacity-90`} style={style}>
      {icon}
    </span>
  );
}

function IconBadge({
  children,
  accentColor,
  textOnAccent,
}: {
  children: React.ReactNode;
  accentColor: string;
  textOnAccent: string;
}) {
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm"
      style={{ backgroundColor: accentColor, color: textOnAccent }}
    >
      {children}
    </span>
  );
}

export function Footer({ site, theme, footerStyle }: FooterProps) {
  const design = resolveDesignPreset(site.designVariant);
  const style = footerStyle ?? design.footerStyle;
  const textColor = getTextColor(theme.primaryColor);
  const mutedText = getMutedTextOnBackground(theme.primaryColor);
  const accentText = getTextColor(theme.accentColor);
  const base = `/${site.slug}`;
  const socialLinks = buildSocialLinks(site);

  const links = [
    ['Home', base],
    ['About', `${base}/about`],
    ['Services', `${base}/services`],
    ['Blog', `${base}/blog`],
    ['Contact', `${base}/contact`],
  ] as const;

  const poweredBy = (
    <p className="pb-5 text-center text-xs" style={{ color: mutedText }}>
      Powered by{' '}
      <a
        href="https://peakwa.com"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold underline underline-offset-2 transition hover:opacity-90"
        style={{ color: textColor }}
      >
        Peakwa
      </a>
    </p>
  );

  if (style === 'centered') {
    return (
      <footer
        style={{
          backgroundColor: theme.primaryColor,
          color: textColor,
          borderTop: `4px solid ${theme.accentColor}`,
        }}
        data-footer-style={style}
      >
        <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 lg:px-8">
          <p className="text-xl font-bold">{site.businessName}</p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed" style={{ color: mutedText }}>
            Trusted {site.industry} professionals serving {site.city}, {site.state}.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
            {links.map(([label, href]) => (
              <Link key={label} href={href} className="transition hover:opacity-90" style={{ color: mutedText }}>
                {label}
              </Link>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {socialLinks.map((link) => (
              <SocialIconButton
                key={link.label}
                {...link}
                accentColor={theme.accentColor}
                accentText={accentText}
              />
            ))}
          </div>
          {(site.phone || site.email) && (
            <p className="mt-6 text-sm" style={{ color: mutedText }}>
              {[site.phone, site.email].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="border-t border-white/10 py-5 text-center text-xs" style={{ color: mutedText }}>
          © {new Date().getFullYear()} {site.businessName}. All rights reserved.
        </div>
        {poweredBy}
      </footer>
    );
  }

  if (style === 'compact') {
    return (
      <footer
        style={{
          backgroundColor: theme.primaryColor,
          color: textColor,
          borderTop: `3px solid ${theme.accentColor}`,
        }}
        data-footer-style={style}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <p className="font-bold">{site.businessName}</p>
            <p className="text-xs" style={{ color: mutedText }}>
              {site.city}, {site.state}
              {site.phone ? ` · ${site.phone}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            {links.map(([label, href]) => (
              <Link key={label} href={href} style={{ color: mutedText }}>
                {label}
              </Link>
            ))}
          </div>
          <div className="flex gap-2">
            {socialLinks.map((link) => (
              <SocialIconButton
                key={link.label}
                {...link}
                accentColor={theme.accentColor}
                accentText={accentText}
              />
            ))}
          </div>
        </div>
        <div className="border-t border-white/10 py-3 text-center text-xs" style={{ color: mutedText }}>
          © {new Date().getFullYear()} {site.businessName}. Powered by{' '}
          <a href="https://peakwa.com" target="_blank" rel="noopener noreferrer" className="underline">
            Peakwa
          </a>
        </div>
      </footer>
    );
  }

  return (
    <footer
      style={{
        backgroundColor: theme.primaryColor,
        color: textColor,
        borderTop: `4px solid ${theme.accentColor}`,
      }}
      data-footer-style={style}
    >
      <div
        className={clsx(
          'mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:px-8',
          'md:grid-cols-3',
        )}
      >
        <div>
          <p className="text-xl font-bold">{site.businessName}</p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed" style={{ color: mutedText }}>
            Trusted {site.industry} professionals serving {site.city}, {site.state} and surrounding
            communities.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {socialLinks.map((link) => (
              <SocialIconButton
                key={link.label}
                {...link}
                accentColor={theme.accentColor}
                accentText={accentText}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: mutedText }}>
            Quick Links
          </p>
          <ul className="space-y-2.5 text-sm">
            {links.map(([label, href]) => (
              <li key={label}>
                <Link href={href} className="transition hover:opacity-90" style={{ color: mutedText }}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: mutedText }}>
            Contact
          </p>
          <ul className="space-y-4 text-sm">
            {site.phone ? (
              <li className="flex items-center gap-3">
                <IconBadge accentColor={theme.accentColor} textOnAccent={accentText}>
                  <Phone className="h-[18px] w-[18px]" strokeWidth={2} />
                </IconBadge>
                <a href={`tel:${site.phone}`} style={{ color: mutedText }}>
                  {site.phone}
                </a>
              </li>
            ) : null}
            {site.email ? (
              <li className="flex items-center gap-3">
                <IconBadge accentColor={theme.accentColor} textOnAccent={accentText}>
                  <Mail className="h-[18px] w-[18px]" strokeWidth={2} />
                </IconBadge>
                <a href={`mailto:${site.email}`} className="break-all" style={{ color: mutedText }}>
                  {site.email}
                </a>
              </li>
            ) : null}
            <li className="flex items-center gap-3">
              <IconBadge accentColor={theme.accentColor} textOnAccent={accentText}>
                <MapPin className="h-[18px] w-[18px]" strokeWidth={2} />
              </IconBadge>
              <span style={{ color: mutedText }}>
                {site.city}, {site.state}
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10 py-5 text-center text-xs" style={{ color: mutedText }}>
        © {new Date().getFullYear()} {site.businessName}. All rights reserved.
      </div>
      {poweredBy}
    </footer>
  );
}
