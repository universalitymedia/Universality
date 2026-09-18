const axios = require('axios');

const GRAPH = 'https://graph.facebook.com/v19.0';

// Login flow goes through Facebook Login, then we find the Instagram
// Business/Creator account linked to the Page the clipper manages.
// This is a Meta requirement: personal Instagram accounts cannot be
// connected via the Graph API at all.
function getAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    redirect_uri: process.env.INSTAGRAM_REDIRECT_URI,
    scope: 'instagram_basic,instagram_manage_insights,pages_show_list',
    response_type: 'code',
    state
  });
  return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const res = await axios.get(`${GRAPH}/oauth/access_token`, {
    params: {
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      redirect_uri: process.env.INSTAGRAM_REDIRECT_URI,
      code
    }
  });
  return res.data; // { access_token, expires_in }
}

// Walks Pages -> connected Instagram Business Account for this user.
async function getInstagramAccount(userAccessToken) {
  const pagesRes = await axios.get(`${GRAPH}/me/accounts`, {
    params: { access_token: userAccessToken }
  });
  for (const page of pagesRes.data.data || []) {
    const igRes = await axios.get(`${GRAPH}/${page.id}`, {
      params: { fields: 'instagram_business_account', access_token: userAccessToken }
    });
    if (igRes.data.instagram_business_account) {
      return {
        instagramUserId: igRes.data.instagram_business_account.id,
        pageAccessToken: page.access_token
      };
    }
  }
  return null; // no Business/Creator IG account linked to any page they manage
}

async function getUsername(instagramUserId, accessToken) {
  const res = await axios.get(`${GRAPH}/${instagramUserId}`, {
    params: { fields: 'username', access_token: accessToken }
  });
  return res.data.username;
}

// Finds a submitted Reel/post's insights by matching permalink, then
// pulls views/likes/comments/saves from the Insights edge.
async function findMediaStats(instagramUserId, accessToken, videoUrl) {
  const mediaRes = await axios.get(`${GRAPH}/${instagramUserId}/media`, {
    params: { fields: 'id,permalink,like_count,comments_count', access_token: accessToken, limit: 50 }
  });
  const match = (mediaRes.data.data || []).find(m => videoUrl.includes(m.id) || videoUrl.startsWith(m.permalink));
  if (!match) return null;

  const insightsRes = await axios.get(`${GRAPH}/${match.id}/insights`, {
    params: { metric: 'plays,saved,shares', access_token: accessToken }
  });
  const metrics = {};
  for (const item of insightsRes.data.data || []) {
    metrics[item.name] = item.values?.[0]?.value ?? 0;
  }

  return {
    id: match.id,
    views: metrics.plays || 0,
    likes: match.like_count || 0,
    comments: match.comments_count || 0,
    saves: metrics.saved || 0,
    shares: metrics.shares || 0
  };
}

module.exports = { getAuthorizeUrl, exchangeCodeForToken, getInstagramAccount, getUsername, findMediaStats };
