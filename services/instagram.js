const axios = require('axios');

// Instagram API with Instagram Login: clippers sign in with Instagram directly
// (no Facebook Page needed), but the account must be a Business or Creator account.
const GRAPH = 'https://graph.instagram.com/v22.0';

function getAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID,
    redirect_uri: process.env.INSTAGRAM_REDIRECT_URI,
    response_type: 'code',
    scope: 'instagram_business_basic,instagram_business_manage_insights',
    state
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

const INSIGHTS_SCOPE = 'instagram_business_manage_insights';

function grantedPermissions(shortData) {
  const p = shortData.permissions;
  if (p === undefined || p === null) return null;
  return (Array.isArray(p) ? p : String(p).split(/[,\s]+/)).filter(Boolean);
}

// Trades the auth code for a short-lived token, then upgrades it to a ~60 day token.
// Throws err.code === 'MISSING_INSIGHTS' if the person unticked the insights permission
// on Instagram's consent screen (Instagram lets them opt out of it).
async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID,
    client_secret: process.env.INSTAGRAM_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: process.env.INSTAGRAM_REDIRECT_URI,
    code
  });
  const short = await axios.post('https://api.instagram.com/oauth/access_token', body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  const shortData = Array.isArray(short.data?.data) ? short.data.data[0] : short.data;

  const granted = grantedPermissions(shortData);
  if (granted && !granted.includes(INSIGHTS_SCOPE)) {
    const err = new Error('Instagram insights permission was not granted');
    err.code = 'MISSING_INSIGHTS';
    throw err;
  }

  const long = await axios.get('https://graph.instagram.com/access_token', {
    params: {
      grant_type: 'ig_exchange_token',
      client_secret: process.env.INSTAGRAM_APP_SECRET,
      access_token: shortData.access_token
    }
  });
  return { accessToken: long.data.access_token, expiresIn: long.data.expires_in };
}

async function getProfile(accessToken) {
  const res = await axios.get(`${GRAPH}/me`, {
    params: { fields: 'user_id,username,account_type', access_token: accessToken }
  });
  return {
    userId: String(res.data.user_id || res.data.id),
    username: res.data.username,
    accountType: res.data.account_type
  };
}

async function refreshToken(accessToken) {
  const res = await axios.get('https://graph.instagram.com/refresh_access_token', {
    params: { grant_type: 'ig_refresh_token', access_token: accessToken }
  });
  return { accessToken: res.data.access_token, expiresIn: res.data.expires_in };
}

function shortcodeFromUrl(url) {
  const m = String(url).match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

async function getInsights(mediaId, accessToken) {
  const metrics = {};
  let res;
  try {
    res = await axios.get(`${GRAPH}/${mediaId}/insights`, {
      params: { metric: 'views,saved,shares', access_token: accessToken }
    });
  } catch (err) {
    // Code 10 / 200 = the token lacks the insights permission.
    const code = err.response?.data?.error?.code;
    if (code === 10 || code === 200) {
      throw new Error("Instagram insights permission missing - reconnect Instagram and leave 'Access and manage insights' on");
    }
    throw err;
  }
  for (const item of res.data.data || []) {
    metrics[item.name] = item.values?.[0]?.value ?? item.total_value?.value ?? 0;
  }
  return metrics;
}

// Finds a submitted post among the connected account's recent media (by URL
// shortcode) and returns its stats.
async function findMediaStats(accessToken, videoUrl) {
  const shortcode = shortcodeFromUrl(videoUrl);
  if (!shortcode) return null;

  let url = `${GRAPH}/me/media`;
  let params = { fields: 'id,permalink,like_count,comments_count', limit: 50, access_token: accessToken };
  let match = null;

  for (let page = 0; page < 5 && !match; page++) {
    const res = await axios.get(url, { params });
    match = (res.data.data || []).find(m => shortcodeFromUrl(m.permalink) === shortcode);
    if (!res.data.paging?.next) break;
    url = res.data.paging.next;
    params = undefined;
  }
  if (!match) return null;

  const metrics = await getInsights(match.id, accessToken);
  return {
    id: match.id,
    views: metrics.views || 0,
    likes: match.like_count || 0,
    comments: match.comments_count || 0,
    saves: metrics.saved || 0,
    shares: metrics.shares || 0
  };
}

module.exports = { getAuthorizeUrl, exchangeCodeForToken, getProfile, refreshToken, shortcodeFromUrl, findMediaStats };
