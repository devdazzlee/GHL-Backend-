import { env } from '../config/env.js';
import { startBlogAutoPublisher } from './blogAutoPublisher.js';
import { startDailyPostPublisher } from './dailyPostPublisher.js';
import { startSocialPostStatusChecker } from './socialPostStatusChecker.js';

export function startScheduledJobs() {
  // Local dev servers connect to the production database, so their cron jobs
  // would publish to live Google/social profiles. SCHEDULED_JOBS=off stops that.
  if (env.SCHEDULED_JOBS === 'off') {
    console.info(JSON.stringify({ event: 'scheduled_jobs_disabled', reason: 'SCHEDULED_JOBS=off' }));
    return;
  }
  startDailyPostPublisher();
  startSocialPostStatusChecker();
  startBlogAutoPublisher();
}
