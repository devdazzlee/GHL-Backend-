/**
 * Builds backend/data/us-zip-places.json.gz from the GeoNames US postal-code
 * export (https://download.geonames.org/export/zip/US.zip, file US.txt).
 * Data © GeoNames (geonames.org), licensed CC BY 4.0 — see data/NOTICE.md.
 *
 *   node scripts/buildZipDataset.js path/to/US.txt
 *
 * Output rows: [zip, placeName, stateCode, countyName, lat, lon]
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/buildZipDataset.js path/to/US.txt');
  process.exit(1);
}

const rows = [];
for (const line of fs.readFileSync(input, 'utf8').split(/\r?\n/)) {
  const c = line.split('\t');
  if (c.length < 11 || c[0] !== 'US') continue;
  const lat = Number(c[9]);
  const lon = Number(c[10]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  rows.push([c[1], c[2], c[4], c[5], lat, lon]);
}

const out = new URL('../data/us-zip-places.json.gz', import.meta.url);
fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(rows), { level: 9 }));
console.log(`wrote ${rows.length} rows to ${out.pathname}`);
