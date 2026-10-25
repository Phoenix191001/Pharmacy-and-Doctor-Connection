// Shared by both apps: API calls, live-update subscription, small helpers.
const API = {
  get: (u) => fetch(u).then((r) => r.json()),
  post: async (u, body) => {
    const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
};

function onLive(handler) {
  const dot = document.getElementById('live');
  const es = new EventSource('/api/events');
  es.onopen = () => { dot.textContent = '● Live'; };
  es.onerror = () => { dot.textContent = '○ Reconnecting...'; };
  es.onmessage = (e) => handler(JSON.parse(e.data).type);
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function stockBadge(m) {
  if (m.stock <= 0) return '<span class="badge out">Out of stock</span>';
  if (m.stock <= m.threshold) return `<span class="badge low">Low (${m.stock})</span>`;
  return `<span class="badge in">In stock (${m.stock})</span>`;
}
