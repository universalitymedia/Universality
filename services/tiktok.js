const axios = require('axios');
const crypto = require('crypto');

// TikTok requires PKCE. Unlike standard OAuth PKCE (base64url), TikTok wants
// the challenge as a hex-encoded SHA256 digest of the verifier.
// Docs: https://developers.tiktok.com/doc/login-kit-web
function generatePkcePair() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let verifier = '';
  for (let i = 0; i < 64; i++) verifier += chars.charAt(Math.floor(Math.random() * chars.length));
  const challenge = crypto.createHash('sha256').update(verifier).digest('hex');
  return { verifier, challenge };
}

function getAuthorizeUrl(state, codeChallenge) {
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    response_type: 'code',
    scope: 'user.info.basic,video.list',
    redirect_uri: process.env.TIKTOK_REDIRECT_URI,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}

async function exchangeCodeForToken(code, codeVerifier) {
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: process.env.TIKTOK_REDIRECT_URI,
    code_verifier: codeVerifier
  });
  const res = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return res.data; // { access_token, refresh_token, open_id, expires_in, ... }
}

async function refreshToken(refresh_token) {
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token
  });
  const res = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return res.data;
}

// Pulls the clipper's recent videos (with stats) from TikTok's Display API.
// TikTok only returns stats for videos posted by the connected account,
// which is why the clipper has to connect their own account first.
async function listVideos(accessToken, cursor = 0) {
  const res = await axios.post(
    'https://open.tiktokapis.com/v2/video/list/?fields=id,share_url,view_count,like_count,comment_count,share_count',
    { max_count: 20, cursor },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );
  return res.data.data; // { videos: [...], cursor, has_more }
}

// Finds a specific submitted video's stats by matching share_url against
// the connected account's video list.
async function findVideoStats(accessToken, videoUrl) {
  let cursor = 0;
  for (let i = 0; i < 5; i++) {
    const page = await listVideos(accessToken, cursor);
    const match = (page.videos || []).find(v => videoUrl.includes(v.id) || v.share_url === videoUrl);
    if (match) return match;
    if (!page.has_more) break;
    cursor = page.cursor;
  }
  return null;
}

module.exports = { generatePkcePair, getAuthorizeUrl, exchangeCodeForToken, refreshToken, listVideos, findVideoStats };
