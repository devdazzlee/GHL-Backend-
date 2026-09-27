import axios from 'axios';
import { env } from '../config/env.js';
import prisma from '../database/client.js';

/**
 * Delivers a generated site's contact-form lead to the GHL location mapped to
 * that site (GeneratedSite.leadLocationId). There is no fallback: an unmapped
 * site's leads are held in our database and flagged, never sent to some other
 * business's GHL. Never throws; the result is recorded on the submission.
 */

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';
const GHL_TIMEOUT_MS = 20_000;

export const LEAD_STATUS = {
  SENT: 'SENT',
  HELD_NO_LOCATION: 'HELD_NO_LOCATION',
  HELD_NO_KEY: 'HELD_NO_KEY',
  FAILED: 'FAILED',
  SKIPPED_MOCK: 'SKIPPED_MOCK',
};

function splitName(full) {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

function ghlErrorMessage(e) {
  const d = e?.response?.data;
  const m = d?.message ?? d?.error ?? e?.message ?? String(e);
  return Array.isArray(m) ? m.join('; ') : String(m);
}

/** Decides where a lead goes, without calling GHL. */
export async function resolveLeadDestination(site) {
  if (!site?.leadLocationId) return { status: LEAD_STATUS.HELD_NO_LOCATION };
  const location = await prisma.location.findUnique({
    where: { id: site.leadLocationId },
    select: { id: true, ghlLocationId: true, ghlApiKey: true, status: true },
  });
  if (!location || location.status !== 'ACTIVE' || !location.ghlApiKey?.trim()) {
    return { status: LEAD_STATUS.HELD_NO_KEY, ghlLocationId: location?.ghlLocationId ?? null };
  }
  return { status: 'READY', location };
}

async function recordResult(submissionId, data) {
  try {
    await prisma.contactSubmission.update({ where: { id: submissionId }, data });
  } catch (e) {
    console.error(JSON.stringify({ event: 'lead_status_record_failed', submissionId, error: e?.message ?? String(e) }));
  }
}

/** Upserts the contact into the site's GHL location and adds the message as a note. */
export async function deliverLeadToGhl(site, submission) {
  const destination = await resolveLeadDestination(site);

  if (destination.status !== 'READY') {
    const data = {
      ghlStatus: destination.status,
      ghlLocationId: destination.ghlLocationId ?? null,
      ghlError:
        destination.status === LEAD_STATUS.HELD_NO_LOCATION
          ? 'No GHL location is mapped to this site; lead held.'
          : 'Mapped GHL location is inactive or has no API key; lead held.',
    };
    console.warn(JSON.stringify({ event: 'lead_held', siteSlug: site.slug, submissionId: submission.id, reason: data.ghlStatus }));
    await recordResult(submission.id, data);
    return data;
  }

  const { location } = destination;
  if (env.MOCK_MODE) {
    const data = { ghlStatus: LEAD_STATUS.SKIPPED_MOCK, ghlLocationId: location.ghlLocationId, ghlError: null };
    await recordResult(submission.id, data);
    return data;
  }

  const headers = {
    Authorization: `Bearer ${location.ghlApiKey.trim()}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Version: GHL_VERSION,
  };

  try {
    const { firstName, lastName } = splitName(submission.name);
    const upsert = await axios.post(
      `${GHL_BASE}/contacts/upsert`,
      {
        locationId: location.ghlLocationId,
        firstName,
        ...(lastName ? { lastName } : {}),
        email: submission.email,
        ...(submission.phone ? { phone: submission.phone } : {}),
        source: 'Website Contact Form',
        tags: ['website-lead', `site:${site.slug}`],
      },
      { headers, timeout: GHL_TIMEOUT_MS },
    );
    const contactId = upsert.data?.contact?.id ?? upsert.data?.contact?._id ?? null;

    // The visitor's message as a note; a failure here doesn't undo the contact.
    if (contactId && submission.message) {
      try {
        await axios.post(
          `${GHL_BASE}/contacts/${encodeURIComponent(contactId)}/notes`,
          { body: `Website contact form (${site.slug}):\n\n${submission.message}` },
          { headers, timeout: GHL_TIMEOUT_MS },
        );
      } catch (e) {
        console.warn(JSON.stringify({ event: 'lead_note_failed', submissionId: submission.id, error: ghlErrorMessage(e) }));
      }
    }

    const data = { ghlStatus: LEAD_STATUS.SENT, ghlLocationId: location.ghlLocationId, ghlContactId: contactId, ghlError: null };
    await recordResult(submission.id, data);
    return data;
  } catch (e) {
    const data = { ghlStatus: LEAD_STATUS.FAILED, ghlLocationId: location.ghlLocationId, ghlError: ghlErrorMessage(e).slice(0, 500) };
    console.error(JSON.stringify({ event: 'lead_send_failed', siteSlug: site.slug, submissionId: submission.id, error: data.ghlError }));
    await recordResult(submission.id, data);
    return data;
  }
}
