// Helpers shared by the Login, Doctor and Pharmacy pages.
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
    indicator.textContent = on ? '● Live' : '○ Reconnecting';
    indicator.className = 'live ' + (on ? 'on' : 'off');
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
