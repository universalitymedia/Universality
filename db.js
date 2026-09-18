const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'clipper.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS clippers (
  id TEXT PRIMARY KEY,
  discord_id TEXT UNIQUE NOT NULL,
  discord_username TEXT NOT NULL,
  discord_avatar TEXT,
  tiktok_open_id TEXT,
  tiktok_username TEXT,
  tiktok_access_token TEXT,
  tiktok_refresh_token TEXT,
  tiktok_token_expires_at INTEGER,
  instagram_user_id TEXT,
  instagram_username TEXT,
  instagram_access_token TEXT,
  instagram_token_expires_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  clipper_id TEXT NOT NULL REFERENCES clippers(id),
  platform TEXT NOT NULL CHECK(platform IN ('tiktok','instagram')),
  video_url TEXT NOT NULL,
  platform_media_id TEXT,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  demographic_file TEXT,
  status TEXT NOT NULL DEFAULT 'tracking' CHECK(status IN ('tracking','needs_review','rejected')),
  last_synced_at INTEGER,
  sync_error TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submissions_clipper ON submissions(clipper_id);
`);

module.exports = db;
