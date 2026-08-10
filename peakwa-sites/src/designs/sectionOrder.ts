import type { SectionOrder } from '@/src/designs/catalog';

export type HomeSectionKey =
  | 'trust'
  | 'about'
  | 'services'
  | 'why'
  | 'stats'
  | 'process'
  | 'reviews'
  | 'locations'
  | 'faq';

const BASE: HomeSectionKey[] = [
  'trust',
  'about',
  'services',
  'why',
  'stats',
  'process',
  'reviews',
  'locations',
  'faq',
];

/** Reorder home body sections per design recipe (hero always stays first). */
export function orderedHomeSections(order: SectionOrder): HomeSectionKey[] {
  const moveToFront = (key: HomeSectionKey) => {
    const rest = BASE.filter((k) => k !== key);
    return [key, ...rest];
  };

  switch (order) {
    case 'services-first':
      return moveToFront('services');
    case 'proof-first':
      return ['reviews', 'trust', 'services', 'about', 'why', 'stats', 'process', 'locations', 'faq'];
    case 'story-first':
      return moveToFront('about');
    case 'stats-first':
      return ['stats', 'trust', 'services', 'about', 'why', 'process', 'reviews', 'locations', 'faq'];
    case 'faq-lead':
      return ['faq', 'trust', 'services', 'about', 'why', 'stats', 'process', 'reviews', 'locations'];
    case 'cta-early':
      // Push services + why early so conversion sits higher; CTA banner stays last.
      return ['trust', 'services', 'why', 'about', 'stats', 'process', 'reviews', 'locations', 'faq'];
    case 'locations-early':
      return ['locations', 'trust', 'services', 'about', 'why', 'stats', 'process', 'reviews', 'faq'];
    case 'standard':
    default:
      return BASE;
  }
}

export function homeSectionFlexOrder(order: SectionOrder): Record<HomeSectionKey, number> {
  const keys = orderedHomeSections(order);
  return Object.fromEntries(keys.map((key, index) => [key, index + 1])) as Record<
    HomeSectionKey,
    number
  >;
}
