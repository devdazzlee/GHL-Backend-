import { AppError } from '../utils/AppError.js';
import { findPlaceCoordinates, lookupZip, toStateCode } from './zipRadius.service.js';

/**
 * Facts for a site's business schema (JSON-LD) that come from data we already have,
 * never invented: street + ZIP from the site's Address field, and map coordinates
 * from our US ZIP data (the address's ZIP, else the site's city).
 */

const ZIP_RX = /\b(\d{5})(?:-\d{4})?\b/g;

/** "115 Dell Glen Ave, Lodi, NJ 07644" -> { streetAddress: "115 Dell Glen Ave", postalCode: "07644" }. */
export function parseAddress(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { streetAddress: null, postalCode: null };
  const zips = [...text.matchAll(ZIP_RX)].map((m) => m[1]);
  // The last 5-digit number is the ZIP only when it isn't also the street number at the very start.
  const postalCode = zips.length && !(zips.length === 1 && text.startsWith(zips[0])) ? zips[zips.length - 1] : null;
  const first = text.split(',')[0].trim();
  // A street line starts with a house number ("115 Dell Glen Ave", "12-14 Main St").
  const streetAddress = /^\d[\dA-Za-z-]*\s+\S/.test(first) && first !== postalCode ? first : null;
  return { streetAddress, postalCode };
}

/** Coordinates rounded to 4 decimals (about 11 m), enough for a business pin. */
function round(n) {
  return Math.round(n * 1e4) / 1e4;
}

export function schemaFactsFor(site) {
  const { streetAddress, postalCode } = parseAddress(site?.address);
  const state = toStateCode(site?.state);
  let geo = null;
  const zipRow = postalCode ? lookupZip(postalCode) : null;
  if (zipRow && (!state || zipRow.state === state)) {
    geo = { latitude: round(zipRow.lat), longitude: round(zipRow.lon), source: 'zip' };
  } else if (site?.city && state) {
    const place = findPlaceCoordinates(site.city, state);
    if (place) geo = { latitude: round(place.lat), longitude: round(place.lon), source: 'city' };
  }
  return { streetAddress, postalCode, stateCode: state, geo };
}

export const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_RX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Opening hours as entered in the dashboard. Accepted shapes:
 *   null or ""                                  -> not set (no hours in the schema)
 *   { open24x7: true }                          -> always open
 *   { days: { Monday: { opens: "08:00", closes: "18:00" }, Sunday: null, ... } }
 * A day that's missing or null is closed. Returns the JSON string to store, or null.
 */
export function normalizeOpeningHours(input) {
  if (input === null || input === undefined || input === '') return null;
  const value = typeof input === 'string' ? safeJson(input) : input;
  const invalid = (message) => new AppError(message, 400, { code: 'INVALID_OPENING_HOURS' });
  if (!value || typeof value !== 'object') throw invalid('Opening hours must be an object.');
  if (value.open24x7 === true) return JSON.stringify({ open24x7: true });
  const days = value.days;
  if (!days || typeof days !== 'object') throw invalid('Opening hours need "days" or "open24x7".');
  const out = {};
  for (const [day, hours] of Object.entries(days)) {
    if (!WEEK_DAYS.includes(day)) throw invalid(`Unknown day "${day}".`);
    if (hours === null) continue;
    const opens = String(hours?.opens ?? '');
    const closes = String(hours?.closes ?? '');
    if (!TIME_RX.test(opens) || !TIME_RX.test(closes)) throw invalid(`${day}: times must be HH:MM (24-hour).`);
    if (opens >= closes) throw invalid(`${day}: closing time must be after opening time.`);
    out[day] = { opens, closes };
  }
  if (Object.keys(out).length === 0) throw invalid('Set at least one open day, or clear the hours.');
  return JSON.stringify({ days: out });
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
