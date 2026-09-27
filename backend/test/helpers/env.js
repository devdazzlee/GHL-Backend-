/**
 * Imported first by every test file, before any src module, so config/env.js
 * sees these values (dotenv never overrides variables that are already set).
 * The unreachable DATABASE_URL makes any Prisma call a test forgot to stub
 * fail fast instead of touching a real database; empty SMTP settings make the
 * alert functions log "skipped" instead of sending email.
 */
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:9/test_should_never_connect';
process.env.MOCK_MODE = 'false';
process.env.GHL_API_KEY = '';
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.ALERT_EMAIL_FROM = '';
process.env.ALERT_EMAIL_TO = '';
// Never purge the real site cache from tests, and never reach a real frontend.
process.env.REVALIDATE_SECRET = '';
process.env.SITE_FRONTEND_URL = 'http://127.0.0.1:9';
process.env.ADMIN_API_KEYS = '';
process.env.SITE_RENDERER_API_KEY = '';
process.env.WEBHOOK_API_KEY = '';
