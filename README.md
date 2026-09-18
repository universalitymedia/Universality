# Universality

Two dashboards:
- **Clipper dashboard** (`/login.html` → `/clipper.html`): Discord login, connect TikTok/Instagram, submit clip links, upload demographic screenshots/recordings.
- **Ops dashboard** (`/ops.html`): total views tracked, per-clipper leaderboard, search by Discord username or Instagram handle.

Stats sync automatically once an hour via a background job that calls the TikTok and Instagram APIs for each clipper's **connected** account. This is how every real clipping platform (Whop, etc.) does it — there is no way to pull stats for a video without the poster connecting their own account first; that's a platform restriction, not a limitation of this app.

## 1. Local setup

```bash
npm install
cp .env.example .env
# fill in the values in .env — see below for where each one comes from
npm start
```

Visit `http://localhost:3000`.

## 2. Getting each API credential

### Discord (required — this is the login)
1. https://discord.com/developers/applications → **New Application**
2. OAuth2 → Redirects → add `http://localhost:3000/auth/discord/callback` (and your production URL later)
3. Copy **Client ID** and **Client Secret** into `.env`
4. To find your own Discord ID for `OPS_ADMIN_DISCORD_IDS`: Discord Settings → Advanced → enable Developer Mode → right-click your name anywhere → **Copy User ID**

### TikTok (for automatic TikTok stats)
1. https://developers.tiktok.com/apps → create an app
2. Add products: **Login Kit** and **Display API**
3. Request the `video.list` scope
4. Add redirect URI: `http://localhost:3000/auth/tiktok/callback`
5. **Important:** TikTok requires app review before real (non-sandbox) users can grant `video.list`. This typically takes several business days. You can test the full flow immediately with TikTok's sandbox test accounts while waiting on approval.

### Instagram (for automatic Instagram stats)
1. https://developers.facebook.com/apps → create a **Business** app
2. Add product **Instagram Graph API**
3. Add redirect URI: `http://localhost:3000/auth/instagram/callback`
4. **Hard requirement from Meta, not from this app:** each clipper's Instagram must be a **Business or Creator account** linked to a Facebook Page they manage. Personal accounts cannot be connected via this API at all — if a clipper only has a personal account, they'll need to switch (Instagram app → Settings → Account type → switch to Professional).
5. Meta also requires App Review for `instagram_manage_insights` before it works for real users outside your test list.

## 3. What "automatic" actually covers

| Platform | Auto view/like/comment tracking | Notes |
|---|---|---|
| TikTok | Yes, once connected | Polls hourly via Display API |
| Instagram | Yes, once connected | Requires Business/Creator account (Meta's rule) |
| Demographics | No, manual upload only | Neither platform exposes another creator's audience data via API — this has to be a screenshot from the clipper's own analytics |

## 4. Deploying somewhere real

This needs to run as a persistent server (not a serverless function) because of the hourly cron job. Render, Railway, or Fly.io all work well and have free/cheap tiers:

1. Push this folder to a GitHub repo
2. Create a new Web Service on Render/Railway pointing at it
3. Set the build command to `npm install` and start command to `npm start`
4. Add all the `.env` values as environment variables in the host's dashboard
5. Update `BASE_URL` and all three redirect URIs to your real domain, and update those same redirect URIs in the Discord/TikTok/Meta developer dashboards to match

## 5. Adjusting sync frequency

Edit the cron expression in `jobs/poll.js`:
```js
cron.schedule('0 * * * *', runSync); // hourly
```
e.g. `'*/15 * * * *'` for every 15 minutes — just watch TikTok/Meta's rate limits as you go tighter.

## 6. Notes on data

Everything is stored in a local SQLite file at `data/clipper.db`. Fine for a small-to-mid roster; if this grows large or you deploy to a host with an ephemeral filesystem (some free tiers wipe disk on restart), swap `better-sqlite3` for a hosted Postgres database — the `db.js` file is the only place that needs to change since all queries go through it.
