'use client';

import dynamic from 'next/dynamic';

const BackToTop = dynamic(
  () => import('@/src/components/BackToTop').then((m) => m.BackToTop),
  { ssr: false },
);

type BackToTopLazyProps = {
  accentColor: string;
};

export function BackToTopLazy({ accentColor }: BackToTopLazyProps) {
  return <BackToTop accentColor={accentColor} />;
}
