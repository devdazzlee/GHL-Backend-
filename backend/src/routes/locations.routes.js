import { Router } from 'express';
import {
  approveLocationPost,
  deleteLocationPost,
  getLocationGbp,
  getLocationPost,
  listAllPendingPosts,
  deleteLocationMedia,
  listLocationMedia,
  listLocationPosts,
  listLocations,
  listLocationsSummary,
  publishLocationPost,
  rejectLocationPost,
  updateLocationGoogleLocation,
  updateLocationOfferConfig,
  updateLocationPost,
  updateLocationPostLength,
  updateLocationServiceTowns,
  uploadLocationMedia,
} from '../controllers/locations.controller.js';
import { parseMediaMultipart } from '../middleware/mediaUpload.js';
import { env } from '../config/env.js';
import prisma from '../database/client.js';
import { generateGBPQandA } from '../services/contentGenerator.service.js';
import { publishLocalPostToGoogle } from '../services/gbp.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

/**
 * Same coarse category inference the daily publisher uses, so Q&A questions
 * land on the same industry the posts do.
 */
function inferCategoryLabel(businessName) {
  const n = String(businessName ?? '').toLowerCase();
  if (n.includes('car') || n.includes('auto') || n.includes('vehicle')) return 'automotive';
  if (n.includes('hvac') || n.includes('heating') || n.includes('cooling')) return 'HVAC';
  return 'local business';
}

/**
 * Generates the business's 5 common Q&A pairs and, outside MOCK_MODE, publishes
 * each one to Google as a STANDARD local post.
 *
 * Note on the publish target: Google exposes no write API for the Q&A section
 * of a profile, so — as specified — each pair goes out as a standard local post
 * instead. Pairs are always returned in the response whether or not they were
 * published, and one failed publish does not abort the rest.
 */
router.post(
  '/:locationId/gbp/qa',
  asyncHandler(async (req, res) => {
    const { locationId } = req.params;

    const location = await prisma.location.findUnique({
      where: { id: locationId },
      include: { business: true },
    });
    if (!location) {
      throw new AppError('Location not found.', 404, { code: 'LOCATION_NOT_FOUND' });
    }

    const businessName = location.business?.name?.trim() || 'Business';
    const industry = inferCategoryLabel(businessName);
    const city =
      (location.serviceAreaTowns ?? []).find((t) => String(t ?? '').trim()) || 'New Jersey';

    const pairs = await generateGBPQandA(location, businessName, industry, city);

    if (env.MOCK_MODE) {
      return res.json({
        success: true,
        data: { locationId, businessName, industry, city, published: false, pairs },
        requestId: req.requestId,
      });
    }

    const published = [];
    for (const pair of pairs) {
      try {
        const result = await publishLocalPostToGoogle(location, {
          type: 'UPDATE',
          content: `${pair.question}\n\n${pair.answer}`,
          mediaUrl: null,
        });
        published.push({ question: pair.question, success: true, googlePostName: result?.name });
      } catch (e) {
        published.push({
          question: pair.question,
          success: false,
          error: e?.message ?? String(e),
        });
        console.error(
          JSON.stringify({
            event: 'qa_publish_failed',
            locationId,
            question: pair.question,
            error: e?.message ?? String(e),
          }),
        );
      }
    }

    return res.json({
      success: true,
      data: {
        locationId,
        businessName,
        industry,
        city,
        published: true,
        publishedCount: published.filter((p) => p.success).length,
        pairs,
        results: published,
      },
      requestId: req.requestId,
    });
  }),
);

router.get('/', asyncHandler(listLocations));
router.get('/summary', asyncHandler(listLocationsSummary));
router.get('/pending-posts', asyncHandler(listAllPendingPosts));
router.get('/:locationId/gbp', asyncHandler(getLocationGbp));
router.patch('/:locationId/service-towns', asyncHandler(updateLocationServiceTowns));
router.patch('/:locationId/offer-config', asyncHandler(updateLocationOfferConfig));
router.patch('/:locationId/post-length', asyncHandler(updateLocationPostLength));
router.patch('/:locationId/google-location', asyncHandler(updateLocationGoogleLocation));
router.get('/:locationId/media', asyncHandler(listLocationMedia));
router.post(
  '/:locationId/media/upload',
  parseMediaMultipart,
  asyncHandler(uploadLocationMedia),
);
router.delete('/:locationId/media/:mediaId', asyncHandler(deleteLocationMedia));
router.post('/:locationId/posts/publish', asyncHandler(publishLocationPost));
router.post('/:locationId/posts/:postId/approve', asyncHandler(approveLocationPost));
router.post('/:locationId/posts/:postId/reject', asyncHandler(rejectLocationPost));
router.patch('/:locationId/posts/:postId', asyncHandler(updateLocationPost));
router.delete('/:locationId/posts/:postId', asyncHandler(deleteLocationPost));
router.get('/:locationId/posts/:postId', asyncHandler(getLocationPost));
router.get('/:locationId/posts', asyncHandler(listLocationPosts));

export default router;
