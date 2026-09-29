import './utils/logger.js';
import { createApp } from './app.js';
import { env, validateServerEnv } from './config/env.js';
import prisma from './database/client.js';
import { startScheduledJobs } from './jobs/index.js';
import { logger } from './utils/logger.js';

validateServerEnv();

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.info(
    JSON.stringify({
      event: 'server_listen',
      port: env.PORT,
      environment: env.NODE_ENV,
      logFile: logger.filePath,
      // Browser origins allowed for CORS and the Google-connect return (plus live custom domains).
      allowedOrigins: env.corsOrigins,
    }),
  );
  startScheduledJobs();
});

// Neon suspends the compute when idle, so the first connect after a cold start
// can take seconds or fail outright with P1001. Prisma connects lazily on the
// first query anyway, so warm the pool in the background: the port stays open
// while the database wakes up, and a transient failure never kills the process.
const MAX_CONNECT_ATTEMPTS = 6;

async function connectToDatabase(attempt = 1) {
  try {
    await prisma.$connect();
    console.info(JSON.stringify({ event: 'database_connected', attempt }));
  } catch (error) {
    if (attempt >= MAX_CONNECT_ATTEMPTS) {
      console.error(
        JSON.stringify({
          event: 'database_connect_failed',
          attempt,
          code: error?.errorCode ?? null,
          error: error?.message,
        }),
      );
      return;
    }

    const delayMs = Math.min(1000 * 2 ** (attempt - 1), 10_000);
    console.warn(
      JSON.stringify({
        event: 'database_connect_retry',
        attempt,
        delayMs,
        code: error?.errorCode ?? null,
      }),
    );
    setTimeout(() => void connectToDatabase(attempt + 1), delayMs).unref();
  }
}

void connectToDatabase();

async function shutdown(signal) {
  console.info(JSON.stringify({ event: 'shutdown', signal }));
  try {
    await prisma.$disconnect();
  } catch (e) {
    console.error(e);
  }
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
