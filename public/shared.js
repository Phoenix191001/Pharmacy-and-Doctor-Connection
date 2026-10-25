// Helpers shared by the Pharmacy and (future) Doctor apps.
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, body) {
  const opts = body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  };
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Subscribe to server events; handlers = { medicines: fn, prescriptions: fn }.
function subscribe(handlers, indicator) {
  const es = new EventSource('/api/events');
  const set = (on) => {
    if (!indicator) return;
    indicator.textContent = on ? '● Live' : '○ Reconnecting';
    indicator.className = 'live ' + (on ? 'on' : 'off');
  };
  es.onopen = () => { set(true); Object.values(handlers).forEach((f) => f()); };
  es.onerror = () => set(false);
  for (const [name, fn] of Object.entries(handlers)) es.addEventListener(name, fn);
  return es;
}
