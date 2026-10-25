// Zero-dependency server: JSON API + live updates (SSE) + two separate front-ends.
//   /doctor/  -> doctor consultation app
//   /lab/     -> pharmacy / lab app
const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const PORT = process.env.PORT || 3001;
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
const clients = new Set();

const broadcast = (type) => clients.forEach((res) => res.write(`data: ${JSON.stringify({ type })}\n\n`));
const send = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve) => {
  let s = '';
  req.on('data', (c) => (s += c));
  req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { resolve({}); } });
});

async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (p === '/api/medicines' && m === 'GET') return send(res, 200, db.listMedicines());
  if (p === '/api/medicines' && m === 'POST') {
    const body = await readBody(req);
    if (!body.id && (!body.name || !body.formula)) return send(res, 400, { error: 'name and formula required' });
    const med = db.upsertMedicine(body);
    broadcast('medicines');
    return send(res, 200, med);
  }
  if (p === '/api/prescriptions' && m === 'GET') return send(res, 200, db.listPrescriptions());
  if (p === '/api/prescriptions' && m === 'POST') {
    const body = await readBody(req);
    if (!body.patient?.name || !body.items?.length) return send(res, 400, { error: 'patient name and at least one medicine required' });
    const items = body.items.map((i) => {
      const med = db.getMedicine(i.medicineId);
      return med && { medicineId: med.id, name: med.name, formula: med.formula, qty: Number(i.qty) || 1, dosage: i.dosage || '' };
    }).filter(Boolean);
    const rx = db.addPrescription({ patient: body.patient, doctor: body.doctor || 'Doctor', items });
    broadcast('prescriptions');
    return send(res, 200, rx);
  }
  const disp = p.match(/^\/api\/prescriptions\/([^/]+)\/dispense$/);
  if (disp && m === 'POST') {
    const rx = db.getPrescription(disp[1]);
    if (!rx) return send(res, 404, { error: 'not found' });
    if (rx.status === 'dispensed') return send(res, 400, { error: 'already dispensed' });
    const short = rx.items.filter((i) => (db.getMedicine(i.medicineId)?.stock ?? 0) < i.qty);
    if (short.length) return send(res, 409, { error: 'Insufficient stock: ' + short.map((i) => i.name).join(', ') });
    rx.items.forEach((i) => { db.getMedicine(i.medicineId).stock -= i.qty; });
    rx.status = 'dispensed';
    rx.dispensedAt = new Date().toISOString();
    db.save();
    broadcast('medicines');
    broadcast('prescriptions');
    return send(res, 200, rx);
  }
  send(res, 404, { error: 'not found' });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) return api(req, res, url).catch((e) => send(res, 500, { error: e.message }));

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end('<meta name=viewport content="width=device-width"><body style="font-family:sans-serif;padding:2rem"><h2>Hospital Rx</h2><p><a href="/doctor/">Doctor app</a></p>');
  }
  let file = path.normalize(path.join(PUBLIC, url.pathname));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(require('os').networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`Doctor app:  http://localhost:${PORT}/doctor/`);
  console.log(`Lab app:     http://localhost:${PORT}/lab/`);
  ips.forEach((ip) => console.log(`On LAN:      http://${ip}:${PORT}/doctor/  and  /lab/`));
});
