/**
 * Extra facts for a site's business schema (JSON-LD), built only from data the site
 * already has; nothing is invented (no rating, no price range). Pure, for unit tests.
 */

export type SchemaFacts = {
  streetAddress?: string | null;
  postalCode?: string | null;
  /** Two-letter state ("OR"), so the service area reads the same as the city pages. */
  stateCode?: string | null;
  geo?: { latitude: number; longitude: number } | null;
};

export type BusinessFactsInput = {
  city: string;
  state: string;
  phone?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  openingHours?: string | null;
  schemaFacts?: SchemaFacts | null;
};

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Dashboard hours ({"open24x7": true} or {"days": {...}}) as schema.org OpeningHoursSpecification. */
export function openingHoursSpecification(raw: string | null | undefined): Record<string, unknown>[] {
  if (!raw) return [];
  let value: { open24x7?: boolean; days?: Record<string, { opens: string; closes: string } | null> };
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (value?.open24x7) {
    return [{ '@type': 'OpeningHoursSpecification', dayOfWeek: WEEK_DAYS, opens: '00:00', closes: '23:59' }];
  }
  // Days with the same hours share one entry, in week order.
  const groups = new Map<string, string[]>();
  for (const day of WEEK_DAYS) {
    const hours = value?.days?.[day];
    if (!hours?.opens || !hours?.closes) continue;
    const key = `${hours.opens}-${hours.closes}`;
    groups.set(key, [...(groups.get(key) ?? []), day]);
  }
  return [...groups.entries()].map(([key, days]) => {
    const [opens, closes] = key.split('-');
    return { '@type': 'OpeningHoursSpecification', dayOfWeek: days, opens, closes };
  });
}

/** The business's own social profiles (only real https URLs). */
export function sameAsLinks(site: BusinessFactsInput): string[] {
  return [site.facebookUrl, site.instagramUrl]
    .map((url) => String(url ?? '').trim())
    .filter((url) => /^https:\/\/[^\s/]+\.[^\s]+$/i.test(url));
}

/** The main city plus every city page, as schema.org City entries, without duplicates. */
export function areaServed(site: BusinessFactsInput, cities: Array<{ city: string; state?: string | null }> = []) {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  const siteState = site.schemaFacts?.stateCode || site.state;
  for (const entry of [{ city: site.city, state: siteState }, ...cities]) {
    const name = String(entry.city ?? '').trim();
    if (!name) continue;
    const label = `${name}, ${String(entry.state || siteState).trim()}`;
    if (seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push({ '@type': 'City', name: label });
  }
  return out;
}

/** Fields to merge into the LocalBusiness node; empty ones are left out entirely. */
export function businessExtras(site: BusinessFactsInput, cities: Array<{ city: string; state?: string | null }> = []) {
  const facts = site.schemaFacts ?? {};
  const extras: Record<string, unknown> = {};
  if (facts.streetAddress) extras.streetAddress = facts.streetAddress;
  if (facts.postalCode) extras.postalCode = facts.postalCode;
  if (facts.geo) extras.geo = { '@type': 'GeoCoordinates', latitude: facts.geo.latitude, longitude: facts.geo.longitude };
  const sameAs = sameAsLinks(site);
  if (sameAs.length) extras.sameAs = sameAs;
  const hours = openingHoursSpecification(site.openingHours);
  if (hours.length) extras.openingHoursSpecification = hours;
  const area = areaServed(site, cities);
  if (area.length) extras.areaServed = area;
  if (site.phone) extras.contactPoint = { '@type': 'ContactPoint', telephone: site.phone, contactType: 'customer service' };
  return extras;
}
