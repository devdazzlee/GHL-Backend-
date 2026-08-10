'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Menu, Phone, X } from 'lucide-react';
import clsx from 'clsx';
import type { GeneratedSite, LocationPage, SiteTheme } from '@/src/lib/types';
import type { ServicesContent } from '@/src/lib/content';
import { getTextColor } from '@/src/lib/theme';
import type { NavStyle } from '@/src/designs/presets';

type NavbarProps = {
  site: GeneratedSite;
  theme: SiteTheme;
  servicesContent: ServicesContent;
  locations: LocationPage[];
  navStyle?: NavStyle;
};

const NAV_LINKS = [
  { href: '', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/services', label: 'Services' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Contact' },
] as const;

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function Navbar({
  site,
  theme,
  servicesContent,
  locations,
  navStyle = 'solid',
}: NavbarProps) {
  const pathname = usePathname();
  const base = `/${site.slug}`;
  const [open, setOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [locationsOpen, setLocationsOpen] = useState(false);

  const services = servicesContent.services ?? [];
  const dropdownServices = services.length > 8 ? services.slice(0, 8) : services;
  const showViewAllServices = services.length > 8;

  const inverted = navStyle === 'transparent';
  const phoneFirst = navStyle === 'phoneFirst';
  const centered = navStyle === 'centered';

  const headerBg = inverted
    ? theme.primaryColor
    : phoneFirst
      ? theme.secondaryColor
      : 'rgba(255,255,255,0.92)';
  const linkColor = inverted ? 'rgba(255,255,255,0.85)' : '#4b5563';
  const linkActive = inverted ? '#ffffff' : '#111827';
  const brandColor = inverted ? '#ffffff' : '#111827';

  function isActive(href: string) {
    if (href === '') return pathname === base || pathname === `${base}/`;
    return pathname.startsWith(`${base}${href}`);
  }

  const desktopLinks = (
    <nav
      className={clsx(
        'hidden items-center gap-6 lg:flex',
        centered && 'justify-center',
      )}
    >
      {NAV_LINKS.map((link) => {
        if (link.label === 'Services' && services.length > 0) {
          return (
            <div key={link.label} className="relative group">
              <button
                type="button"
                className="flex items-center gap-1 text-sm font-medium transition-colors"
                style={{ color: isActive(link.href) ? linkActive : linkColor }}
              >
                Services
                <ChevronDown className="h-4 w-4" />
              </button>
              <div className="invisible absolute left-0 top-full z-50 min-w-[220px] rounded-[var(--design-card-radius)] border border-gray-100 bg-white py-2 opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100">
                {dropdownServices.map((s) => (
                  <Link
                    key={s.title}
                    href={`${base}/services/${slugify(s.title || '')}`}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {s.title}
                  </Link>
                ))}
                {showViewAllServices ? (
                  <Link
                    href={`${base}/services`}
                    className="block border-t border-gray-100 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
                    style={{ color: theme.accentColor }}
                  >
                    View All
                  </Link>
                ) : null}
              </div>
            </div>
          );
        }

        return (
          <Link
            key={link.label}
            href={`${base}${link.href}`}
            className="text-sm font-medium transition-colors"
            style={{
              color: isActive(link.href) ? linkActive : linkColor,
              borderBottom: isActive(link.href) ? `2px solid ${theme.accentColor}` : undefined,
              paddingBottom: isActive(link.href) ? 2 : undefined,
            }}
          >
            {link.label}
          </Link>
        );
      })}

      {locations.length > 0 ? (
        <div className="relative group">
          <button
            type="button"
            className="flex items-center gap-1 text-sm font-medium"
            style={{ color: linkColor }}
          >
            Locations
            <ChevronDown className="h-4 w-4" />
          </button>
          <div className="invisible absolute left-0 top-full z-50 min-w-[200px] rounded-[var(--design-card-radius)] border border-gray-100 bg-white py-2 opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100">
            {locations.map((loc) => (
              <Link
                key={loc.id}
                href={`${base}/${loc.slug}`}
                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {loc.city}, {loc.county}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </nav>
  );

  const phoneBtn = site.phone ? (
    <a
      href={`tel:${site.phone}`}
      className={clsx(
        'hidden items-center gap-2 px-4 py-2 text-sm font-semibold shadow-sm transition hover:opacity-90 lg:inline-flex',
        phoneFirst && 'order-first text-base',
      )}
      style={{
        backgroundColor: theme.accentColor,
        color: getTextColor(theme.accentColor),
        borderRadius: 'var(--design-button-radius)',
      }}
    >
      <Phone className="h-4 w-4" />
      {site.phone}
    </a>
  ) : null;

  return (
    <header
      className={clsx(
        'sticky top-0 z-50 backdrop-blur-md',
        inverted ? 'border-b border-white/10' : 'border-b border-black/5',
        phoneFirst && 'border-b-2',
      )}
      style={{
        backgroundColor: headerBg,
        borderBottomColor: phoneFirst ? theme.accentColor : undefined,
      }}
      data-nav-style={navStyle}
    >
      {phoneFirst && site.phone ? (
        <div
          className="hidden border-b px-4 py-1.5 text-center text-xs font-semibold sm:block"
          style={{
            backgroundColor: theme.primaryColor,
            color: getTextColor(theme.primaryColor),
            borderColor: 'transparent',
          }}
        >
          Call now: {site.phone} · Serving {site.city}, {site.state}
        </div>
      ) : null}

      {centered ? (
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              className="inline-flex rounded-lg border p-2 lg:hidden"
              style={{ borderColor: inverted ? 'rgba(255,255,255,0.3)' : '#e5e7eb' }}
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {open ? (
                <X className="h-5 w-5" style={{ color: brandColor }} />
              ) : (
                <Menu className="h-5 w-5" style={{ color: brandColor }} />
              )}
            </button>
            <Link href={base} className="mx-auto flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: theme.accentColor }}
              />
              <span className="truncate text-lg font-bold tracking-tight" style={{ color: brandColor }}>
                {site.businessName}
              </span>
            </Link>
            <div className="hidden lg:block">{phoneBtn}</div>
            <div className="w-9 lg:hidden" />
          </div>
          <div className="mt-3 hidden justify-center border-t border-black/5 pt-3 lg:flex">
            {desktopLinks}
          </div>
        </div>
      ) : (
        <div
          className={clsx(
            'mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8',
            phoneFirst && 'flex-row-reverse lg:flex-row',
          )}
        >
          <Link href={base} className="flex min-w-0 items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: theme.accentColor }}
            />
            <span className="truncate text-lg font-bold tracking-tight" style={{ color: brandColor }}>
              {site.businessName}
            </span>
          </Link>

          {desktopLinks}
          {phoneBtn}

          <button
            type="button"
            className="inline-flex rounded-lg border p-2 lg:hidden"
            style={{ borderColor: inverted ? 'rgba(255,255,255,0.3)' : '#e5e7eb' }}
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? (
              <X className="h-5 w-5" style={{ color: brandColor }} />
            ) : (
              <Menu className="h-5 w-5" style={{ color: brandColor }} />
            )}
          </button>
        </div>
      )}

      {open ? (
        <div
          className="border-t px-4 py-4 lg:hidden"
          style={{
            backgroundColor: inverted ? theme.primaryColor : '#ffffff',
            borderColor: inverted ? 'rgba(255,255,255,0.1)' : '#f3f4f6',
          }}
        >
          <div className="flex flex-col gap-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={`${base}${link.href}`}
                className="rounded-lg px-3 py-2 text-sm font-medium"
                style={{ color: brandColor }}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {services.length > 0 ? (
              <button
                type="button"
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium"
                style={{ color: brandColor }}
                onClick={() => setServicesOpen((v) => !v)}
              >
                Services
                <ChevronDown className={clsx('h-4 w-4 transition', servicesOpen && 'rotate-180')} />
              </button>
            ) : null}
            {servicesOpen
              ? dropdownServices.map((s) => (
                  <Link
                    key={s.title}
                    href={`${base}/services/${slugify(s.title || '')}`}
                    className="rounded-lg px-6 py-2 text-sm opacity-80"
                    style={{ color: brandColor }}
                    onClick={() => setOpen(false)}
                  >
                    {s.title}
                  </Link>
                ))
              : null}
            {locations.length > 0 ? (
              <>
                <button
                  type="button"
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium"
                  style={{ color: brandColor }}
                  onClick={() => setLocationsOpen((v) => !v)}
                >
                  Locations
                  <ChevronDown
                    className={clsx('h-4 w-4 transition', locationsOpen && 'rotate-180')}
                  />
                </button>
                {locationsOpen
                  ? locations.map((loc) => (
                      <Link
                        key={loc.id}
                        href={`${base}/${loc.slug}`}
                        className="rounded-lg px-6 py-2 text-sm opacity-80"
                        style={{ color: brandColor }}
                        onClick={() => setOpen(false)}
                      >
                        {loc.city}
                      </Link>
                    ))
                  : null}
              </>
            ) : null}
            {site.phone ? (
              <a
                href={`tel:${site.phone}`}
                className="mt-2 inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold"
                style={{
                  backgroundColor: theme.accentColor,
                  color: getTextColor(theme.accentColor),
                  borderRadius: 'var(--design-button-radius)',
                }}
              >
                <Phone className="h-4 w-4" />
                {site.phone}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}
