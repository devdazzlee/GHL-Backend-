import { startBlogAutoPublisher } from './blogAutoPublisher.js';
import { startDailyPostPublisher } from './dailyPostPublisher.js';
import { startSocialPostStatusChecker } from './socialPostStatusChecker.js';

export function startScheduledJobs() {
  startDailyPostPublisher();
  startSocialPostStatusChecker();
  startBlogAutoPublisher();
}
