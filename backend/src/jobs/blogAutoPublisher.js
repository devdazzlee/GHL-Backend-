import cron from 'node-cron';
import { env } from '../config/env.js';
import { runDueAutoPosts } from '../services/blog.service.js';

/**
 * Every 10 minutes: writes and publishes a blog post for each site whose
 * schedule is due (see blog.service.js). One post per site per scheduled day,
 * enforced by the database, so overlapping servers cannot double-post.
 */
export function startBlogAutoPublisher() {
  if (!env.BLOG_AUTOPUBLISH) {
    console.info(JSON.stringify({ event: 'blog_auto_publisher_disabled', reason: 'BLOG_AUTOPUBLISH=false' }));
    return;
  }
  cron.schedule('*/10 * * * *', async () => {
    try {
      const results = await runDueAutoPosts(new Date());
      const acted = results.filter((r) => r.status === 'published' || r.status === 'failed');
      if (acted.length) console.info(JSON.stringify({ event: 'blog_auto_publisher_tick', results: acted.map(({ post, ...r }) => r) }));
    } catch (error) {
      console.error(JSON.stringify({ event: 'blog_auto_publisher_error', error: error instanceof Error ? error.message : String(error) }));
    }
  });
}
