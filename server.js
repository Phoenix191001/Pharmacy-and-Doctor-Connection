const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

const clients = new Set();
function broadcast(event) {
  for (const res of clients) res.write(`event: ${event}\ndata: ${Date.now()}\n\n`);
}

function send(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) { reject(new Error('Body too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);

async function api(req, res, url) {
  const { pathname } = url;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  if (pathname === '/api/events' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('retry: 2000\n\n');
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  if (pathname === '/api/medicines' && method === 'GET') return send(res, 200, db.getMedicines());

  if (pathname === '/api/medicines' && method === 'POST') {
    const b = await readBody(req);
    if (!b.id) {
      const name = String(b.name || '').trim();
      const formula = String(b.formula || '').trim();
      if (!name || !formula) return send(res, 400, { error: 'name and formula are required' });
      const med = db.addMedicine({
        id: db.nextMedicineId(), name, formula,
        stock: Math.max(0, Math.floor(num(b.stock))),
        form: String(b.form || 'Tablet').trim() || 'Tablet',
        price: Math.max(0, num(b.price)),
        threshold: Math.max(0, Math.floor(num(b.threshold, 10))),
      });
      broadcast('medicines');
      return send(res, 201, med);
    }
    const med = db.getMedicine(b.id);
    if (!med) return send(res, 404, { error: 'Medicine not found' });
    if (b.stock !== undefined) med.stock = Math.max(0, Math.floor(num(b.stock, med.stock)));
    if (b.threshold !== undefined) med.threshold = Math.max(0, Math.floor(num(b.threshold, med.threshold)));
    if (b.price !== undefined) med.price = Math.max(0, num(b.price, med.price));
    db.save();
    broadcast('medicines');
    return send(res, 200, med);
  }

  if (pathname === '/api/prescriptions' && method === 'GET') return send(res, 200, db.getPrescriptions());

  if (pathname === '/api/prescriptions' && method === 'POST') {
    const b = await readBody(req);
    const patient = b.patient || {};
    if (!String(patient.name || '').trim()) return send(res, 400, { error: 'Patient name is required' });
    if (!Array.isArray(b.items) || !b.items.length) return send(res, 400, { error: 'At least one item is required' });
    const items = [];
    for (const it of b.items) {
      const med = db.getMedicine(it.medicineId);
      if (!med) return send(res, 400, { error: `Unknown medicine: ${it.medicineId}` });
      const qty = Math.floor(num(it.qty));
      if (qty < 1) return send(res, 400, { error: `Invalid quantity for ${med.name}` });
      items.push({ medicineId: med.id, name: med.name, formula: med.formula, qty, dosage: String(it.dosage || '') });
    }
    const rx = db.addPrescription({
      id: db.nextPrescriptionId(),
      patient: {
        name: String(patient.name).trim(), age: patient.age ?? '',
        phone: patient.phone ?? '', token: patient.token ?? '',
      },
      doctor: String(b.doctor || ''),
      items,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    broadcast('prescriptions');
    return send(res, 201, rx);
  }

  const m = pathname.match(/^\/api\/prescriptions\/([^/]+)\/dispense$/);
  if (m && method === 'POST') {
    const rx = db.getPrescription(decodeURIComponent(m[1]));
    if (!rx) return send(res, 404, { error: 'Prescription not found' });
    if (rx.status === 'dispensed') return send(res, 400, { error: 'Already dispensed' });
    // Sum per medicine so duplicate lines are checked against combined demand.
    const need = new Map();
    for (const it of rx.items) need.set(it.medicineId, (need.get(it.medicineId) || 0) + it.qty);
    const short = [];
    for (const [id, qty] of need) {
      const med = db.getMedicine(id);
      if (!med || med.stock < qty) short.push(med ? med.name : id);
    }
    if (short.length) return send(res, 409, { error: `Insufficient stock: ${short.join(', ')}` });
    for (const [id, qty] of need) db.getMedicine(id).stock -= qty;
    rx.status = 'dispensed';
    rx.dispensedAt = new Date().toISOString();
    db.save();
    broadcast('medicines');
    broadcast('prescriptions');
    return send(res, 200, rx);
  }

  send(res, 404, { error: 'Not found' });
}

function landing(res) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KIHD Prototype</title><link rel="stylesheet" href="/shared.css">
<main class="wrap"><h1>Karachi Institute of Heart Diseases</h1>
<p class="muted">Hospital prototype server is running.</p>
<div class="card"><a class="btn" href="/doctor/">Open Doctor Console</a> <a class="btn" href="/lab/">Open Pharmacy / Lab</a></div>
<p class="muted">API: /api/medicines · /api/prescriptions · /api/events</p></main>`);
}

function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname === '/') return landing(res);
    serveStatic(res, url.pathname);
  } catch (e) {
    if (!res.headersSent) send(res, 400, { error: e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`  Local:   http://localhost:${PORT}/lab/`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || [])
      if (i.family === 'IPv4' && !i.internal) console.log(`  Network: http://${i.address}:${PORT}/lab/`);
});
