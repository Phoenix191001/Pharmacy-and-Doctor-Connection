// Helpers shared by the Login, Doctor and Pharmacy pages.
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// KIHD heart + pulse logo. Any <span data-logo> is replaced with it.
const LOGO = '<svg class="logo" viewBox="0 0 48 48" aria-hidden="true"><path class="heart" d="M24 41.5C8 29.5 4 22 4 16.2 4 10.6 8.4 6.5 13.8 6.5c4 0 7.9 2.3 10.2 6.1 2.3-3.8 6.2-6.1 10.2-6.1C39.6 6.5 44 10.6 44 16.2 44 22 40 29.5 24 41.5z"/><polyline class="pulse" points="7,25 16,25 20,17 26,33 30,23 41,23"/></svg>';
document.querySelectorAll('[data-logo]').forEach((el) => { el.outerHTML = LOGO; });

// Small pop-up message (replaces alert). type: 'ok' | 'err' | undefined
function toast(msg, type) {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, type === 'err' ? 5200 : 3200);
}

const timeAgo = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return new Date(iso).toLocaleDateString();
};

// Counts a number up/down smoothly.
function countTo(el, to) {
  const from = Number(el.dataset.v ?? 0);
  el.dataset.v = to;
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 600);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// JSON call to the server. Sends a POST when a body is given. A 401 means the session ended.
async function api(path, body) {
  const opts = body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  };
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/auth/login') {
    location.href = '/';
    throw new Error('Session ended. Please log in again.');
  }
  // 403 = this browser is now signed in as someone else (e.g. in another tab): reload to land on the right page.
  if (res.status === 403) setTimeout(() => location.reload(), 1800);
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Makes sure the right person is on this page; otherwise sends them to login / their own side.
async function requireRole(role) {
  let me;
  try { me = await api('/api/auth/me'); } catch { return new Promise(() => {}); }
  if (me.role !== role) { location.href = me.role === 'doctor' ? '/doctor/' : '/lab/'; return new Promise(() => {}); }
  return me;
}

async function logout() {
  try { await api('/api/auth/logout', {}); } catch { /* leave anyway */ }
  location.href = '/';
}

// Re-runs refresh() every few seconds (and when the tab becomes visible again) so changes made
// on the other side appear without reloading. indicator = the "Live" label element.
function startPolling(refresh, indicator, ms = 3000) {
  const set = (on) => {
    if (!indicator) return;
    indicator.textContent = on ? 'Live' : 'Reconnecting…';
    indicator.className = 'live' + (on ? '' : ' off');
  };
  let busy = false;
  const tick = async () => {
    if (busy || document.hidden) return;
    busy = true;
    try { await refresh(); set(true); } catch { set(false); } finally { busy = false; }
  };
  document.addEventListener('visibilitychange', tick);
  tick();
  return setInterval(tick, ms);
}

// True when new data differs from what is on screen (so we only redraw on real changes).
const changed = (() => {
  const last = {};
  return (key, data) => {
    const s = JSON.stringify(data);
    if (last[key] === s) return false;
    last[key] = s;
    return true;
  };
})();
