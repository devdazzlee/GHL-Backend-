import prisma from '../database/client.js';

export const DESIGN_VARIANT_COUNT = 50;

/**
 * Pick the least-used design variant (1–50) so new sites rotate layouts.
 * Ties broken by preferring lower IDs, then a light hash of the slug seed.
 */
export async function pickDesignVariant(seed = '') {
  const grouped = await prisma.generatedSite.groupBy({
    by: ['designVariant'],
    _count: { designVariant: true },
  });

  const counts = new Map(
    grouped.map((row) => [row.designVariant, row._count.designVariant]),
  );

  let bestId = 1;
  let bestCount = Number.POSITIVE_INFINITY;

  for (let id = 1; id <= DESIGN_VARIANT_COUNT; id += 1) {
    const count = counts.get(id) ?? 0;
    if (count < bestCount) {
      bestCount = count;
      bestId = id;
    }
  }

  const tied = [];
  for (let id = 1; id <= DESIGN_VARIANT_COUNT; id += 1) {
    if ((counts.get(id) ?? 0) === bestCount) tied.push(id);
  }

  if (tied.length <= 1) return bestId;

  const hash = String(seed)
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return tied[hash % tied.length];
}

export function normalizeDesignVariant(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > DESIGN_VARIANT_COUNT) return null;
  return n;
}
