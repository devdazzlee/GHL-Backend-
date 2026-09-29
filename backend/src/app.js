import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import locationsRoutes from './routes/locations.routes.js';
import businessesRoutes from './routes/businesses.routes.js';
import jobsRoutes from './routes/jobs.routes.js';
import testRoutes from './routes/test.routes.js';
import setupRoutes from './routes/setup.routes.js';
import scheduleRoutes from './routes/schedule.routes.js';
import phase4Routes from './routes/phase4.routes.js';
import { phase4Auth } from './middleware/phase4Auth.js';
import { createSiteOriginChecker } from './services/siteDomains.service.js';

export function createApp() {
  const app = express();

  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    // Production: 'https://site.peakwa.com',
    'https://ghl-backend-1qqr.vercel.app',
    'https://ghl-backend-eopr.vercel.app',
    process.env.DASHBOARD_URL,
    process.env.SITE_URL,
  ].filter(Boolean);
  // Live custom domains are allowed too (the contact form posts from the visitor's browser).
  const isAllowedSiteOrigin = createSiteOriginChecker();

  const corsOptions = {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      isAllowedSiteOrigin(origin).then(
        (allowed) => callback(null, allowed),
        () => callback(null, false),
      );
    },
    credentials: true,
  };

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  app.use('/health', healthRoutes);
  app.use('/auth', authRoutes);
  app.use('/locations', scheduleRoutes);
  app.use('/locations', locationsRoutes);
  app.use('/businesses', businessesRoutes);
  app.use('/jobs', jobsRoutes);

  if (env.NODE_ENV === 'development') {
    app.use('/test', testRoutes);
  }

  app.use('/setup', setupRoutes);
  // Everything under /phase4 needs a key except the public contact form endpoint.
  app.use('/phase4', ...phase4Auth, phase4Routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
