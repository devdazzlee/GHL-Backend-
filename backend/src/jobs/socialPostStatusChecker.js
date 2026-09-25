import cron from 'node-cron';
import { runSocialPostStatusCheck } from '../services/ghlSocial.service.js';

const CRON = '*/15 * * * *';

/**
 * Every 15 minutes: checks LIVE social posts from the last 24 hours for
 * GHL-side publish failures. Marks them FAILED and alerts once; never retries.
 */
export function startSocialPostStatusChecker() {
  cron.schedule(
    CRON,
    async () => {
      try {
        await runSocialPostStatusCheck();
      } catch (e) {
        console.error(
          JSON.stringify({
            event: 'social_status_check_fatal',
            error: e?.message ?? String(e),
          }),
        );
      }
    },
    { timezone: 'UTC' },
  );

  console.info(
    JSON.stringify({
      event: 'social_status_checker_registered',
      cron: CRON,
      timezone: 'UTC',
    }),
  );
}
