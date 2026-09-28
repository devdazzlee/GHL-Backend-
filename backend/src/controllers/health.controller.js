import { env } from '../config/env.js';

export function getHealth(req, res, next) {
  try {
    return res.json({
      success: true,
      data: {
        status: 'ok',
        uptimeSeconds: Math.round(process.uptime()),
        environment: env.NODE_ENV,
        timestamp: new Date().toISOString(),
        // Marker to verify GitHub Actions → VPS auto-deploy
        deployMarker: 'deploy-test-2026-09-28-backend',
      },
      requestId: req.requestId,
    });
  } catch (e) {
    next(e);
  }
}
