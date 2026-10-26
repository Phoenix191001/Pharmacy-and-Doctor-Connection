// LOCAL DEVELOPMENT ONLY. On Vercel, public/ is served statically and api/ runs as serverless
// functions, so this file is not used there. Run with: npm start
require('./lib/env');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const handler = require('./lib/handler');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  if (!path.extname(file) && fs.existsSync(path.join(file, 'index.html'))) {
    res.writeHead(301, { Location: pathname + '/' });
    return res.end();
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname.startsWith('/api/')) return handler(req, res);
  serveStatic(res, pathname);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Local server: http://localhost:${PORT}/`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || [])
      if (i.family === 'IPv4' && !i.internal) console.log(`  Network:    http://${i.address}:${PORT}/`);
});
