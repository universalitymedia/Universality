const express = require('express');
const { nanoid } = require('nanoid');
const db = require('../db');
const discord = require('../services/discord');
const tiktok = require('../services/tiktok');
const instagram = require('../services/instagram');
const { requireClipper } = require('../middleware/auth');

const router = express.Router();

// ---- Discord login (identity) ----

router.get('/discord', (req, res) => {
  res.redirect(discord.getAuthorizeUrl());
});

router.get('/discord/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect('/login.html?error=discord_denied');

    const token = await discord.exchangeCodeForToken(code);
    const user = await discord.getDiscordUser(token.access_token);

    let clipper = db.prepare('SELECT * FROM clippers WHERE discord_id = ?').get(user.id);
    if (!clipper) {
      const id = nanoid();
      db.prepare(`
        INSERT INTO clippers (id, discord_id, discord_username, discord_avatar, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, user.id, user.username, discord.avatarUrl(user), Date.now());
      clipper = db.prepare('SELECT * FROM clippers WHERE id = ?').get(id);
    } else {
      db.prepare('UPDATE clippers SET discord_username = ?, discord_avatar = ? WHERE id = ?')
        .run(user.username, discord.avatarUrl(user), clipper.id);
    }

    req.session.clipperId = clipper.id;
    req.session.discordId = clipper.discord_id;
    res.redirect('/clipper.html');
  } catch (err) {
    console.error('Discord callback error:', err.response?.data || err.message);
    res.redirect('/login.html?error=discord_failed');
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

// ---- TikTok account connect ----

router.get('/tiktok', requireClipper, (req, res) => {
  const state = req.session.clipperId; // simple state binding; use a signed value in production
  const { verifier, challenge } = tiktok.generatePkcePair();
  req.session.tiktokCodeVerifier = verifier; // needed again in the callback below
  res.redirect(tiktok.getAuthorizeUrl(state, challenge));
});

router.get('/tiktok/callback', requireClipper, async (req, res) => {
  try {
    const { code } = req.query;
    const verifier = req.session.tiktokCodeVerifier;
    if (!verifier) return res.redirect('/clipper.html?error=tiktok_failed'); // session expired, e.g. user took too long
    const token = await tiktok.exchangeCodeForToken(code, verifier);
    delete req.session.tiktokCodeVerifier;
    db.prepare(`
      UPDATE clippers SET tiktok_open_id = ?, tiktok_access_token = ?, tiktok_refresh_token = ?,
        tiktok_token_expires_at = ? WHERE id = ?
    `).run(
      token.open_id,
      token.access_token,
      token.refresh_token,
      Date.now() + (token.expires_in * 1000),
      req.session.clipperId
    );
    res.redirect('/clipper.html?connected=tiktok');
  } catch (err) {
    console.error('TikTok callback error:', err.response?.data || err.message);
    res.redirect('/clipper.html?error=tiktok_failed');
  }
});

// ---- Instagram account connect ----

router.get('/instagram', requireClipper, (req, res) => {
  const state = nanoid();
  req.session.instagramState = state;
  res.redirect(instagram.getAuthorizeUrl(state));
});

router.get('/instagram/callback', requireClipper, async (req, res) => {
  try {
    const { code, state, error } = req.query;
    const expectedState = req.session.instagramState;
    delete req.session.instagramState;

    if (error || !code) return res.redirect('/clipper.html?error=instagram_failed');
    if (!state || state !== expectedState) return res.redirect('/clipper.html?error=instagram_failed');

    const token = await instagram.exchangeCodeForToken(String(code));
    const profile = await instagram.getProfile(token.accessToken);

    // Personal accounts can't use this API; only Business/Creator accounts can be connected.
    if (profile.accountType && !['BUSINESS', 'MEDIA_CREATOR', 'CREATOR'].includes(profile.accountType)) {
      return res.redirect('/clipper.html?error=instagram_no_business_account');
    }

    db.prepare(`
      UPDATE clippers SET instagram_user_id = ?, instagram_username = ?, instagram_access_token = ?,
        instagram_token_expires_at = ? WHERE id = ?
    `).run(
      profile.userId,
      profile.username,
      token.accessToken,
      Date.now() + (token.expiresIn * 1000),
      req.session.clipperId
    );
    res.redirect('/clipper.html?connected=instagram');
  } catch (err) {
    if (err.code === 'MISSING_INSIGHTS') {
      return res.redirect('/clipper.html?error=instagram_missing_insights');
    }
    console.error('Instagram callback error:', err.response?.data || err.message);
    res.redirect('/clipper.html?error=instagram_failed');
  }
});

module.exports = router;
