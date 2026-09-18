const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');
const db = require('../db');
const { requireClipper, requireOpsAdmin, isOpsAdmin } = require('../middleware/auth');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => cb(null, `${nanoid()}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB, covers screen recordings
  fileFilter: (req, file, cb) => {
    const ok = /image\/(png|jpe?g|webp)|video\/(mp4|quicktime|webm)/.test(file.mimetype);
    cb(ok ? null : new Error('Only images or short screen recordings are accepted'), ok);
  }
});

function detectPlatform(url) {
  if (/tiktok\.com/.test(url)) return 'tiktok';
  if (/instagram\.com/.test(url)) return 'instagram';
  return null;
}

// ---- Clipper: who am I / my connections ----

router.get('/me', requireClipper, (req, res) => {
  const c = db.prepare('SELECT id, discord_username, discord_avatar, tiktok_username, instagram_username FROM clippers WHERE id = ?')
    .get(req.session.clipperId);
  res.json({ ...c, isOpsAdmin: isOpsAdmin(req.session.discordId) });
});

// ---- Clipper: submit a video link (+ optional demographic screenshot) ----

router.post('/submissions', requireClipper, (req, res, next) => {
  upload.single('demographic_file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, (req, res) => {
  const { video_url } = req.body;
  if (!video_url) return res.status(400).json({ error: 'video_url is required' });

  const platform = detectPlatform(video_url);
  if (!platform) return res.status(400).json({ error: 'Link must be a TikTok or Instagram URL' });

  const clipper = db.prepare('SELECT * FROM clippers WHERE id = ?').get(req.session.clipperId);
  if (platform === 'tiktok' && !clipper.tiktok_access_token) {
    return res.status(400).json({ error: 'Connect your TikTok account before submitting a TikTok link' });
  }
  if (platform === 'instagram' && !clipper.instagram_access_token) {
    return res.status(400).json({ error: 'Connect your Instagram account before submitting an Instagram link' });
  }

  const id = nanoid();
  db.prepare(`
    INSERT INTO submissions (id, clipper_id, platform, video_url, demographic_file, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'tracking', ?)
  `).run(id, clipper.id, platform, video_url, req.file ? req.file.filename : null, Date.now());

  res.json({ id, status: 'tracking', message: 'Submitted. Stats sync automatically within the hour.' });
});

router.get('/submissions', requireClipper, (req, res) => {
  const rows = db.prepare('SELECT * FROM submissions WHERE clipper_id = ? ORDER BY created_at DESC')
    .all(req.session.clipperId);
  res.json(rows);
});

// ---- Ops dashboard: totals, leaderboard, search ----

router.get('/ops/summary', requireOpsAdmin, (req, res) => {
  const totals = db.prepare(`
    SELECT COALESCE(SUM(views),0) AS total_views,
           COALESCE(SUM(likes),0) AS total_likes,
           COALESCE(SUM(comments),0) AS total_comments,
           COALESCE(SUM(saves),0) AS total_saves,
           COUNT(*) AS total_submissions
    FROM submissions
  `).get();
  res.json(totals);
});

router.get('/ops/leaderboard', requireOpsAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT c.id AS clipper_id, c.discord_username, c.discord_avatar,
           c.tiktok_username, c.instagram_username,
           COALESCE(SUM(s.views),0) AS total_views,
           COALESCE(SUM(s.likes),0) AS total_likes,
           COALESCE(SUM(s.comments),0) AS total_comments,
           COALESCE(SUM(s.saves),0) AS total_saves,
           COUNT(s.id) AS submission_count
    FROM clippers c
    LEFT JOIN submissions s ON s.clipper_id = c.id
    GROUP BY c.id
    ORDER BY total_views DESC
  `).all();
  res.json(rows);
});

router.get('/ops/search', requireOpsAdmin, (req, res) => {
  const q = `%${(req.query.q || '').toLowerCase()}%`;
  const rows = db.prepare(`
    SELECT c.id AS clipper_id, c.discord_username, c.discord_avatar,
           c.tiktok_username, c.instagram_username,
           COALESCE(SUM(s.views),0) AS total_views,
           COUNT(s.id) AS submission_count
    FROM clippers c
    LEFT JOIN submissions s ON s.clipper_id = c.id
    WHERE LOWER(c.discord_username) LIKE ? OR LOWER(COALESCE(c.instagram_username,'')) LIKE ?
       OR LOWER(COALESCE(c.tiktok_username,'')) LIKE ?
    GROUP BY c.id
    ORDER BY total_views DESC
  `).all(q, q, q);
  res.json(rows);
});

router.get('/ops/clipper/:id', requireOpsAdmin, (req, res) => {
  const clipper = db.prepare('SELECT id, discord_username, discord_avatar, tiktok_username, instagram_username FROM clippers WHERE id = ?')
    .get(req.params.id);
  if (!clipper) return res.status(404).json({ error: 'Not found' });
  const submissions = db.prepare('SELECT * FROM submissions WHERE clipper_id = ? ORDER BY created_at DESC')
    .all(req.params.id);
  res.json({ clipper, submissions });
});

router.get('/uploads/:filename', requireOpsAdmin, (req, res) => {
  const filename = path.basename(req.params.filename);
  res.sendFile(path.join(__dirname, '..', 'uploads', filename), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'File not found' });
  });
});

module.exports = router;
