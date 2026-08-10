/**
 * Mirror of peakwa-sites design catalog for dashboard UI.
 * Keep names/ids in sync with peakwa-sites/src/designs/catalog.ts
 */
export const DESIGN_VARIANT_COUNT = 50;

export type DesignCatalogItem = {
  id: number;
  name: string;
  family: string;
  description: string;
  heroMode: string;
  servicesLayout: string;
};

export const DESIGN_CATALOG: DesignCatalogItem[] = [
  { id: 1, name: 'Classic Current', family: 'classic', description: 'Full-bleed left hero, 3-col services, multi-column footer', heroMode: 'classic-left', servicesLayout: 'grid3' },
  { id: 2, name: 'Classic Bordered', family: 'classic', description: 'Left hero, bordered service cards, sharp corners', heroMode: 'classic-left', servicesLayout: 'grid2' },
  { id: 3, name: 'Classic Soft Air', family: 'classic', description: 'Airy spacing, soft cards, light surface', heroMode: 'classic-center', servicesLayout: 'softCards' },
  { id: 4, name: 'Classic Dark Band', family: 'classic', description: 'Dark trust band under hero, bold contrast', heroMode: 'classic-left', servicesLayout: 'grid3' },
  { id: 5, name: 'Classic Center Stage', family: 'classic', description: 'Centered hero headline, balanced grid', heroMode: 'classic-center', servicesLayout: 'grid3' },
  { id: 6, name: 'Classic Story Split', family: 'classic', description: 'About-forward layout with 2-col services', heroMode: 'classic-left', servicesLayout: 'grid2' },
  { id: 7, name: 'Classic Icon Grid', family: 'classic', description: 'Soft icon cards, rounded CTAs', heroMode: 'classic-compact', servicesLayout: 'softCards' },
  { id: 8, name: 'Classic Alternating', family: 'classic', description: 'Alternating section bands, bordered cards', heroMode: 'classic-left', servicesLayout: 'grid3' },
  { id: 9, name: 'Classic Phone Compact', family: 'classic', description: 'Phone-first header, compact hero', heroMode: 'classic-compact', servicesLayout: 'grid2' },
  { id: 10, name: 'Classic Footer Hub', family: 'classic', description: 'Rich multi-column footer focus, large service tiles', heroMode: 'classic-center', servicesLayout: 'megaTiles' },
  { id: 11, name: 'Split Standard', family: 'split', description: '50/50 text-left image-right hero', heroMode: 'split-left-image', servicesLayout: 'iconLeft' },
  { id: 12, name: 'Split Reverse', family: 'split', description: 'Image left, text right, 2-col cards', heroMode: 'split-right-image', servicesLayout: 'grid2' },
  { id: 13, name: 'Split Float Card', family: 'split', description: 'Floating card hero energy, soft tiles', heroMode: 'card-float', servicesLayout: 'softCards' },
  { id: 14, name: 'Split Minimal Type', family: 'split', description: 'Minimal typography, list services, centered footer', heroMode: 'minimal-type', servicesLayout: 'listRows' },
  { id: 15, name: 'Split Asymmetric', family: 'split', description: 'Asymmetric hero, zigzag section rhythm', heroMode: 'split-asymmetric', servicesLayout: 'grid2' },
  { id: 16, name: 'Split Glass Soft', family: 'split', description: 'Glass-like soft cards, airy spacing', heroMode: 'split-right-image', servicesLayout: 'softCards' },
  { id: 17, name: 'Split Timeline', family: 'split', description: 'Icon-left services, process-forward flow', heroMode: 'split-left-image', servicesLayout: 'iconLeft' },
  { id: 18, name: 'Split Map Accent', family: 'split', description: 'Locations early, 3-col services', heroMode: 'split-left-image', servicesLayout: 'grid3' },
  { id: 19, name: 'Split Dual CTA', family: 'split', description: 'Phone-first + sticky call, bold bands', heroMode: 'split-left-image', servicesLayout: 'grid3' },
  { id: 20, name: 'Split Magazine', family: 'split', description: 'Magazine cover hero, mega service tiles', heroMode: 'magazine-cover', servicesLayout: 'megaTiles' },
  { id: 21, name: 'Bold Overlay', family: 'bold', description: 'Dark overlay hero + accent action panel', heroMode: 'bold-panel', servicesLayout: 'megaTiles' },
  { id: 22, name: 'Bold Form Push', family: 'bold', description: 'Conversion stack with form-energy CTAs', heroMode: 'bold-stack', servicesLayout: 'grid3' },
  { id: 23, name: 'Bold Banner Strip', family: 'bold', description: 'Top urgency strip, sharp bordered cards', heroMode: 'bold-overlay-cta', servicesLayout: 'grid2' },
  { id: 24, name: 'Bold Center Stack', family: 'bold', description: 'Centered bold stack, mega tiles', heroMode: 'bold-stack', servicesLayout: 'megaTiles' },
  { id: 25, name: 'Bold Diagonal', family: 'bold', description: 'Diagonal band hero, sharp high contrast', heroMode: 'diagonal-band', servicesLayout: 'grid3' },
  { id: 26, name: 'Bold Sticky Call', family: 'bold', description: 'Dense phone-first utility conversion', heroMode: 'bold-overlay-cta', servicesLayout: 'listRows' },
  { id: 27, name: 'Bold Proof First', family: 'bold', description: 'Reviews near top, then services', heroMode: 'bold-panel', servicesLayout: 'grid3' },
  { id: 28, name: 'Bold Mega Services', family: 'bold', description: 'Huge service tiles, left classic hero energy', heroMode: 'checklist-hero', servicesLayout: 'megaTiles' },
  { id: 29, name: 'Bold Soft Dark', family: 'bold', description: 'Dark family with soft card islands', heroMode: 'bold-panel', servicesLayout: 'softCards' },
  { id: 30, name: 'Bold Checklist', family: 'bold', description: 'Checklist hero, icon-left services, sticky call', heroMode: 'checklist-hero', servicesLayout: 'iconLeft' },
  { id: 31, name: 'Editorial Story', family: 'editorial', description: 'Centered story hero, cream paper surface', heroMode: 'editorial-story', servicesLayout: 'softCards' },
  { id: 32, name: 'Editorial Serif', family: 'editorial', description: 'Serif display, wide image under title', heroMode: 'editorial-wide-image', servicesLayout: 'grid2' },
  { id: 33, name: 'Editorial Quote', family: 'editorial', description: 'Quote-led hero, proof-first flow', heroMode: 'editorial-quote', servicesLayout: 'softCards' },
  { id: 34, name: 'Editorial Longform', family: 'editorial', description: 'Two-column story feel, list services', heroMode: 'editorial-story', servicesLayout: 'listRows' },
  { id: 35, name: 'Editorial Soft Grid', family: 'editorial', description: 'Muted soft grid, centered calm nav', heroMode: 'editorial-wide-image', servicesLayout: 'grid2' },
  { id: 36, name: 'Editorial Team', family: 'editorial', description: 'Team/mission emphasis, icon services', heroMode: 'split-right-image', servicesLayout: 'iconLeft' },
  { id: 37, name: 'Editorial FAQ Lead', family: 'editorial', description: 'FAQ early, compact hero', heroMode: 'classic-compact', servicesLayout: 'grid3' },
  { id: 38, name: 'Editorial Local', family: 'editorial', description: 'Local storytelling, location early', heroMode: 'editorial-story', servicesLayout: 'softCards' },
  { id: 39, name: 'Editorial Polaroid', family: 'editorial', description: 'Image-led magazine cover, mega tiles', heroMode: 'magazine-cover', servicesLayout: 'megaTiles' },
  { id: 40, name: 'Editorial Newsletter', family: 'editorial', description: 'Newsletter aesthetic, blog-forward calm', heroMode: 'minimal-type', servicesLayout: 'grid2' },
  { id: 41, name: 'Utility Phone First', family: 'utility', description: 'Phone strip + quick info dashboard', heroMode: 'utility-dashboard', servicesLayout: 'listRows' },
  { id: 42, name: 'Utility Table Rows', family: 'utility', description: 'Table-like service rows, sharp utility', heroMode: 'utility-banner', servicesLayout: 'listRows' },
  { id: 43, name: 'Utility Cards Desk', family: 'utility', description: 'Dashboard cards, compact density', heroMode: 'utility-dashboard', servicesLayout: 'grid2' },
  { id: 44, name: 'Utility Dense Split', family: 'utility', description: 'Dense split info, icon-left list', heroMode: 'utility-split-info', servicesLayout: 'iconLeft' },
  { id: 45, name: 'Utility Emergency', family: 'utility', description: 'Urgent call-now overlay, list services', heroMode: 'bold-overlay-cta', servicesLayout: 'listRows' },
  { id: 46, name: 'Utility Segmented', family: 'utility', description: 'Segmented services feel, compact hero', heroMode: 'classic-compact', servicesLayout: 'iconLeft' },
  { id: 47, name: 'Utility Map Heavy', family: 'utility', description: 'Locations early, practical grid', heroMode: 'utility-banner', servicesLayout: 'grid3' },
  { id: 48, name: 'Utility FAQ Dense', family: 'utility', description: 'FAQ-forward dense utility layout', heroMode: 'utility-dashboard', servicesLayout: 'listRows' },
  { id: 49, name: 'Utility Mobile Stack', family: 'utility', description: 'Mobile-first stacked CTAs, soft cards', heroMode: 'utility-split-info', servicesLayout: 'softCards' },
  { id: 50, name: 'Utility Hybrid Pro', family: 'utility', description: 'Hybrid: utility header + classic grid + bold end CTA', heroMode: 'utility-dashboard', servicesLayout: 'grid3' },
];

export function getDesignCatalogItem(id?: number | null) {
  const n = typeof id === 'number' && id >= 1 && id <= 50 ? id : 1;
  return DESIGN_CATALOG.find((d) => d.id === n) ?? DESIGN_CATALOG[0]!;
}

export function designPreviewUrl(siteBaseUrl: string, designId: number) {
  return `${siteBaseUrl.replace(/\/$/, '')}/design-preview/${designId}`;
}
