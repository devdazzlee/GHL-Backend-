import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';
import type { GeneratedSite, SiteTheme } from '@/src/lib/types';
import { getMutedTextOnBackground, getTextColor } from '@/src/lib/theme';

type FooterProps = {
  site: GeneratedSite;
  theme: SiteTheme;
};

type SocialLink = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function WebsiteIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function buildSocialLinks(site: GeneratedSite): SocialLink[] {
  return [
    {
      href: site.facebookUrl || '',
      label: 'Facebook',
      icon: <FacebookIcon className="h-[18px] w-[18px]" />,
    },
    {
      href: site.instagramUrl || '',
      label: 'Instagram',
      icon: <InstagramIcon className="h-[18px] w-[18px]" />,
    },
    {
      href: site.websiteUrl || '',
      label: 'Website',
      icon: <WebsiteIcon className="h-[18px] w-[18px]" />,
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
    'flex h-10 w-10 items-center justify-center rounded-full shadow-md transition duration-200';
  const style = { backgroundColor: accentColor, color: accentText };

  // Always show the icon. When a URL is set, make it a real outbound link;
  // otherwise render a non-interactive badge so the footer still looks complete.
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
    <span
      aria-label={label}
      title={label}
      className={`${className} cursor-default opacity-90`}
      style={style}
    >
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

export function Footer({ site, theme }: FooterProps) {
  const textColor = getTextColor(theme.primaryColor);
  const mutedText = getMutedTextOnBackground(theme.primaryColor);
  const accentText = getTextColor(theme.accentColor);
  const base = `/${site.slug}`;
  const socialLinks = buildSocialLinks(site);

  return (
    <footer
      style={{
        backgroundColor: theme.primaryColor,
        color: textColor,
        borderTop: `4px solid ${theme.accentColor}`,
      }}
    >
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3 lg:px-8">
        <div>
          <p className="text-xl font-bold">{site.businessName}</p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed" style={{ color: mutedText }}>
            Trusted {site.industry} professionals serving {site.city}, {site.state} and
            surrounding communities.
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
          <p
            className="mb-4 text-sm font-semibold uppercase tracking-wide"
            style={{ color: mutedText }}
          >
            Quick Links
          </p>
          <ul className="space-y-2.5 text-sm">
            {[
              ['Home', base],
              ['About', `${base}/about`],
              ['Services', `${base}/services`],
              ['Blog', `${base}/blog`],
              ['Contact', `${base}/contact`],
            ].map(([label, href]) => (
              <li key={label}>
                <Link
                  href={href}
                  className="transition hover:opacity-90"
                  style={{ color: mutedText }}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p
            className="mb-4 text-sm font-semibold uppercase tracking-wide"
            style={{ color: mutedText }}
          >
            Contact
          </p>
          <ul className="space-y-4 text-sm">
            {site.phone ? (
              <li className="flex items-center gap-3">
                <IconBadge accentColor={theme.accentColor} textOnAccent={accentText}>
                  <Phone className="h-[18px] w-[18px]" strokeWidth={2} />
                </IconBadge>
                <a
                  href={`tel:${site.phone}`}
                  className="transition hover:opacity-90"
                  style={{ color: mutedText }}
                >
                  {site.phone}
                </a>
              </li>
            ) : null}
            {site.email ? (
              <li className="flex items-center gap-3">
                <IconBadge accentColor={theme.accentColor} textOnAccent={accentText}>
                  <Mail className="h-[18px] w-[18px]" strokeWidth={2} />
                </IconBadge>
                <a
                  href={`mailto:${site.email}`}
                  className="break-all transition hover:opacity-90"
                  style={{ color: mutedText }}
                >
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

      <div
        className="border-t border-white/10 py-5 text-center text-xs"
        style={{ color: mutedText }}
      >
        © {new Date().getFullYear()} {site.businessName}. All rights reserved.
      </div>

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
    </footer>
  );
}
