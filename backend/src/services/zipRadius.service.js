import fs from 'node:fs';
import zlib from 'node:zlib';
import { AppError } from '../utils/AppError.js';

/**
 * Towns within a radius of a US ZIP code, from real data instead of an AI
 * guess. Source: GeoNames US postal codes (CC BY 4.0, see data/NOTICE.md).
 * Each ZIP has a place name, state, county and centroid; towns are the
 * distinct place names whose ZIP centroids fall inside the radius, measured
 * from the origin ZIP's centroid (great-circle distance).
 */

const DATA_URL = new URL('../../data/us-zip-places.json.gz', import.meta.url);
const EARTH_RADIUS_MILES = 3958.8;

let index = null;

function loadIndex() {
  if (index) return index;
  const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(DATA_URL)).toString('utf8'));
  const byZip = new Map();
  for (const [zip, place, state, county, lat, lon] of rows) {
    byZip.set(zip, { zip, place, state, county, lat, lon });
  }
  index = { rows: [...byZip.values()], byZip };
  return index;
}

export function haversineMiles(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lookupZip(zip) {
  return loadIndex().byZip.get(String(zip).trim().slice(0, 5)) ?? null;
}

/**
 * @returns {{ origin, towns: Array<{ city, county, state, miles, zips: string[] }> }}
 * Towns are sorted nearest first; the origin ZIP's own town is included.
 */
export function findTownsWithinRadius(zipCode, radiusMiles) {
  const zip = String(zipCode ?? '').trim();
  if (!/^\d{5}(-\d{4})?$/.test(zip)) {
    throw new AppError('Field `zipCode` must be a valid US ZIP code.', 400, { code: 'INVALID_BODY' });
  }
  const radius = Number(radiusMiles);
  if (!Number.isFinite(radius) || radius <= 0 || radius > 100) {
    throw new AppError('Field `radiusMiles` must be a number between 1 and 100.', 400, { code: 'INVALID_BODY' });
  }

  const origin = lookupZip(zip);
  if (!origin) {
    throw new AppError(`ZIP code ${zip.slice(0, 5)} was not found in the ZIP dataset.`, 404, {
      code: 'ZIP_NOT_FOUND',
    });
  }

  const towns = new Map();
  for (const row of loadIndex().rows) {
    const miles = haversineMiles(origin, row);
    if (miles > radius) continue;
    const key = `${row.place}|${row.county}|${row.state}`.toLowerCase();
    const town = towns.get(key);
    if (town) {
      town.miles = Math.min(town.miles, miles);
      town.zips.push(row.zip);
    } else {
      towns.set(key, { city: row.place, county: row.county, state: row.state, miles, zips: [row.zip] });
    }
  }

  return {
    origin: { zip: origin.zip, city: origin.place, county: origin.county, state: origin.state },
    towns: [...towns.values()]
      .map((t) => ({ ...t, miles: Math.round(t.miles * 10) / 10, zips: t.zips.sort() }))
      .sort((a, b) => a.miles - b.miles || a.city.localeCompare(b.city)),
  };
}

/** Two-letter codes for US states, DC and territories in the ZIP dataset. */
export const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico',
};

/** "Colorado", "colorado", "CO", " co " -> "CO"; anything else -> null. */
export function toStateCode(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const upper = text.toUpperCase();
  if (US_STATES[upper]) return upper;
  const match = Object.entries(US_STATES).find(([, name]) => name.toLowerCase() === text.toLowerCase());
  return match ? match[0] : null;
}

/**
 * Counties (and the dataset's spelling of the town) for a town name in one state.
 * @returns {Array<{ city: string, county: string, state: string }>} distinct, sorted by county
 */
export function findTownCounties(city, stateCode) {
  const name = String(city ?? '').trim().toLowerCase();
  const state = toStateCode(stateCode);
  if (!name || !state) return [];
  const found = new Map();
  for (const row of loadIndex().rows) {
    if (row.state !== state || String(row.place).toLowerCase() !== name) continue;
    const key = String(row.county).toLowerCase();
    if (!found.has(key)) found.set(key, { city: row.place, county: row.county, state: row.state });
  }
  return [...found.values()].sort((a, b) => a.county.localeCompare(b.county));
}

/**
 * Centre of a town (the average of its ZIP centroids) in one state, or null.
 * Used for a business's map pin when its address has no usable ZIP.
 */
export function findPlaceCoordinates(city, stateCode) {
  const name = String(city ?? '').trim().toLowerCase();
  const state = toStateCode(stateCode);
  if (!name || !state) return null;
  const rows = loadIndex().rows.filter((r) => r.state === state && String(r.place).toLowerCase() === name);
  if (rows.length === 0) return null;
  const lat = rows.reduce((sum, r) => sum + Number(r.lat), 0) / rows.length;
  const lon = rows.reduce((sum, r) => sum + Number(r.lon), 0) / rows.length;
  return { lat, lon, zips: rows.map((r) => r.zip) };
}
