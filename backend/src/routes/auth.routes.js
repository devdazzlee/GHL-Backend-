import { Router } from 'express';
import {
  getAuthUrl,
  getGoogleOAuthCallback,
  getGoogleAccounts,
  getGoogleLocations,
  getGoogleDebugAccounts,
  postGoogleAuth,
  postRefreshToken,
} from '../controllers/auth.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAdmin } from '../middleware/phase4Auth.js';

const router = Router();

// Google redirects the browser here after consent, so it stays public (it checks its own state).
router.get('/google/callback', asyncHandler(getGoogleOAuthCallback));

// Everything else is used from the dashboard: sign-in required.
router.get('/google/url', requireAdmin, asyncHandler(getAuthUrl));
router.get('/google/accounts', requireAdmin, asyncHandler(getGoogleAccounts));
router.get('/google/locations', requireAdmin, asyncHandler(getGoogleLocations));
router.get('/google/debug-accounts', requireAdmin, asyncHandler(getGoogleDebugAccounts));
router.post('/google', requireAdmin, asyncHandler(postGoogleAuth));
router.post('/refresh/:locationId', requireAdmin, asyncHandler(postRefreshToken));

export default router;
