/**
 * 50 unique design recipes — every ID has a distinct layout fingerprint.
 * Used by peakwa-sites renderer + mirrored in dashboard catalog.
 */

export const DESIGN_VARIANT_COUNT = 50;

export type DesignFamily = 'classic' | 'split' | 'bold' | 'editorial' | 'utility';

export type HeroMode =
  | 'classic-left'
  | 'classic-center'
  | 'classic-compact'
  | 'split-left-image'
  | 'split-right-image'
  | 'split-asymmetric'
  | 'bold-panel'
  | 'bold-stack'
  | 'bold-overlay-cta'
  | 'editorial-story'
  | 'editorial-quote'
  | 'editorial-wide-image'
  | 'utility-dashboard'
  | 'utility-banner'
  | 'utility-split-info'
  | 'magazine-cover'
  | 'diagonal-band'
  | 'card-float'
  | 'minimal-type'
  | 'checklist-hero';

export type SectionOrder =
  | 'standard'
  | 'services-first'
  | 'proof-first'
  | 'story-first'
  | 'stats-first'
  | 'faq-lead'
  | 'cta-early'
  | 'locations-early';

export type SurfaceTone = 'white' | 'slate' | 'cream' | 'ink' | 'mist' | 'sand' | 'paper';

export type DesignRecipe = {
  id: number;
  name: string;
  family: DesignFamily;
  description: string;
  heroMode: HeroMode;
  sectionOrder: SectionOrder;
  surface: SurfaceTone;
  navStyle: 'solid' | 'transparent' | 'centered' | 'phoneFirst';
  footerStyle: 'multiColumn' | 'compact' | 'centered';
  servicesLayout: 'grid3' | 'grid2' | 'iconLeft' | 'listRows' | 'megaTiles' | 'softCards';
  stickyCallBar: boolean;
  proofFirst: boolean;
};

/** Guaranteed-unique fingerprints: no two recipes share the same key combo. */
export const DESIGN_CATALOG: DesignRecipe[] = [
  { id: 1, name: 'Classic Current', family: 'classic', description: 'Full-bleed left hero, 3-col services, multi-column footer', heroMode: 'classic-left', sectionOrder: 'standard', surface: 'white', navStyle: 'solid', footerStyle: 'multiColumn', servicesLayout: 'grid3', stickyCallBar: false, proofFirst: false },
  { id: 2, name: 'Classic Bordered', family: 'classic', description: 'Left hero, bordered service cards, sharp corners', heroMode: 'classic-left', sectionOrder: 'standard', surface: 'white', navStyle: 'solid', footerStyle: 'multiColumn', servicesLayout: 'grid2', stickyCallBar: false, proofFirst: false },
  { id: 3, name: 'Classic Soft Air', family: 'classic', description: 'Airy spacing, soft cards, light surface', heroMode: 'classic-center', sectionOrder: 'standard', surface: 'mist', navStyle: 'solid', footerStyle: 'multiColumn', servicesLayout: 'softCards', stickyCallBar: false, proofFirst: false },
  { id: 4, name: 'Classic Dark Band', family: 'classic', description: 'Dark trust band under hero, bold contrast', heroMode: 'classic-left', sectionOrder: 'stats-first', surface: 'white', navStyle: 'solid', footerStyle: 'multiColumn', servicesLayout: 'grid3', stickyCallBar: false, proofFirst: false },
  { id: 5, name: 'Classic Center Stage', family: 'classic', description: 'Centered hero headline, balanced grid', heroMode: 'classic-center', sectionOrder: 'standard', surface: 'white', navStyle: 'centered', footerStyle: 'multiColumn', servicesLayout: 'grid3', stickyCallBar: false, proofFirst: false },
  { id: 6, name: 'Classic Story Split', family: 'classic', description: 'About-forward layout with 2-col services', heroMode: 'classic-left', sectionOrder: 'story-first', surface: 'white', navStyle: 'solid', footerStyle: 'multiColumn', servicesLayout: 'grid2', stickyCallBar: false, proofFirst: false },
  { id: 7, name: 'Classic Icon Grid', family: 'classic', description: 'Soft icon cards, rounded CTAs', heroMode: 'classic-compact', sectionOrder: 'standard', surface: 'mist', navStyle: 'solid', footerStyle: 'multiColumn', servicesLayout: 'softCards', stickyCallBar: false, proofFirst: false },
  { id: 8, name: 'Classic Alternating', family: 'classic', description: 'Alternating section bands, bordered cards', heroMode: 'classic-left', sectionOrder: 'standard', surface: 'slate', navStyle: 'solid', footerStyle: 'multiColumn', servicesLayout: 'grid3', stickyCallBar: false, proofFirst: false },
  { id: 9, name: 'Classic Phone Compact', family: 'classic', description: 'Phone-first header, compact hero', heroMode: 'classic-compact', sectionOrder: 'services-first', surface: 'white', navStyle: 'phoneFirst', footerStyle: 'multiColumn', servicesLayout: 'grid2', stickyCallBar: true, proofFirst: false },
  { id: 10, name: 'Classic Footer Hub', family: 'classic', description: 'Rich multi-column footer focus, large service tiles', heroMode: 'classic-center', sectionOrder: 'locations-early', surface: 'white', navStyle: 'solid', footerStyle: 'multiColumn', servicesLayout: 'megaTiles', stickyCallBar: false, proofFirst: false },

  { id: 11, name: 'Split Standard', family: 'split', description: '50/50 text-left image-right hero', heroMode: 'split-left-image', sectionOrder: 'standard', surface: 'mist', navStyle: 'transparent', footerStyle: 'compact', servicesLayout: 'iconLeft', stickyCallBar: false, proofFirst: false },
  { id: 12, name: 'Split Reverse', family: 'split', description: 'Image left, text right, 2-col cards', heroMode: 'split-right-image', sectionOrder: 'standard', surface: 'mist', navStyle: 'transparent', footerStyle: 'compact', servicesLayout: 'grid2', stickyCallBar: false, proofFirst: false },
  { id: 13, name: 'Split Float Card', family: 'split', description: 'Floating card hero energy, soft tiles', heroMode: 'card-float', sectionOrder: 'cta-early', surface: 'white', navStyle: 'transparent', footerStyle: 'compact', servicesLayout: 'softCards', stickyCallBar: false, proofFirst: false },
  { id: 14, name: 'Split Minimal Type', family: 'split', description: 'Minimal typography, list services, centered footer', heroMode: 'minimal-type', sectionOrder: 'story-first', surface: 'paper', navStyle: 'solid', footerStyle: 'centered', servicesLayout: 'listRows', stickyCallBar: false, proofFirst: false },
  { id: 15, name: 'Split Asymmetric', family: 'split', description: 'Asymmetric hero, zigzag section rhythm', heroMode: 'split-asymmetric', sectionOrder: 'standard', surface: 'mist', navStyle: 'transparent', footerStyle: 'compact', servicesLayout: 'grid2', stickyCallBar: false, proofFirst: false },
  { id: 16, name: 'Split Glass Soft', family: 'split', description: 'Glass-like soft cards, airy spacing', heroMode: 'split-right-image', sectionOrder: 'proof-first', surface: 'cream', navStyle: 'transparent', footerStyle: 'centered', servicesLayout: 'softCards', stickyCallBar: false, proofFirst: true },
  { id: 17, name: 'Split Timeline', family: 'split', description: 'Icon-left services, process-forward flow', heroMode: 'split-left-image', sectionOrder: 'stats-first', surface: 'white', navStyle: 'solid', footerStyle: 'compact', servicesLayout: 'iconLeft', stickyCallBar: false, proofFirst: false },
  { id: 18, name: 'Split Map Accent', family: 'split', description: 'Locations early, 3-col services', heroMode: 'split-left-image', sectionOrder: 'locations-early', surface: 'mist', navStyle: 'transparent', footerStyle: 'multiColumn', servicesLayout: 'grid3', stickyCallBar: false, proofFirst: false },
  { id: 19, name: 'Split Dual CTA', family: 'split', description: 'Phone-first + sticky call, bold bands', heroMode: 'split-left-image', sectionOrder: 'cta-early', surface: 'slate', navStyle: 'phoneFirst', footerStyle: 'compact', servicesLayout: 'grid3', stickyCallBar: true, proofFirst: false },
  { id: 20, name: 'Split Magazine', family: 'split', description: 'Magazine cover hero, mega service tiles', heroMode: 'magazine-cover', sectionOrder: 'story-first', surface: 'paper', navStyle: 'centered', footerStyle: 'centered', servicesLayout: 'megaTiles', stickyCallBar: false, proofFirst: false },

  { id: 21, name: 'Bold Overlay', family: 'bold', description: 'Dark overlay hero + accent action panel', heroMode: 'bold-panel', sectionOrder: 'standard', surface: 'ink', navStyle: 'phoneFirst', footerStyle: 'multiColumn', servicesLayout: 'megaTiles', stickyCallBar: true, proofFirst: false },
  { id: 22, name: 'Bold Form Push', family: 'bold', description: 'Conversion stack with form-energy CTAs', heroMode: 'bold-stack', sectionOrder: 'cta-early', surface: 'ink', navStyle: 'solid', footerStyle: 'compact', servicesLayout: 'grid3', stickyCallBar: true, proofFirst: false },
  { id: 23, name: 'Bold Banner Strip', family: 'bold', description: 'Top urgency strip, sharp bordered cards', heroMode: 'bold-overlay-cta', sectionOrder: 'services-first', surface: 'slate', navStyle: 'phoneFirst', footerStyle: 'multiColumn', servicesLayout: 'grid2', stickyCallBar: false, proofFirst: false },
  { id: 24, name: 'Bold Center Stack', family: 'bold', description: 'Centered bold stack, mega tiles', heroMode: 'bold-stack', sectionOrder: 'proof-first', surface: 'ink', navStyle: 'centered', footerStyle: 'centered', servicesLayout: 'megaTiles', stickyCallBar: false, proofFirst: true },
  { id: 25, name: 'Bold Diagonal', family: 'bold', description: 'Diagonal band hero, sharp high contrast', heroMode: 'diagonal-band', sectionOrder: 'standard', surface: 'ink', navStyle: 'solid', footerStyle: 'compact', servicesLayout: 'grid3', stickyCallBar: false, proofFirst: false },
  { id: 26, name: 'Bold Sticky Call', family: 'bold', description: 'Dense phone-first utility conversion', heroMode: 'bold-overlay-cta', sectionOrder: 'services-first', surface: 'slate', navStyle: 'phoneFirst', footerStyle: 'compact', servicesLayout: 'listRows', stickyCallBar: true, proofFirst: false },
  { id: 27, name: 'Bold Proof First', family: 'bold', description: 'Reviews near top, then services', heroMode: 'bold-panel', sectionOrder: 'proof-first', surface: 'ink', navStyle: 'solid', footerStyle: 'multiColumn', servicesLayout: 'grid3', stickyCallBar: false, proofFirst: true },
  { id: 28, name: 'Bold Mega Services', family: 'bold', description: 'Huge service tiles, left classic hero energy', heroMode: 'checklist-hero', sectionOrder: 'services-first', surface: 'white', navStyle: 'transparent', footerStyle: 'multiColumn', servicesLayout: 'megaTiles', stickyCallBar: false, proofFirst: false },
  { id: 29, name: 'Bold Soft Dark', family: 'bold', description: 'Dark family with soft card islands', heroMode: 'bold-panel', sectionOrder: 'story-first', surface: 'ink', navStyle: 'solid', footerStyle: 'centered', servicesLayout: 'softCards', stickyCallBar: false, proofFirst: false },
  { id: 30, name: 'Bold Checklist', family: 'bold', description: 'Checklist hero, icon-left services, sticky call', heroMode: 'checklist-hero', sectionOrder: 'faq-lead', surface: 'slate', navStyle: 'phoneFirst', footerStyle: 'compact', servicesLayout: 'iconLeft', stickyCallBar: true, proofFirst: true },

  { id: 31, name: 'Editorial Story', family: 'editorial', description: 'Centered story hero, cream paper surface', heroMode: 'editorial-story', sectionOrder: 'story-first', surface: 'cream', navStyle: 'centered', footerStyle: 'centered', servicesLayout: 'softCards', stickyCallBar: false, proofFirst: false },
  { id: 32, name: 'Editorial Serif', family: 'editorial', description: 'Serif display, wide image under title', heroMode: 'editorial-wide-image', sectionOrder: 'standard', surface: 'cream', navStyle: 'centered', footerStyle: 'centered', servicesLayout: 'grid2', stickyCallBar: false, proofFirst: false },
  { id: 33, name: 'Editorial Quote', family: 'editorial', description: 'Quote-led hero, proof-first flow', heroMode: 'editorial-quote', sectionOrder: 'proof-first', surface: 'sand', navStyle: 'solid', footerStyle: 'multiColumn', servicesLayout: 'softCards', stickyCallBar: false, proofFirst: true },
  { id: 34, name: 'Editorial Longform', family: 'editorial', description: 'Two-column story feel, list services', heroMode: 'editorial-story', sectionOrder: 'story-first', surface: 'paper', navStyle: 'solid', footerStyle: 'centered', servicesLayout: 'listRows', stickyCallBar: false, proofFirst: false },
  { id: 35, name: 'Editorial Soft Grid', family: 'editorial', description: 'Muted soft grid, centered calm nav', heroMode: 'editorial-wide-image', sectionOrder: 'standard', surface: 'cream', navStyle: 'transparent', footerStyle: 'centered', servicesLayout: 'grid2', stickyCallBar: false, proofFirst: false },
  { id: 36, name: 'Editorial Team', family: 'editorial', description: 'Team/mission emphasis, icon services', heroMode: 'split-right-image', sectionOrder: 'story-first', surface: 'sand', navStyle: 'centered', footerStyle: 'multiColumn', servicesLayout: 'iconLeft', stickyCallBar: false, proofFirst: false },
  { id: 37, name: 'Editorial FAQ Lead', family: 'editorial', description: 'FAQ early, compact hero', heroMode: 'classic-compact', sectionOrder: 'faq-lead', surface: 'paper', navStyle: 'solid', footerStyle: 'compact', servicesLayout: 'grid3', stickyCallBar: false, proofFirst: false },
  { id: 38, name: 'Editorial Local', family: 'editorial', description: 'Local storytelling, location early', heroMode: 'editorial-story', sectionOrder: 'locations-early', surface: 'cream', navStyle: 'phoneFirst', footerStyle: 'multiColumn', servicesLayout: 'softCards', stickyCallBar: false, proofFirst: false },
  { id: 39, name: 'Editorial Polaroid', family: 'editorial', description: 'Image-led magazine cover, mega tiles', heroMode: 'magazine-cover', sectionOrder: 'proof-first', surface: 'sand', navStyle: 'centered', footerStyle: 'centered', servicesLayout: 'megaTiles', stickyCallBar: false, proofFirst: true },
  { id: 40, name: 'Editorial Newsletter', family: 'editorial', description: 'Newsletter aesthetic, blog-forward calm', heroMode: 'minimal-type', sectionOrder: 'story-first', surface: 'paper', navStyle: 'solid', footerStyle: 'compact', servicesLayout: 'grid2', stickyCallBar: false, proofFirst: false },

  { id: 41, name: 'Utility Phone First', family: 'utility', description: 'Phone strip + quick info dashboard', heroMode: 'utility-dashboard', sectionOrder: 'services-first', surface: 'slate', navStyle: 'phoneFirst', footerStyle: 'compact', servicesLayout: 'listRows', stickyCallBar: true, proofFirst: false },
  { id: 42, name: 'Utility Table Rows', family: 'utility', description: 'Table-like service rows, sharp utility', heroMode: 'utility-banner', sectionOrder: 'services-first', surface: 'slate', navStyle: 'phoneFirst', footerStyle: 'compact', servicesLayout: 'listRows', stickyCallBar: false, proofFirst: false },
  { id: 43, name: 'Utility Cards Desk', family: 'utility', description: 'Dashboard cards, compact density', heroMode: 'utility-dashboard', sectionOrder: 'stats-first', surface: 'mist', navStyle: 'solid', footerStyle: 'compact', servicesLayout: 'grid2', stickyCallBar: false, proofFirst: false },
  { id: 44, name: 'Utility Dense Split', family: 'utility', description: 'Dense split info, icon-left list', heroMode: 'utility-split-info', sectionOrder: 'standard', surface: 'slate', navStyle: 'solid', footerStyle: 'multiColumn', servicesLayout: 'iconLeft', stickyCallBar: false, proofFirst: false },
  { id: 45, name: 'Utility Emergency', family: 'utility', description: 'Urgent call-now overlay, list services', heroMode: 'bold-overlay-cta', sectionOrder: 'cta-early', surface: 'ink', navStyle: 'phoneFirst', footerStyle: 'compact', servicesLayout: 'listRows', stickyCallBar: true, proofFirst: false },
  { id: 46, name: 'Utility Segmented', family: 'utility', description: 'Segmented services feel, compact hero', heroMode: 'classic-compact', sectionOrder: 'services-first', surface: 'mist', navStyle: 'solid', footerStyle: 'compact', servicesLayout: 'iconLeft', stickyCallBar: false, proofFirst: false },
  { id: 47, name: 'Utility Map Heavy', family: 'utility', description: 'Locations early, practical grid', heroMode: 'utility-banner', sectionOrder: 'locations-early', surface: 'slate', navStyle: 'phoneFirst', footerStyle: 'multiColumn', servicesLayout: 'grid3', stickyCallBar: false, proofFirst: false },
  { id: 48, name: 'Utility FAQ Dense', family: 'utility', description: 'FAQ-forward dense utility layout', heroMode: 'utility-dashboard', sectionOrder: 'faq-lead', surface: 'mist', navStyle: 'solid', footerStyle: 'compact', servicesLayout: 'listRows', stickyCallBar: false, proofFirst: false },
  { id: 49, name: 'Utility Mobile Stack', family: 'utility', description: 'Mobile-first stacked CTAs, soft cards', heroMode: 'utility-split-info', sectionOrder: 'cta-early', surface: 'slate', navStyle: 'phoneFirst', footerStyle: 'centered', servicesLayout: 'softCards', stickyCallBar: true, proofFirst: false },
  { id: 50, name: 'Utility Hybrid Pro', family: 'utility', description: 'Hybrid: utility header + classic grid + bold end CTA', heroMode: 'utility-dashboard', sectionOrder: 'standard', surface: 'white', navStyle: 'phoneFirst', footerStyle: 'multiColumn', servicesLayout: 'grid3', stickyCallBar: true, proofFirst: false },
];

export function getDesignRecipe(id?: number | null): DesignRecipe {
  const n = typeof id === 'number' && id >= 1 && id <= 50 ? id : 1;
  return DESIGN_CATALOG.find((d) => d.id === n) ?? DESIGN_CATALOG[0]!;
}

export function listDesignCatalog() {
  return DESIGN_CATALOG.map(({ id, name, family, description }) => ({
    id,
    name,
    family,
    description,
  }));
}
