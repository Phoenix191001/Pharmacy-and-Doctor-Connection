// Minimal Supabase (PostgREST) client. Only the server uses it, with the service-role key.
require('./env');

class DbError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new DbError(500, 'Server is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  return { base: url.replace(/\/+$/, '') + '/rest/v1', key };
}

// rest('GET', 'medicines?select=*') -> parsed JSON. Writes return the affected rows.
async function rest(method, path, { body, headers } = {}) {
  const { base, key } = config();
  const res = await fetch(`${base}/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(method === 'GET' ? {} : { Prefer: 'return=representation' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  if (!res.ok) {
    // Only validation-type errors reach the browser as-is; auth/outage problems on our side are a 500.
    const status = [400, 404, 409].includes(res.status) ? res.status : 500;
    const msg = (data && data.message) || `Database error (${res.status})`;
    throw new DbError(status, status === 500 ? `Database error: ${msg}` : msg);
  }
  return data;
}

// PostgREST filter values: quote anything user-supplied.
const eq = (v) => 'eq.' + encodeURIComponent(v);

module.exports = { rest, eq, DbError };
