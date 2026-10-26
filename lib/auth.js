// Password hashing (scrypt) and signed session cookies. No dependencies.
require('./env');
const crypto = require('crypto');

const COOKIE = 'kihd_session';
const TTL_SECONDS = 12 * 60 * 60;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw Object.assign(new Error('Server is not configured: set SESSION_SECRET (16+ characters)'), { status: 500 });
  return s;
}

const sign = (payload) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

function createToken(user) {
  const payload = Buffer.from(JSON.stringify({
    uid: user.id, role: user.role, name: user.display_name,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readToken(token) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return null;
  const good = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (good.length !== given.length || !crypto.timingSafeEqual(good, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() / 1000 ? data : null;
  } catch { return null; }
}

function sessionFrom(req) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? readToken(m[1]) : null;
}

function cookieHeader(value, req, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}
const setSession = (res, req, user) => res.setHeader('Set-Cookie', cookieHeader(createToken(user), req, TTL_SECONDS));
const clearSession = (res, req) => res.setHeader('Set-Cookie', cookieHeader('', req, 0));

module.exports = { hashPassword, verifyPassword, sessionFrom, setSession, clearSession };
