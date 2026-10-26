// Creates (or resets the password of) a doctor / pharmacy login.
//   node scripts/create-user.js <doctor|pharmacy> <username> <password> "<Display Name>"
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env or the environment).
const { rest } = require('../lib/supabase');
const { hashPassword } = require('../lib/auth');

const [role, username, password, ...nameParts] = process.argv.slice(2);
const displayName = nameParts.join(' ').trim() || username;

if (!['doctor', 'pharmacy'].includes(role) || !username || !password) {
  console.error('Usage: node scripts/create-user.js <doctor|pharmacy> <username> <password> "<Display Name>"');
  process.exit(1);
}
if (password.length < 8) { console.error('Password must be at least 8 characters.'); process.exit(1); }

rest('POST', 'users?on_conflict=username', {
  headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  body: { username: username.toLowerCase(), password_hash: hashPassword(password), role, display_name: displayName },
}).then(([u]) => console.log(`OK: ${u.role} login "${u.username}" (${u.display_name}) is ready.`))
  .catch((e) => { console.error('Failed:', e.message); process.exit(1); });
