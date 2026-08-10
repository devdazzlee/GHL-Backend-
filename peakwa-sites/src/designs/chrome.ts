import type { CSSProperties } from 'react';
import type { DesignPreset } from '@/src/designs/presets';
import { resolveDesignPreset } from '@/src/designs/presets';

export function getDesign(designVariant?: number | null): DesignPreset {
  return resolveDesignPreset(designVariant);
}

export function sectionPadClass(design: DesignPreset): string {
  if (design.density === 'airy') return 'py-24 md:py-32';
  if (design.density === 'compact') return 'py-12 md:py-16';
  return 'py-20';
}

export function heroBannerProps(design: DesignPreset) {
  return {
    compact: design.heroLayout === 'compact' || design.family === 'utility',
    centered:
      design.heroLayout === 'fullBleedCentered' ||
      design.navStyle === 'centered' ||
      design.family === 'editorial',
  };
}

export function cardChromeStyle(): CSSProperties {
  return {
    borderRadius: 'var(--design-card-radius)',
    boxShadow: 'var(--design-card-shadow)',
    border: 'var(--design-card-border)',
  };
}

export function buttonRadiusStyle(): CSSProperties {
  return { borderRadius: 'var(--design-button-radius)' };
}

export function headingAlignClass(design: DesignPreset): string {
  if (
    design.family === 'editorial' ||
    design.navStyle === 'centered' ||
    design.heroLayout === 'fullBleedCentered'
  ) {
    return 'text-center';
  }
  if (design.family === 'utility') return 'text-left';
  return 'text-center';
}

export function contentMaxClass(design: DesignPreset): string {
  if (design.family === 'editorial') return 'mx-auto max-w-3xl';
  if (design.family === 'utility') return 'mx-auto max-w-5xl';
  return 'mx-auto max-w-4xl';
}

export function valuesGridClass(design: DesignPreset): string {
  if (design.servicesLayout === 'listRows' || design.family === 'utility') {
    return 'grid gap-4 md:grid-cols-1';
  }
  if (design.servicesLayout === 'grid2') return 'grid gap-6 md:grid-cols-2';
  return 'grid gap-6 md:grid-cols-3';
}

export function sectionBg(
  design: DesignPreset,
  role: 'plain' | 'soft' | 'bold' | 'alt',
  theme: { primaryColor: string; secondaryColor: string },
): string {
  if (role === 'bold' || (role === 'alt' && design.sectionRhythm === 'boldBands')) {
    return theme.primaryColor;
  }
  if (role === 'soft' || design.sectionRhythm === 'alternating') {
    return theme.secondaryColor;
  }
  return '#fff';
}
