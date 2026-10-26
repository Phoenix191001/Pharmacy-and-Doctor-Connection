// One request handler used by both Vercel (api/[...path].js) and local dev (server.js).
const { rest, eq, DbError } = require('./supabase');
const auth = require('./auth');

const MAX_BODY = 1e6;
const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);
const str = (v) => String(v ?? '').trim();

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  // Vercel may already have parsed the body.
  if (req.body !== undefined) {
    if (Buffer.isBuffer(req.body)) req.body = req.body.toString();
    if (typeof req.body === 'string') {
      try { return req.body ? JSON.parse(req.body) : {}; } catch { throw new DbError(400, 'Invalid JSON'); }
    }
    return req.body || {};
  }
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > MAX_BODY) { reject(new DbError(413, 'Body too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new DbError(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// Medicines counted one by one: quantity = dose x times a day x days.
// Syrups and inhalers are stocked per bottle/device, so the doctor enters packs instead.
const COUNTABLE = ['tablet', 'capsule', 'sublingual', 'sachet', 'injection'];
const UNIT = { tablet: 'tablet', capsule: 'capsule', sublingual: 'tablet', sachet: 'sachet', injection: 'injection', syrup: 'ml', inhaler: 'puff' };
const TIMES = { 1: 'once a day', 2: 'twice a day' };

function buildItem(it, med) {
  const base = { medicineId: med.id, name: med.name, formula: med.formula };
  // Older clients send a plain quantity.
  if (it.dose === undefined && it.timesPerDay === undefined && it.days === undefined) {
    const qty = Math.floor(num(it.qty));
    if (qty < 1) throw new DbError(400, `Invalid quantity for ${med.name}`);
    return { ...base, qty, dosage: str(it.dosage) };
  }
  const dose = num(it.dose);
  const times = Math.floor(num(it.timesPerDay));
  const days = Math.floor(num(it.days));
  if (!(dose > 0 && dose <= 50)) throw new DbError(400, `Enter a dose for ${med.name}`);
  if (times < 1 || times > 12) throw new DbError(400, `Times a day must be 1 to 12 for ${med.name}`);
  if (days < 1 || days > 365) throw new DbError(400, `Number of days must be 1 to 365 for ${med.name}`);
  const form = String(med.form || '').toLowerCase();
  const counted = COUNTABLE.includes(form);
  const qty = counted ? Math.ceil(+(dose * times * days).toFixed(6)) : Math.floor(num(it.packs, 1));
  if (qty < 1) throw new DbError(400, `Invalid quantity for ${med.name}`);
  const unit = UNIT[form] || 'unit';
  const plural = unit === 'ml' || dose === 1 ? unit : unit + 's';
  const notes = str(it.notes).slice(0, 200);
  const dosage = `${dose} ${plural}, ${TIMES[times] || times + ' times a day'} for ${days} day${days === 1 ? '' : 's'}` + (notes ? ` · ${notes}` : '');
  return { ...base, qty, dose, timesPerDay: times, days, notes, dosage };
}

const rxOut = (r) => ({
  id: r.id, patient: r.patient, doctor: r.doctor, items: r.items, status: r.status,
  createdAt: r.created_at, dispensedAt: r.dispensed_at,
});

function requireRole(session, role) {
  if (!session) throw new DbError(401, 'Please log in');
  if (session.role !== role) throw new DbError(403, `Only ${role} staff can do this`);
}

// A password check always costs the same, whether or not the user exists.
const DUMMY_HASH = 'scrypt$00000000000000000000000000000000$' + '00'.repeat(64);

async function login(req, res) {
  const b = await readBody(req);
  const username = str(b.username).toLowerCase();
  const password = String(b.password ?? '');
  if (!username || !password) throw new DbError(400, 'Enter username and password');
  const rows = await rest('GET', `users?username=${eq(username)}&select=id,username,role,display_name,password_hash&limit=1`);
  const user = rows[0];
  const ok = auth.verifyPassword(password, user ? user.password_hash : DUMMY_HASH) && !!user;
  if (!ok) {
    await new Promise((r) => setTimeout(r, 400));
    throw new DbError(401, 'Wrong username or password');
  }
  auth.setSession(res, req, user);
  send(res, 200, { role: user.role, name: user.display_name });
}

async function route(req, res, pathname) {
  const method = req.method;
  const session = auth.sessionFrom(req);

  if (pathname === '/api/auth/login' && method === 'POST') return login(req, res);
  if (pathname === '/api/auth/logout' && method === 'POST') {
    auth.clearSession(res, req);
    return send(res, 200, { ok: true });
  }
  if (pathname === '/api/auth/me' && method === 'GET') {
    if (!session) throw new DbError(401, 'Please log in');
    return send(res, 200, { role: session.role, name: session.name });
  }

  // Everything below needs a logged-in doctor or pharmacy user.
  if (!session) throw new DbError(401, 'Please log in');

  if (pathname === '/api/medicines' && method === 'GET') {
    return send(res, 200, await rest('GET', 'medicines?select=id,name,formula,stock,form,price,threshold&order=id.asc'));
  }

  if (pathname === '/api/medicines' && method === 'POST') {
    requireRole(session, 'pharmacy');
    const b = await readBody(req);
    if (!b.id) {
      const name = str(b.name);
      const formula = str(b.formula);
      if (!name || !formula) throw new DbError(400, 'name and formula are required');
      const [med] = await rest('POST', 'medicines', { body: {
        name, formula,
        stock: Math.max(0, Math.floor(num(b.stock))),
        form: str(b.form) || 'Tablet',
        price: Math.max(0, num(b.price)),
        threshold: Math.max(0, Math.floor(num(b.threshold, 10))),
      } });
      return send(res, 201, med);
    }
    // Update only the fields that were sent.
    const patch = {};
    if (b.stock !== undefined) patch.stock = Math.max(0, Math.floor(num(b.stock)));
    if (b.threshold !== undefined) patch.threshold = Math.max(0, Math.floor(num(b.threshold)));
    if (b.price !== undefined) patch.price = Math.max(0, num(b.price));
    if (!Object.keys(patch).length) throw new DbError(400, 'Nothing to update');
    const rows = await rest('PATCH', `medicines?id=${eq(b.id)}`, { body: patch });
    if (!rows.length) throw new DbError(404, 'Medicine not found');
    return send(res, 200, rows[0]);
  }

  if (pathname === '/api/prescriptions' && method === 'GET') {
    // Pharmacy sees every prescription; a doctor sees only their own.
    const scope = session.role === 'doctor' ? `&doctor_id=${eq(session.uid)}` : '';
    const rows = await rest('GET', `prescriptions?select=*&order=created_at.desc&limit=300${scope}`);
    return send(res, 200, rows.map(rxOut));
  }

  if (pathname === '/api/prescriptions' && method === 'POST') {
    requireRole(session, 'doctor');
    const b = await readBody(req);
    const patient = b.patient || {};
    if (!str(patient.name)) throw new DbError(400, 'Patient name is required');
    if (!Array.isArray(b.items) || !b.items.length) throw new DbError(400, 'At least one item is required');
    const ids = [...new Set(b.items.map((it) => str(it.medicineId)))];
    const meds = await rest('GET', `medicines?select=id,name,formula,form&id=in.(${ids.map((i) => encodeURIComponent(`"${i.replace(/"/g, '')}"`)).join(',')})`);
    const byId = new Map(meds.map((m) => [m.id, m]));
    const items = b.items.map((it) => {
      const med = byId.get(str(it.medicineId));
      if (!med) throw new DbError(400, `Unknown medicine: ${it.medicineId}`);
      return buildItem(it, med);
    });
    const [rx] = await rest('POST', 'prescriptions', { body: {
      patient: { name: str(patient.name), age: patient.age ?? '', phone: patient.phone ?? '', token: patient.token ?? '' },
      doctor: session.name, // taken from the login, not from the browser
      doctor_id: session.uid,
      items,
    } });
    return send(res, 201, rxOut(rx));
  }

  const m = pathname.match(/^\/api\/prescriptions\/([^/]+)\/dispense$/);
  if (m && method === 'POST') {
    requireRole(session, 'pharmacy');
    const rx = await rest('POST', 'rpc/dispense_prescription', { body: { p_id: decodeURIComponent(m[1]), p_by: session.name } });
    return send(res, 200, rxOut(rx));
  }

  throw new DbError(404, 'Not found');
}

module.exports = async function handler(req, res) {
  try {
    const pathname = new URL(req.url, 'http://x').pathname.replace(/(.)\/+$/, '$1');
    await route(req, res, pathname);
  } catch (e) {
    const status = [400, 401, 403, 404, 409, 413].includes(e.status) ? e.status : 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: status === 500 && e.status === undefined ? 'Server error' : e.message });
  }
};
