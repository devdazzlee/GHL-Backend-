/**
 * Lists the GHL users on a location, for choosing its ghlSocialUserId.
 * Not exposed as an API route because it returns names and emails.
 *
 *   node scripts/listGhlUsers.js <locationId>
 */
import prisma from '../src/database/client.js';
import { listGhlUsersForLocation } from '../src/services/ghlSocial.service.js';

const locationId = process.argv[2];
if (!locationId) {
  console.error('Usage: node scripts/listGhlUsers.js <locationId>');
  process.exit(1);
}

try {
  console.table(await listGhlUsersForLocation(locationId));
} catch (e) {
  console.error(e?.message ?? String(e));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
