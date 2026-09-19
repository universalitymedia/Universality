const cron = require('node-cron');
const db = require('../db');
const tiktok = require('../services/tiktok');
const instagram = require('../services/instagram');

// Refreshes stats for every "tracking" submission. Runs hourly by default -
// adjust the cron expression below if you want tighter or looser polling.
// TikTok/Instagram both rate-limit; hourly is a safe starting point for a
// small-to-mid sized clipper roster.

async function syncTikTok(clipper, submission) {
  let accessToken = clipper.tiktok_access_token;

  if (clipper.tiktok_token_expires_at < Date.now()) {
    const refreshed = await tiktok.refreshToken(clipper.tiktok_refresh_token);
    accessToken = refreshed.access_token;
    db.prepare(`
      UPDATE clippers SET tiktok_access_token = ?, tiktok_refresh_token = ?, tiktok_token_expires_at = ?
      WHERE id = ?
    `).run(accessToken, refreshed.refresh_token, Date.now() + refreshed.expires_in * 1000, clipper.id);
  }

  const stats = await tiktok.findVideoStats(accessToken, submission.video_url);
  if (!stats) throw new Error('Video not found on connected TikTok account');

  db.prepare(`
    UPDATE submissions SET views = ?, likes = ?, comments = ?, shares = ?,
      platform_media_id = ?, last_synced_at = ?, sync_error = NULL WHERE id = ?
  `).run(stats.view_count, stats.like_count, stats.comment_count, stats.share_count,
    stats.id, Date.now(), submission.id);
}

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

async function syncInstagram(clipper, submission) {
  let accessToken = clipper.instagram_access_token;

  // Instagram tokens last ~60 days; refresh once they're within a week of expiring.
  if (clipper.instagram_token_expires_at - Date.now() < SEVEN_DAYS) {
    const refreshed = await instagram.refreshToken(accessToken);
    accessToken = refreshed.accessToken;
    db.prepare(`UPDATE clippers SET instagram_access_token = ?, instagram_token_expires_at = ? WHERE id = ?`)
      .run(accessToken, Date.now() + refreshed.expiresIn * 1000, clipper.id);
  }

  const stats = await instagram.findMediaStats(accessToken, submission.video_url);
  if (!stats) throw new Error('Media not found on connected Instagram account');

  db.prepare(`
    UPDATE submissions SET views = ?, likes = ?, comments = ?, saves = ?, shares = ?,
      platform_media_id = ?, last_synced_at = ?, sync_error = NULL WHERE id = ?
  `).run(stats.views, stats.likes, stats.comments, stats.saves, stats.shares,
    stats.id, Date.now(), submission.id);
}

async function runSync() {
  const submissions = db.prepare(`SELECT * FROM submissions WHERE status = 'tracking'`).all();
  console.log(`[sync] checking ${submissions.length} submission(s)`);

  for (const submission of submissions) {
    const clipper = db.prepare('SELECT * FROM clippers WHERE id = ?').get(submission.clipper_id);
    try {
      if (submission.platform === 'tiktok') await syncTikTok(clipper, submission);
      else if (submission.platform === 'instagram') await syncInstagram(clipper, submission);
    } catch (err) {
      const message = err.response?.data?.error?.message || err.message;
      console.error(`[sync] ${submission.platform} submission ${submission.id} failed: ${message}`);
      db.prepare(`UPDATE submissions SET sync_error = ?, last_synced_at = ? WHERE id = ?`)
        .run(message, Date.now(), submission.id);
    }
  }
}

function start() {
  cron.schedule('0 * * * *', runSync); // every hour, on the hour
  console.log('[sync] scheduled job registered (hourly)');
}

module.exports = { start, runSync };
