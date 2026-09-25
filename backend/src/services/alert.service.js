import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const RETRY_DELAYS_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTransporter() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

/**
 * Sends a failure alert email when a daily post job fails for a location.
 */
export async function sendFailureAlert(locationId, businessName, error) {
  const timestamp = new Date().toISOString();
  const subject = `GBP Post Failed - ${businessName}`;
  const text = [
    'A Google Business Profile post failed during the daily job.',
    '',
    `Location ID: ${locationId}`,
    `Business: ${businessName}`,
    `Error: ${error}`,
    `Timestamp: ${timestamp}`,
  ].join('\n');

  if (env.MOCK_MODE) {
    console.info(
      JSON.stringify({
        event: 'failure_alert_mock',
        locationId,
        businessName,
        error,
        timestamp,
        subject,
      }),
    );
    return { mock: true };
  }

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.ALERT_EMAIL_FROM || !env.ALERT_EMAIL_TO) {
    console.warn(
      JSON.stringify({
        event: 'failure_alert_skipped',
        reason: 'SMTP or alert email env not configured',
        locationId,
        businessName,
        error,
      }),
    );
    return { skipped: true };
  }

  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: env.ALERT_EMAIL_FROM,
    to: env.ALERT_EMAIL_TO,
    subject,
    text,
  });

  console.info(
    JSON.stringify({
      event: 'failure_alert_sent',
      locationId,
      businessName,
      messageId: info.messageId,
    }),
  );

  return info;
}

/**
 * Sends an alert when mirroring a post to Facebook/Instagram via GHL fails.
 * The Google post itself is unaffected by this failure.
 */
export async function sendSocialPostFailureAlert(locationId, businessName, error, postId) {
  const timestamp = new Date().toISOString();
  const subject = `Social Post Failed - ${businessName}`;
  const text = [
    'Mirroring a post to Facebook/Instagram through GHL Social Planner failed.',
    'The Google Business Profile post was not affected.',
    '',
    `Location ID: ${locationId}`,
    `Business: ${businessName}`,
    `Post ID: ${postId ?? 'n/a'}`,
    `Error: ${error}`,
    `Timestamp: ${timestamp}`,
  ].join('\n');

  if (env.MOCK_MODE) {
    console.info(
      JSON.stringify({
        event: 'social_failure_alert_mock',
        locationId,
        businessName,
        postId,
        error,
        timestamp,
        subject,
      }),
    );
    return { mock: true };
  }

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.ALERT_EMAIL_FROM || !env.ALERT_EMAIL_TO) {
    console.warn(
      JSON.stringify({
        event: 'social_failure_alert_skipped',
        reason: 'SMTP or alert email env not configured',
        locationId,
        businessName,
        postId,
        error,
      }),
    );
    return { skipped: true };
  }

  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: env.ALERT_EMAIL_FROM,
    to: env.ALERT_EMAIL_TO,
    subject,
    text,
  });

  console.info(
    JSON.stringify({
      event: 'social_failure_alert_sent',
      locationId,
      businessName,
      postId,
      messageId: info.messageId,
    }),
  );

  return info;
}

const GOOGLE_CONNECTION_ALERT_EMAIL = 'ahmedrazagithub@gmail.com';

/**
 * Sends an alert when a location's Google OAuth refresh token is invalid or expired.
 */
export async function sendGoogleConnectionLostAlert(locationId, businessName, error) {
  const timestamp = new Date().toISOString();
  const subject = `Google Connection Lost - ${businessName}`;
  const text = [
    'A location lost its Google Business Profile connection and needs to be reconnected.',
    '',
    `Location ID: ${locationId}`,
    `Business: ${businessName}`,
    `Error: ${error}`,
    `Timestamp: ${timestamp}`,
    '',
    'Action required: Re-run Google OAuth for this location via GET /auth/google/url?state={locationId}',
  ].join('\n');

  if (env.MOCK_MODE) {
    console.info(
      JSON.stringify({
        event: 'google_connection_lost_alert_mock',
        locationId,
        businessName,
        error,
        timestamp,
        subject,
        to: GOOGLE_CONNECTION_ALERT_EMAIL,
      }),
    );
    return { mock: true };
  }

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.ALERT_EMAIL_FROM) {
    console.warn(
      JSON.stringify({
        event: 'google_connection_lost_alert_skipped',
        reason: 'SMTP or alert email env not configured',
        locationId,
        businessName,
        error,
        to: GOOGLE_CONNECTION_ALERT_EMAIL,
      }),
    );
    return { skipped: true };
  }

  const recipients = [GOOGLE_CONNECTION_ALERT_EMAIL];
  if (env.ALERT_EMAIL_TO && !recipients.includes(env.ALERT_EMAIL_TO)) {
    recipients.push(env.ALERT_EMAIL_TO);
  }

  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: env.ALERT_EMAIL_FROM,
    to: recipients.join(', '),
    subject,
    text,
  });

  console.info(
    JSON.stringify({
      event: 'google_connection_lost_alert_sent',
      locationId,
      businessName,
      messageId: info.messageId,
      to: recipients,
    }),
  );

  return info;
}

export { sleep, RETRY_DELAYS_MS };
