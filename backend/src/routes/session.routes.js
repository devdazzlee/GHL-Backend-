import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import {
  SESSION_COOKIE,
  checkCredentials,
  createSessionToken,
  sessionCookieOptions,
  sessionFromRequest,
  signInConfigured,
} from '../services/adminSession.service.js';

/** Dashboard sign-in: POST /session/login, GET /session/me, POST /session/logout. */
const router = Router();

/** 10 wrong passwords per 15 minutes per IP; correct sign-ins don't count. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'LOGIN_RATE_LIMITED', message: 'Too many wrong sign-in attempts. Try again in 15 minutes.' },
  },
});

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    if (!signInConfigured()) {
      throw new AppError('Sign-in is not configured on the server (ADMIN_API_KEYS / JWT_SECRET).', 503, {
        code: 'AUTH_NOT_CONFIGURED',
      });
    }
    const label = checkCredentials(req.body?.username, req.body?.password);
    if (!label) {
      throw new AppError('Wrong username or password.', 401, { code: 'INVALID_LOGIN' });
    }
    res.cookie(SESSION_COOKIE, createSessionToken(label), sessionCookieOptions());
    console.info(JSON.stringify({ event: 'admin_signed_in', user: label, ip: req.ip }));
    return res.json({ success: true, data: { user: { name: label } }, requestId: req.requestId });
  }),
);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const session = sessionFromRequest(req);
    if (!session) throw new AppError('Not signed in.', 401, { code: 'AUTH_REQUIRED' });
    return res.json({ success: true, data: { user: { name: session.label } }, requestId: req.requestId });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const { maxAge: _maxAge, ...options } = sessionCookieOptions();
    res.clearCookie(SESSION_COOKIE, options);
    return res.json({ success: true, data: { signedOut: true }, requestId: req.requestId });
  }),
);

export default router;
