function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadMe() {
  try {
    const res = await fetch('/api/me');
    if (res.status === 401) return (location.href = '/login.html');
    const me = await res.json();

    document.getElementById('userChip').innerHTML = `
      <img src="${me.discord_avatar}" alt="">
      ${escapeHtml(me.discord_username)}
      ${me.isOpsAdmin ? '<a href="/ops.html">Ops dashboard</a>' : ''}
      <a href="/auth/logout" onclick="event.preventDefault(); fetch('/auth/logout',{method:'POST'}).then(()=>location.href='/login.html')">Log out</a>
    `;

    document.getElementById('tiktokStatus').innerHTML = me.tiktok_username
      ? `<span class="pill connected">Connected as @${escapeHtml(me.tiktok_username)}</span>`
      : `<span class="pill">Not connected</span>`;

    document.getElementById('instagramStatus').innerHTML = me.instagram_username
      ? `<span class="pill connected">Connected as @${escapeHtml(me.instagram_username)}</span>`
      : `<span class="pill">Not connected</span>`;
  } catch (err) {
    document.getElementById('banner').innerHTML = '<div class="msg error">Could not load your account. Refresh the page.</div>';
  }
}

async function loadSubmissions() {
  const body = document.querySelector('#submissionsTable tbody');
  try {
    const res = await fetch('/api/submissions');
    const rows = await res.json();
    body.innerHTML = '';
    document.getElementById('emptyState').style.display = rows.length ? 'none' : 'block';

    for (const r of rows) {
      const statusLabel = r.sync_error ? `<span class="pill error" title="${escapeHtml(r.sync_error)}">Sync issue</span>`
        : r.last_synced_at ? `<span class="pill connected">Tracking</span>`
        : `<span class="pill">Pending first sync</span>`;

      body.innerHTML += `
        <tr>
          <td>${escapeHtml(r.platform)}</td>
          <td><a href="${escapeHtml(r.video_url)}" target="_blank" rel="noopener">view link</a></td>
          <td class="num-col">${r.views.toLocaleString()}</td>
          <td class="num-col">${r.likes.toLocaleString()}</td>
          <td class="num-col">${r.comments.toLocaleString()}</td>
          <td class="num-col">${r.saves.toLocaleString()}</td>
          <td>${statusLabel}</td>
        </tr>`;
    }
  } catch (err) {
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-dim);">Could not load submissions.</td></tr>';
  }
}

document.getElementById('submitForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const banner = document.getElementById('banner');
  const form = new FormData(e.target);
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalLabel = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const res = await fetch('/api/submissions', { method: 'POST', body: form });
    const data = await res.json();

    if (res.ok) {
      banner.innerHTML = `<div class="msg success">${escapeHtml(data.message)}</div>`;
      e.target.reset();
      loadSubmissions();
    } else {
      banner.innerHTML = `<div class="msg error">${escapeHtml(data.error)}</div>`;
    }
  } catch (err) {
    banner.innerHTML = '<div class="msg error">Network error — please try again.</div>';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
});

(function showConnectBanner() {
  const params = new URLSearchParams(location.search);
  const banner = document.getElementById('banner');
  if (params.get('connected')) {
    banner.innerHTML = `<div class="msg success">${params.get('connected')} connected.</div>`;
  } else if (params.get('error') === 'instagram_no_business_account') {
    banner.innerHTML = `<div class="msg error">Your Instagram needs to be a Business or Creator account before it can be connected. Switch account type in Instagram settings (Account type and tools), then try again.</div>`;
  } else if (params.get('error') === 'instagram_missing_insights') {
    banner.innerHTML = `<div class="msg error">Instagram wasn't connected because "Access and manage insights" was turned off. Click Connect Instagram again and make sure that permission is checked. We need it to count your views.</div>`;
  } else if (params.get('error')) {
    banner.innerHTML = `<div class="msg error">Connection failed. Try again.</div>`;
  }
  if (params.toString()) history.replaceState({}, '', location.pathname);
})();

loadMe();
loadSubmissions();
setInterval(loadSubmissions, 60000);
