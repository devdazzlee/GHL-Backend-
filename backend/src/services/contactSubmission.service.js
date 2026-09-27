import prisma from '../database/client.js';

const siteSelect = {
  select: {
    businessName: true,
    slug: true,
  },
};

export async function listContactSubmissions(query = {}) {
  const page = Math.max(1, Number.parseInt(String(query.page ?? 1), 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(String(query.limit ?? 12), 10) || 12),
  );
  const search = String(query.search ?? '').trim();

  const where = {};
  // ghlStatus=FLAGGED lists leads that did not reach GHL (held or failed).
  const ghlStatus = String(query.ghlStatus ?? '').trim().toUpperCase();
  if (ghlStatus === 'FLAGGED') {
    where.ghlStatus = { in: ['HELD_NO_LOCATION', 'HELD_NO_KEY', 'FAILED'] };
  } else if (ghlStatus) {
    where.ghlStatus = ghlStatus;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { message: { contains: search, mode: 'insensitive' } },
      { site: { is: { businessName: { contains: search, mode: 'insensitive' } } } },
      { site: { is: { slug: { contains: search, mode: 'insensitive' } } } },
    ];
  }

  const skip = (page - 1) * limit;

  const [contacts, total] = await Promise.all([
    prisma.contactSubmission.findMany({
      where,
      include: { site: siteSelect },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.contactSubmission.count({ where }),
  ]);

  return {
    contacts,
    total,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}
