import type { CSSProperties } from 'react';
import { designCssVarsStrong } from '@/src/designs/familySkin';
import { getDesignRecipe, type SurfaceTone } from '@/src/designs/catalog';

export const DESIGN_VARIANT_COUNT = 50;

export type NavStyle = 'solid' | 'transparent' | 'centered' | 'phoneFirst';
export type HeroLayout =
  | 'fullBleedLeft'
  | 'fullBleedCentered'
  | 'splitLeft'
  | 'splitRight'
  | 'overlayBold'
  | 'formSidebar'
  | 'compact';
export type ServicesLayout = 'grid3' | 'grid2' | 'iconLeft' | 'listRows' | 'megaTiles' | 'softCards';
export type FooterStyle = 'multiColumn' | 'compact' | 'centered';
export type SectionRhythm = 'classic' | 'alternating' | 'airy' | 'dense' | 'boldBands';
export type CardStyle = 'shadow' | 'bordered' | 'soft' | 'sharp' | 'glass';
export type ButtonShape = 'pill' | 'rounded' | 'square';
export type Density = 'airy' | 'normal' | 'compact';
export type RadiusScale = 'none' | 'sm' | 'md' | 'lg' | 'full';

export type DesignPreset = {
  id: number;
  name: string;
  family: 'classic' | 'split' | 'bold' | 'editorial' | 'utility';
  navStyle: NavStyle;
  heroLayout: HeroLayout;
  servicesLayout: ServicesLayout;
  footerStyle: FooterStyle;
  sectionRhythm: SectionRhythm;
  cardStyle: CardStyle;
  buttonShape: ButtonShape;
  density: Density;
  radius: RadiusScale;
  proofFirst: boolean;
  stickyCallBar: boolean;
};

function preset(
  id: number,
  name: string,
  family: DesignPreset['family'],
  partial: Omit<DesignPreset, 'id' | 'name' | 'family'>,
): DesignPreset {
  return { id, name, family, ...partial };
}

const classicBase = {
  navStyle: 'solid' as const,
  heroLayout: 'fullBleedLeft' as const,
  servicesLayout: 'grid3' as const,
  footerStyle: 'multiColumn' as const,
  sectionRhythm: 'classic' as const,
  cardStyle: 'shadow' as const,
  buttonShape: 'pill' as const,
  density: 'normal' as const,
  radius: 'lg' as const,
  proofFirst: false,
  stickyCallBar: false,
};

export const DESIGN_PRESETS: DesignPreset[] = [
  // Family A — Classic (01–10)
  preset(1, 'Classic Current', 'classic', { ...classicBase }),
  preset(2, 'Classic Bordered', 'classic', {
    ...classicBase,
    cardStyle: 'bordered',
    buttonShape: 'rounded',
    radius: 'sm',
    heroLayout: 'fullBleedLeft',
  }),
  preset(3, 'Classic Soft', 'classic', {
    ...classicBase,
    cardStyle: 'soft',
    density: 'airy',
    radius: 'full',
  }),
  preset(4, 'Classic Dark Band', 'classic', {
    ...classicBase,
    sectionRhythm: 'boldBands',
    cardStyle: 'bordered',
  }),
  preset(5, 'Classic Centered Hero', 'classic', {
    ...classicBase,
    heroLayout: 'fullBleedCentered',
    navStyle: 'centered',
  }),
  preset(6, 'Classic Image-Right About', 'classic', {
    ...classicBase,
    servicesLayout: 'grid2',
    cardStyle: 'soft',
  }),
  preset(7, 'Classic Icon Row', 'classic', {
    ...classicBase,
    servicesLayout: 'softCards',
    buttonShape: 'rounded',
  }),
  preset(8, 'Classic Alternating', 'classic', {
    ...classicBase,
    sectionRhythm: 'alternating',
    cardStyle: 'bordered',
  }),
  preset(9, 'Classic Compact Nav', 'classic', {
    ...classicBase,
    density: 'compact',
    heroLayout: 'compact',
    navStyle: 'phoneFirst',
  }),
  preset(10, 'Classic Footer Focus', 'classic', {
    ...classicBase,
    servicesLayout: 'grid2',
    footerStyle: 'multiColumn',
  }),

  // Family B — Modern Split (11–20)
  preset(11, 'Split Standard', 'split', {
    navStyle: 'transparent',
    heroLayout: 'splitLeft',
    servicesLayout: 'iconLeft',
    footerStyle: 'compact',
    sectionRhythm: 'classic',
    cardStyle: 'soft',
    buttonShape: 'rounded',
    density: 'normal',
    radius: 'md',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(12, 'Split Reverse', 'split', {
    navStyle: 'transparent',
    heroLayout: 'splitRight',
    servicesLayout: 'grid2',
    footerStyle: 'compact',
    sectionRhythm: 'classic',
    cardStyle: 'shadow',
    buttonShape: 'rounded',
    density: 'normal',
    radius: 'md',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(13, 'Split Floating Card', 'split', {
    navStyle: 'transparent',
    heroLayout: 'formSidebar',
    servicesLayout: 'softCards',
    footerStyle: 'compact',
    sectionRhythm: 'airy',
    cardStyle: 'glass',
    buttonShape: 'pill',
    density: 'airy',
    radius: 'lg',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(14, 'Split Minimal', 'split', {
    navStyle: 'solid',
    heroLayout: 'splitLeft',
    servicesLayout: 'listRows',
    footerStyle: 'centered',
    sectionRhythm: 'airy',
    cardStyle: 'bordered',
    buttonShape: 'square',
    density: 'airy',
    radius: 'none',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(15, 'Split Asymmetric', 'split', {
    navStyle: 'transparent',
    heroLayout: 'splitLeft',
    servicesLayout: 'grid2',
    footerStyle: 'compact',
    sectionRhythm: 'alternating',
    cardStyle: 'soft',
    buttonShape: 'rounded',
    density: 'normal',
    radius: 'lg',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(16, 'Split Glass', 'split', {
    navStyle: 'transparent',
    heroLayout: 'splitRight',
    servicesLayout: 'softCards',
    footerStyle: 'centered',
    sectionRhythm: 'airy',
    cardStyle: 'glass',
    buttonShape: 'pill',
    density: 'airy',
    radius: 'full',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(17, 'Split Timeline Why', 'split', {
    navStyle: 'solid',
    heroLayout: 'splitLeft',
    servicesLayout: 'iconLeft',
    footerStyle: 'compact',
    sectionRhythm: 'classic',
    cardStyle: 'bordered',
    buttonShape: 'rounded',
    density: 'normal',
    radius: 'sm',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(18, 'Split Map Accent', 'split', {
    navStyle: 'transparent',
    heroLayout: 'splitLeft',
    servicesLayout: 'grid3',
    footerStyle: 'multiColumn',
    sectionRhythm: 'classic',
    cardStyle: 'shadow',
    buttonShape: 'rounded',
    density: 'normal',
    radius: 'md',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(19, 'Split Dual CTA', 'split', {
    navStyle: 'phoneFirst',
    heroLayout: 'splitLeft',
    servicesLayout: 'grid3',
    footerStyle: 'compact',
    sectionRhythm: 'boldBands',
    cardStyle: 'shadow',
    buttonShape: 'pill',
    density: 'normal',
    radius: 'lg',
    proofFirst: false,
    stickyCallBar: true,
  }),
  preset(20, 'Split Magazine', 'split', {
    navStyle: 'centered',
    heroLayout: 'splitRight',
    servicesLayout: 'megaTiles',
    footerStyle: 'centered',
    sectionRhythm: 'airy',
    cardStyle: 'soft',
    buttonShape: 'square',
    density: 'airy',
    radius: 'sm',
    proofFirst: false,
    stickyCallBar: false,
  }),

  // Family C — Bold Conversion (21–30)
  preset(21, 'Bold Overlay', 'bold', {
    navStyle: 'transparent',
    heroLayout: 'overlayBold',
    servicesLayout: 'megaTiles',
    footerStyle: 'multiColumn',
    sectionRhythm: 'boldBands',
    cardStyle: 'sharp',
    buttonShape: 'pill',
    density: 'normal',
    radius: 'md',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(22, 'Bold Form Hero', 'bold', {
    navStyle: 'solid',
    heroLayout: 'formSidebar',
    servicesLayout: 'grid3',
    footerStyle: 'compact',
    sectionRhythm: 'boldBands',
    cardStyle: 'bordered',
    buttonShape: 'rounded',
    density: 'normal',
    radius: 'md',
    proofFirst: false,
    stickyCallBar: true,
  }),
  preset(23, 'Bold Banner Strip', 'bold', {
    navStyle: 'phoneFirst',
    heroLayout: 'overlayBold',
    servicesLayout: 'grid2',
    footerStyle: 'multiColumn',
    sectionRhythm: 'boldBands',
    cardStyle: 'sharp',
    buttonShape: 'square',
    density: 'compact',
    radius: 'none',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(24, 'Bold Center Stack', 'bold', {
    navStyle: 'centered',
    heroLayout: 'fullBleedCentered',
    servicesLayout: 'megaTiles',
    footerStyle: 'centered',
    sectionRhythm: 'boldBands',
    cardStyle: 'bordered',
    buttonShape: 'pill',
    density: 'normal',
    radius: 'lg',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(25, 'Bold Chevron', 'bold', {
    navStyle: 'solid',
    heroLayout: 'overlayBold',
    servicesLayout: 'grid3',
    footerStyle: 'compact',
    sectionRhythm: 'alternating',
    cardStyle: 'sharp',
    buttonShape: 'square',
    density: 'normal',
    radius: 'none',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(26, 'Bold Sticky Call', 'bold', {
    navStyle: 'phoneFirst',
    heroLayout: 'fullBleedCentered',
    servicesLayout: 'listRows',
    footerStyle: 'compact',
    sectionRhythm: 'dense',
    cardStyle: 'bordered',
    buttonShape: 'pill',
    density: 'compact',
    radius: 'full',
    proofFirst: false,
    stickyCallBar: true,
  }),
  preset(27, 'Bold Proof First', 'bold', {
    navStyle: 'solid',
    heroLayout: 'overlayBold',
    servicesLayout: 'grid3',
    footerStyle: 'multiColumn',
    sectionRhythm: 'boldBands',
    cardStyle: 'shadow',
    buttonShape: 'rounded',
    density: 'normal',
    radius: 'md',
    proofFirst: true,
    stickyCallBar: false,
  }),
  preset(28, 'Bold Service Mega', 'bold', {
    navStyle: 'transparent',
    heroLayout: 'fullBleedLeft',
    servicesLayout: 'megaTiles',
    footerStyle: 'multiColumn',
    sectionRhythm: 'boldBands',
    cardStyle: 'sharp',
    buttonShape: 'pill',
    density: 'normal',
    radius: 'lg',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(29, 'Bold Dark Soft', 'bold', {
    navStyle: 'solid',
    heroLayout: 'overlayBold',
    servicesLayout: 'softCards',
    footerStyle: 'centered',
    sectionRhythm: 'boldBands',
    cardStyle: 'soft',
    buttonShape: 'rounded',
    density: 'normal',
    radius: 'lg',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(30, 'Bold Checklist', 'bold', {
    navStyle: 'phoneFirst',
    heroLayout: 'fullBleedCentered',
    servicesLayout: 'iconLeft',
    footerStyle: 'compact',
    sectionRhythm: 'classic',
    cardStyle: 'bordered',
    buttonShape: 'rounded',
    density: 'normal',
    radius: 'md',
    proofFirst: true,
    stickyCallBar: true,
  }),

  // Family D — Editorial (31–40)
  preset(31, 'Editorial Story', 'editorial', {
    navStyle: 'centered',
    heroLayout: 'fullBleedCentered',
    servicesLayout: 'softCards',
    footerStyle: 'centered',
    sectionRhythm: 'airy',
    cardStyle: 'soft',
    buttonShape: 'rounded',
    density: 'airy',
    radius: 'lg',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(32, 'Editorial Serif', 'editorial', {
    navStyle: 'centered',
    heroLayout: 'fullBleedLeft',
    servicesLayout: 'grid2',
    footerStyle: 'centered',
    sectionRhythm: 'airy',
    cardStyle: 'bordered',
    buttonShape: 'square',
    density: 'airy',
    radius: 'sm',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(33, 'Editorial Quote', 'editorial', {
    navStyle: 'solid',
    heroLayout: 'fullBleedCentered',
    servicesLayout: 'softCards',
    footerStyle: 'multiColumn',
    sectionRhythm: 'airy',
    cardStyle: 'soft',
    buttonShape: 'pill',
    density: 'airy',
    radius: 'lg',
    proofFirst: true,
    stickyCallBar: false,
  }),
  preset(34, 'Editorial Two-Col', 'editorial', {
    navStyle: 'solid',
    heroLayout: 'splitLeft',
    servicesLayout: 'listRows',
    footerStyle: 'centered',
    sectionRhythm: 'classic',
    cardStyle: 'bordered',
    buttonShape: 'rounded',
    density: 'normal',
    radius: 'md',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(35, 'Editorial Soft Grid', 'editorial', {
    navStyle: 'transparent',
    heroLayout: 'fullBleedCentered',
    servicesLayout: 'grid2',
    footerStyle: 'centered',
    sectionRhythm: 'airy',
    cardStyle: 'soft',
    buttonShape: 'pill',
    density: 'airy',
    radius: 'full',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(36, 'Editorial Team Focus', 'editorial', {
    navStyle: 'centered',
    heroLayout: 'splitRight',
    servicesLayout: 'iconLeft',
    footerStyle: 'multiColumn',
    sectionRhythm: 'classic',
    cardStyle: 'soft',
    buttonShape: 'rounded',
    density: 'normal',
    radius: 'md',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(37, 'Editorial FAQ Lead', 'editorial', {
    navStyle: 'solid',
    heroLayout: 'compact',
    servicesLayout: 'grid3',
    footerStyle: 'compact',
    sectionRhythm: 'classic',
    cardStyle: 'bordered',
    buttonShape: 'rounded',
    density: 'normal',
    radius: 'md',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(38, 'Editorial Local', 'editorial', {
    navStyle: 'phoneFirst',
    heroLayout: 'splitLeft',
    servicesLayout: 'softCards',
    footerStyle: 'multiColumn',
    sectionRhythm: 'alternating',
    cardStyle: 'soft',
    buttonShape: 'pill',
    density: 'normal',
    radius: 'lg',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(39, 'Editorial Polaroid', 'editorial', {
    navStyle: 'centered',
    heroLayout: 'fullBleedLeft',
    servicesLayout: 'megaTiles',
    footerStyle: 'centered',
    sectionRhythm: 'airy',
    cardStyle: 'shadow',
    buttonShape: 'rounded',
    density: 'airy',
    radius: 'sm',
    proofFirst: true,
    stickyCallBar: false,
  }),
  preset(40, 'Editorial Newsletter', 'editorial', {
    navStyle: 'solid',
    heroLayout: 'fullBleedCentered',
    servicesLayout: 'grid2',
    footerStyle: 'compact',
    sectionRhythm: 'airy',
    cardStyle: 'bordered',
    buttonShape: 'square',
    density: 'airy',
    radius: 'none',
    proofFirst: false,
    stickyCallBar: false,
  }),

  // Family E — Utility (41–50)
  preset(41, 'Utility Phone First', 'utility', {
    navStyle: 'phoneFirst',
    heroLayout: 'compact',
    servicesLayout: 'listRows',
    footerStyle: 'compact',
    sectionRhythm: 'dense',
    cardStyle: 'bordered',
    buttonShape: 'rounded',
    density: 'compact',
    radius: 'sm',
    proofFirst: false,
    stickyCallBar: true,
  }),
  preset(42, 'Utility Table Services', 'utility', {
    navStyle: 'phoneFirst',
    heroLayout: 'compact',
    servicesLayout: 'listRows',
    footerStyle: 'compact',
    sectionRhythm: 'dense',
    cardStyle: 'sharp',
    buttonShape: 'square',
    density: 'compact',
    radius: 'none',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(43, 'Utility Dashboard Feel', 'utility', {
    navStyle: 'solid',
    heroLayout: 'compact',
    servicesLayout: 'grid2',
    footerStyle: 'compact',
    sectionRhythm: 'dense',
    cardStyle: 'bordered',
    buttonShape: 'rounded',
    density: 'compact',
    radius: 'md',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(44, 'Utility Sidebar Nav', 'utility', {
    navStyle: 'solid',
    heroLayout: 'splitLeft',
    servicesLayout: 'iconLeft',
    footerStyle: 'multiColumn',
    sectionRhythm: 'dense',
    cardStyle: 'bordered',
    buttonShape: 'square',
    density: 'compact',
    radius: 'sm',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(45, 'Utility Emergency', 'utility', {
    navStyle: 'phoneFirst',
    heroLayout: 'overlayBold',
    servicesLayout: 'listRows',
    footerStyle: 'compact',
    sectionRhythm: 'boldBands',
    cardStyle: 'sharp',
    buttonShape: 'pill',
    density: 'compact',
    radius: 'md',
    proofFirst: false,
    stickyCallBar: true,
  }),
  preset(46, 'Utility Tabs', 'utility', {
    navStyle: 'solid',
    heroLayout: 'compact',
    servicesLayout: 'iconLeft',
    footerStyle: 'compact',
    sectionRhythm: 'classic',
    cardStyle: 'bordered',
    buttonShape: 'rounded',
    density: 'normal',
    radius: 'md',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(47, 'Utility Map Heavy', 'utility', {
    navStyle: 'phoneFirst',
    heroLayout: 'compact',
    servicesLayout: 'grid3',
    footerStyle: 'multiColumn',
    sectionRhythm: 'classic',
    cardStyle: 'shadow',
    buttonShape: 'rounded',
    density: 'normal',
    radius: 'md',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(48, 'Utility FAQ Dense', 'utility', {
    navStyle: 'solid',
    heroLayout: 'compact',
    servicesLayout: 'listRows',
    footerStyle: 'compact',
    sectionRhythm: 'dense',
    cardStyle: 'bordered',
    buttonShape: 'square',
    density: 'compact',
    radius: 'sm',
    proofFirst: false,
    stickyCallBar: false,
  }),
  preset(49, 'Utility Mobile Stack', 'utility', {
    navStyle: 'phoneFirst',
    heroLayout: 'fullBleedCentered',
    servicesLayout: 'softCards',
    footerStyle: 'centered',
    sectionRhythm: 'dense',
    cardStyle: 'soft',
    buttonShape: 'pill',
    density: 'compact',
    radius: 'full',
    proofFirst: false,
    stickyCallBar: true,
  }),
  preset(50, 'Utility Hybrid', 'utility', {
    navStyle: 'phoneFirst',
    heroLayout: 'fullBleedLeft',
    servicesLayout: 'grid3',
    footerStyle: 'multiColumn',
    sectionRhythm: 'boldBands',
    cardStyle: 'shadow',
    buttonShape: 'pill',
    density: 'normal',
    radius: 'lg',
    proofFirst: false,
    stickyCallBar: true,
  }),
];

export function resolveDesignPreset(designVariant?: number | null): DesignPreset {
  const recipe = getDesignRecipe(designVariant);
  const raw = DESIGN_PRESETS.find((p) => p.id === recipe.id) ?? DESIGN_PRESETS[0]!;

  // Merge catalog recipe (unique fingerprint) over base preset slots.
  return {
    ...raw,
    id: recipe.id,
    name: recipe.name,
    family: recipe.family,
    navStyle: recipe.navStyle,
    footerStyle: recipe.footerStyle,
    servicesLayout: recipe.servicesLayout,
    stickyCallBar: recipe.stickyCallBar,
    proofFirst: recipe.proofFirst,
    heroLayout:
      recipe.heroMode.includes('center') || recipe.heroMode.includes('story') || recipe.heroMode.includes('quote')
        ? 'fullBleedCentered'
        : recipe.heroMode.includes('split-right')
          ? 'splitRight'
          : recipe.heroMode.includes('split')
            ? 'splitLeft'
            : recipe.heroMode.includes('compact') || recipe.heroMode.includes('utility')
              ? 'compact'
              : recipe.heroMode.includes('bold') || recipe.heroMode.includes('overlay')
                ? 'overlayBold'
                : 'fullBleedLeft',
    sectionRhythm:
      recipe.family === 'bold'
        ? 'boldBands'
        : recipe.family === 'editorial'
          ? 'airy'
          : recipe.family === 'utility'
            ? 'dense'
            : recipe.surface === 'slate'
              ? 'alternating'
              : 'classic',
    density: recipe.family === 'editorial' ? 'airy' : recipe.family === 'utility' ? 'compact' : raw.density,
  };
}

export function designCssVars(preset: DesignPreset): CSSProperties {
  const recipe = getDesignRecipe(preset.id);
  const radiusMap: Record<RadiusScale, string> = {
    none: '0px',
    sm: '4px',
    md: '8px',
    lg: '16px',
    full: '9999px',
  };
  const densityPad: Record<Density, string> = {
    airy: '1.35',
    normal: '1',
    compact: '0.75',
  };
  const buttonRadius =
    preset.buttonShape === 'pill'
      ? '9999px'
      : preset.buttonShape === 'square'
        ? '4px'
        : radiusMap[preset.radius];

  const surfaceMap: Record<SurfaceTone, string> = {
    white: '#ffffff',
    slate: '#f1f5f9',
    cream: '#fffdf8',
    ink: '#0f172a',
    mist: '#f8fafc',
    sand: '#f5f0e8',
    paper: '#faf8f5',
  };

  return {
    ...designCssVarsStrong(preset, { radiusMap, densityPad, buttonRadius }),
    '--skin-surface': surfaceMap[recipe.surface],
    '--design-surface': surfaceMap[recipe.surface],
  } as CSSProperties;
}

export function servicesGridClass(layout: ServicesLayout): string {
  switch (layout) {
    case 'grid2':
      return 'grid gap-8 md:grid-cols-2';
    case 'listRows':
    case 'iconLeft':
      return 'grid gap-4';
    case 'megaTiles':
      return 'grid gap-8 md:grid-cols-2 xl:grid-cols-3';
    case 'softCards':
    case 'grid3':
    default:
      return 'grid gap-8 sm:grid-cols-2 lg:grid-cols-3';
  }
}
