/**
 * Scrub JSON/code artifacts from aboutContent and regenerate a real mission statement.
 *
 * Usage: node src/scripts/fixAboutContent.js [siteSlug]
 * Default slug: ember-clay-studio-portland
 */
import prisma from '../database/client.js';
import {
  FLOORS,
  TARGETS,
  countWords,
  scrubGeneratedContent,
} from '../services/contentContract.js';
import { generateUnit } from '../services/contentUnit.runner.js';
import { buildSeoRequirements } from '../services/seoMetadata.service.js';
import { getSchemaForIndustry } from '../services/industrySchema.service.js';
import { revalidateSiteFrontendCache } from '../services/siteRevalidation.service.js';

const DEFAULT_SLUG = 'ember-clay-studio-portland';

function parseJson(raw, fallback = {}) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function fixSite(site) {
  const before = parseJson(site.aboutContent);
  const scrubbed = scrubGeneratedContent(before);
  const p2Before = before?.story?.paragraph2 || '';
  const p2After = scrubbed?.story?.paragraph2 || '';

  const schema = await getSchemaForIndustry(site.industry);
  const businessData = {
    businessName: site.businessName,
    industry: site.industry,
    city: site.city,
    state: site.state,
    phone: site.phone,
    email: site.email,
    description: site.description,
  };

  const mission = await generateUnit({
    unitId: 'about.mission',
    systemPrompt: schema.systemPrompt,
    userPrompt: [
      `Write the about page mission statement for ${businessData.businessName}, a ${businessData.industry} business in ${businessData.city}, ${businessData.state}.`,
      buildSeoRequirements(businessData),
      'Describe purpose, who you serve, and local commitment — concrete, not a slogan.',
      `Return ONLY JSON: { "statement": "${TARGETS.aboutMissionStatement.min}-${TARGETS.aboutMissionStatement.max} words" }`,
      `HARD MINIMUM ${FLOORS.aboutMissionStatement} words.`,
      'Do not include JSON braces, quotes, or code artifacts inside the statement text.',
    ].join(' '),
    maxTokens: 600,
  });

  const next = {
    ...scrubbed,
    mission: {
      ...(scrubbed.mission || {}),
      heading: scrubbed.mission?.heading || 'Our Purpose',
      statement: mission.statement,
    },
  };

  await prisma.generatedSite.update({
    where: { id: site.id },
    data: { aboutContent: JSON.stringify(next) },
  });

  const revalidate = await revalidateSiteFrontendCache(site.slug);

  console.info(
    JSON.stringify(
      {
        event: 'about_content_fixed',
        slug: site.slug,
        paragraph2Changed: p2Before !== p2After,
        paragraph2EndBefore: p2Before.slice(-80),
        paragraph2EndAfter: p2After.slice(-80),
        missionWordsBefore: countWords(before?.mission?.statement),
        missionWordsAfter: countWords(next.mission.statement),
        revalidate,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const slug = process.argv[2] || DEFAULT_SLUG;
  const site = await prisma.generatedSite.findUnique({ where: { slug } });
  if (!site) {
    throw new Error(`Site not found: ${slug}`);
  }
  await fixSite(site);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
