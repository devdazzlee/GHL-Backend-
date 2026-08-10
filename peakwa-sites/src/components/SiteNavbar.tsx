'use client';

import dynamic from 'next/dynamic';
import type { GeneratedSite, LocationPage, SiteTheme } from '@/src/lib/types';
import type { ServicesContent } from '@/src/lib/content';
import type { NavStyle } from '@/src/designs/presets';

const Navbar = dynamic(
  () => import('@/src/components/Navbar').then((m) => m.Navbar),
  {
    ssr: true,
    loading: () => <header className="h-[72px] shrink-0 border-b border-gray-100 bg-white" />,
  },
);

type SiteNavbarProps = {
  site: GeneratedSite;
  theme: SiteTheme;
  servicesContent: ServicesContent;
  locations: LocationPage[];
  navStyle?: NavStyle;
};

export function SiteNavbar(props: SiteNavbarProps) {
  return <Navbar {...props} />;
}
