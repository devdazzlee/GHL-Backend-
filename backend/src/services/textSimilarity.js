/**
 * Near-duplicate detection for generated pages. Pure functions, no I/O.
 *
 * Text is normalised (lowercase, letters/digits only), then split into
 * overlapping word 5-grams ("shingles"). Two pages' similarity is the Jaccard
 * index of their shingle sets: 0 = nothing in common, 1 = identical wording.
 * A "same template, city swapped" page scores very high because almost every
 * 5-word run repeats; genuinely different writing on the same topic scores low.
 */

export const SHINGLE_SIZE = 5;

export function normalizeWords(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function shingles(text, size = SHINGLE_SIZE) {
  const words = normalizeWords(text);
  const set = new Set();
  if (words.length < size) {
    if (words.length) set.add(words.join(' '));
    return set;
  }
  for (let i = 0; i + size <= words.length; i += 1) {
    set.add(words.slice(i, i + size).join(' '));
  }
  return set;
}

export function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const s of small) if (large.has(s)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** Similarity of two texts (0..1). */
export function textSimilarity(a, b, size = SHINGLE_SIZE) {
  return jaccard(shingles(a, size), shingles(b, size));
}

/**
 * Highest similarity between `text` and any of `others` ({ key, text }).
 * @returns {{ max: number, key: string | null }}
 */
export function maxSimilarity(text, others, size = SHINGLE_SIZE) {
  const mine = shingles(text, size);
  let max = 0;
  let key = null;
  for (const other of others) {
    const score = jaccard(mine, shingles(other.text, size));
    if (score > max) {
      max = score;
      key = other.key;
    }
  }
  return { max, key };
}

/** Flattens a generated page JSON (any shape) into its visible text. */
export function contentToText(content) {
  const parts = [];
  const walk = (value, keyName) => {
    if (value == null) return;
    if (typeof value === 'string') {
      // Skip non-prose fields such as URLs, paths and image references.
      if (/^(https?:|\/)/.test(value) || /url|href|path|image|slug/i.test(keyName ?? '')) return;
      parts.push(value);
    } else if (Array.isArray(value)) {
      value.forEach((v) => walk(v, keyName));
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  walk(typeof content === 'string' ? safeJson(content) : content);
  return parts.join(' ');
}

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
