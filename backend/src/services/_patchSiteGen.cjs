const fs = require('fs');
const p = 'src/services/siteGenerator.service.js';
let s = fs.readFileSync(p, 'utf8');
const startMarker2 = '/**\n * Generates a single long-form text field';
let start = s.indexOf(startMarker2);
const end = s.indexOf('function parseJsonContent(raw)');
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}

const replacement = fs.readFileSync('src/services/_siteGenUnits.snippet.js', 'utf8');
s = s.slice(0, start) + replacement + '\n\n' + s.slice(end);
fs.writeFileSync(p, s);
console.log('ok', end - start, '->', replacement.length);
