function fmt(n) { return (n || 0).toLocaleString(); }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadSummary() {
  try {
    const res = await fetch('/api/ops/summary');
    if (res.status === 401) return (location.href = '/login.html');
    if (res.status === 403) {
      document.querySelector('.wrap').innerHTML = '<div class="msg error">Your Discord account is not on the ops access list.</div>';
      return false;
    }
    const s = await res.json();
    document.getElementById('totalViews').textContent = fmt(s.total_views);
    document.getElementById('totalLikes').textContent = fmt(s.total_likes);
    document.getElementById('totalComments').textContent = fmt(s.total_comments);
    document.getElementById('totalSaves').textContent = fmt(s.total_saves);
    document.getElementById('totalSubs').textContent = fmt(s.total_submissions);
    return true;
  } catch (err) {
    document.getElementById('banner').innerHTML = '<div class="msg error">Could not load dashboard. Refresh the page.</div>';
    return false;
  }
}

function renderLeaderboard(rows) {
  const body = document.getElementById('leaderboardBody');
  body.innerHTML = '';
  document.getElementById('emptyState').style.display = rows.length ? 'none' : 'block';

  for (const r of rows) {
    body.innerHTML += `
      <tr>
        <td><img class="avatar-sm" src="${r.discord_avatar}" alt=""> ${escapeHtml(r.discord_username)}</td>
        <td>${r.tiktok_username ? '@' + escapeHtml(r.tiktok_username) : '—'}</td>
        <td>${r.instagram_username ? '@' + escapeHtml(r.instagram_username) : '—'}</td>
        <td class="num-col">${fmt(r.total_views)}</td>
        <td class="num-col">${fmt(r.submission_count)}</td>
      </tr>`;
  }
}

async function loadLeaderboard() {
  const body = document.getElementById('leaderboardBody');
  try {
    const res = await fetch('/api/ops/leaderboard');
    renderLeaderboard(await res.json());
  } catch (err) {
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);">Could not load leaderboard.</td></tr>';
  }
}

let searchTimer;
document.getElementById('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  searchTimer = setTimeout(async () => {
    if (!q) return loadLeaderboard();
    try {
      const res = await fetch(`/api/ops/search?q=${encodeURIComponent(q)}`);
      renderLeaderboard(await res.json());
    } catch (err) {
      document.getElementById('leaderboardBody').innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);">Search failed.</td></tr>';
    }
  }, 250);
});

document.getElementById('clearSearch').addEventListener('click', () => {
  document.getElementById('searchInput').value = '';
  loadLeaderboard();
});

(async function init() {
  const ok = await loadSummary();
  if (ok) {
    loadLeaderboard();
    setInterval(loadSummary, 60000);
    setInterval(loadLeaderboard, 60000);
  }
})();
