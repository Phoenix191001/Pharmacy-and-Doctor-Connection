# KIHD Doctor ↔ Pharmacy

Doctor console and Pharmacy/Lab app, linked through one Supabase database and hosted on Vercel.

- **Login page** (`/`): doctors go to `/doctor/`, pharmacy staff to `/lab/`. Each role can only use its own API calls.
- Doctor presses **Send to Lab / Pharmacy** → it appears as *pending* in the pharmacy queue (within ~3 s).
- Pharmacy presses **Dispense** → stock is deducted (atomically) and the doctor sees the prescription as *Dispensed*.
- Pharmacy changes stock / adds medicines → the doctor's live medicine search shows the new stock and same-formula alternatives.
- A doctor only sees their own prescriptions; pharmacy sees all.

## Files

| Path | What |
|---|---|
| `public/` | Static pages: `index.html` (login), `lab/`, `doctor/`, shared CSS/JS |
| `api/[...path].js` | Vercel serverless entry for every `/api/*` call |
| `lib/` | `handler.js` (routes + role checks), `supabase.js` (DB client), `auth.js` (passwords + session cookie) |
| `supabase/schema.sql` | Tables, atomic dispense function, starting medicine list |
| `scripts/create-user.js` | Creates / resets a doctor or pharmacy login |
| `server.js` | Local testing only (not used on Vercel) |

## Setup

### 1. Supabase
1. Create a project at supabase.com.
2. **SQL Editor → New query**, paste all of `supabase/schema.sql`, **Run**.
3. **Project Settings → API**: copy the **Project URL** and the **`service_role`** key. The key is secret and server-side only: never share it or put it in the pages.

### 2. Create the logins (once, from your computer)
```bash
cp .env.example .env        # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET
npm run create-user -- pharmacy ali    "a-strong-password"       "Ali (Pharmacy)"
npm run create-user -- doctor   farhan "another-strong-password" "Dr. Farhan Siddiqui"
```
Usernames are case-insensitive and passwords need 8+ characters. Run it again for the same username to reset a password. A doctor's display name is what appears on their prescriptions.

### 3. Vercel
1. Import this GitHub repo as a new project (Framework preset: **Other**, no build command).
2. **Settings → Environment Variables**, add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SESSION_SECRET` (any long random string, e.g. `openssl rand -hex 32`).
3. Deploy (redeploy after adding or changing variables).

### Local testing (optional)
```bash
npm start     # http://localhost:3000, uses the Supabase project from .env
```

## API

All routes except login need the session cookie. **D** = doctor only, **P** = pharmacy only.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | `{username,password}` → sets session cookie |
| POST | `/api/auth/logout` | |
| GET | `/api/auth/me` | `{role,name}` |
| GET | `/api/medicines` | both roles |
| POST | `/api/medicines` | **P**. No `id`: create. With `id`: update `stock`/`threshold`/`price` |
| GET | `/api/prescriptions` | pharmacy: all; doctor: own |
| POST | `/api/prescriptions` | **D**. `{patient:{name,age,phone,token}, items:[{medicineId,qty,dosage}]}`; the doctor name comes from the login |
| POST | `/api/prescriptions/:id/dispense` | **P**. 404 not found, 400 already dispensed, 409 insufficient stock |
