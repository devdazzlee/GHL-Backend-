import type { CSSProperties } from 'react';
import type { DesignPreset, Density, RadiusScale } from '@/src/designs/presets';

/** Family-level visual system — must look unmistakably different site-wide. */
export function familySkinVars(family: DesignPreset['family']): CSSProperties {
  switch (family) {
    case 'split':
      return {
        '--skin-section-y': '5.5rem',
        '--skin-heading-weight': '800',
        '--skin-heading-tracking': '-0.045em',
        '--skin-card-pad': '1.75rem',
        '--skin-rule': '2px',
        '--skin-surface': '#fafafa',
        '--skin-contrast-block': '0',
      } as CSSProperties;
    case 'bold':
      return {
        '--skin-section-y': '4.5rem',
        '--skin-heading-weight': '900',
        '--skin-heading-tracking': '0.04em',
        '--skin-card-pad': '1.5rem',
        '--skin-rule': '6px',
        '--skin-surface': '#0f172a',
        '--skin-contrast-block': '1',
      } as CSSProperties;
    case 'editorial':
      return {
        '--skin-section-y': '6.5rem',
        '--skin-heading-weight': '500',
        '--skin-heading-tracking': '-0.015em',
        '--skin-card-pad': '2rem',
        '--skin-rule': '1px',
        '--skin-surface': '#fffdf8',
        '--skin-contrast-block': '0',
      } as CSSProperties;
    case 'utility':
      return {
        '--skin-section-y': '2.75rem',
        '--skin-heading-weight': '700',
        '--skin-heading-tracking': '0',
        '--skin-card-pad': '1rem',
        '--skin-rule': '3px',
        '--skin-surface': '#f1f5f9',
        '--skin-contrast-block': '0',
      } as CSSProperties;
    case 'classic':
    default:
      return {
        '--skin-section-y': '5rem',
        '--skin-heading-weight': '700',
        '--skin-heading-tracking': '-0.02em',
        '--skin-card-pad': '2rem',
        '--skin-rule': '4px',
        '--skin-surface': '#ffffff',
        '--skin-contrast-block': '0',
      } as CSSProperties;
  }
}

export function designCssVarsStrong(
  preset: DesignPreset,
  base: {
    radiusMap: Record<RadiusScale, string>;
    densityPad: Record<Density, string>;
    buttonRadius: string;
  },
): CSSProperties {
  const cardRadius =
    preset.radius === 'full' || preset.radius === 'lg'
      ? preset.family === 'editorial'
        ? '4px'
        : preset.family === 'bold'
          ? '2px'
          : '16px'
      : base.radiusMap[preset.radius];

  return {
    '--design-radius': base.radiusMap[preset.radius],
    '--design-card-radius':
      preset.family === 'bold'
        ? '2px'
        : preset.family === 'editorial'
          ? '2px'
          : preset.family === 'utility'
            ? '6px'
            : cardRadius,
    '--design-button-radius':
      preset.family === 'bold'
        ? '2px'
        : preset.family === 'editorial'
          ? '2px'
          : preset.family === 'utility'
            ? '6px'
            : base.buttonRadius,
    '--design-density': base.densityPad[preset.density],
    '--design-card-shadow':
      preset.family === 'bold'
        ? 'none'
        : preset.family === 'editorial'
          ? 'none'
          : preset.family === 'utility'
            ? '0 1px 2px rgba(15,23,42,0.06)'
            : preset.cardStyle === 'shadow' || preset.cardStyle === 'soft'
              ? '0 10px 30px rgba(15,23,42,0.08)'
              : preset.cardStyle === 'glass'
                ? '0 8px 24px rgba(15,23,42,0.06)'
                : 'none',
    '--design-card-border':
      preset.family === 'bold'
        ? '2px solid rgba(15,23,42,0.9)'
        : preset.family === 'editorial'
          ? '1px solid rgba(15,23,42,0.08)'
          : preset.family === 'utility'
            ? '1px solid rgba(15,23,42,0.12)'
            : preset.cardStyle === 'bordered' || preset.cardStyle === 'sharp'
              ? '1px solid rgba(15,23,42,0.12)'
              : preset.cardStyle === 'glass'
                ? '1px solid rgba(255,255,255,0.35)'
                : '0px solid transparent',
    ...familySkinVars(preset.family),
  } as CSSProperties;
}
