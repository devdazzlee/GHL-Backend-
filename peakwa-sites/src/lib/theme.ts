import type { GeneratedSite, SiteTheme } from './types';

export function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 31, g: 41, b: 55 };
}

export function isLightColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getTextColor(bgHex: string): string {
  const whiteRatio = contrastRatio('#FFFFFF', bgHex);
  const darkRatio = contrastRatio('#111827', bgHex);
  return whiteRatio >= darkRatio ? '#FFFFFF' : '#111827';
}

/** Darkens a brand accent until it meets WCAG AA contrast on the given background. */
export function getAccessibleForeground(
  fgHex: string,
  bgHex: string,
  minRatio = 4.5,
): string {
  if (contrastRatio(fgHex, bgHex) >= minRatio) return fgHex;
  let candidate = fgHex;
  for (let i = 0; i < 48; i++) {
    candidate = darkenHex(candidate, 0.06);
    if (contrastRatio(candidate, bgHex) >= minRatio) return candidate;
  }
  const fallback = getTextColor(bgHex);
  return contrastRatio(fallback, bgHex) >= minRatio ? fallback : '#111827';
}

/** Secondary/muted text on a solid brand background (no opacity hacks). */
export function getMutedTextOnBackground(bgHex: string, minRatio = 4.5): string {
  const primary = getTextColor(bgHex);
  const candidates =
    primary === '#FFFFFF'
      ? ['#F3F4F6', '#E5E7EB', '#FFFFFF']
      : ['#374151', '#1F2937', '#111827'];
  for (const hex of candidates) {
    if (contrastRatio(hex, bgHex) >= minRatio) return hex;
  }
  return primary;
}

export function darkenHex(hex: string, amount = 0.15): string {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 - amount;
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n * factor)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function resolveTheme(site: GeneratedSite): SiteTheme {
  const theme = site.theme ?? {
    primaryColor: site.primaryColor,
    secondaryColor: site.secondaryColor,
    accentColor: site.accentColor,
    heroStyle: site.heroStyle as SiteTheme['heroStyle'],
    fontStyle: site.fontStyle as SiteTheme['fontStyle'],
  };

  return {
    primaryColor: theme.primaryColor || '#1F2937',
    secondaryColor: theme.secondaryColor || '#F3F4F6',
    accentColor: theme.accentColor || '#6366F1',
    heroStyle: theme.heroStyle === 'light' ? 'light' : 'dark',
    fontStyle: theme.fontStyle || 'modern',
  };
}

export function themeCssVars(theme: SiteTheme): Record<string, string> {
  return {
    ['--color-primary' as string]: theme.primaryColor,
    ['--color-secondary' as string]: theme.secondaryColor,
    ['--color-accent' as string]: theme.accentColor,
    ['--color-primary-dark' as string]: darkenHex(theme.primaryColor),
  };
}
