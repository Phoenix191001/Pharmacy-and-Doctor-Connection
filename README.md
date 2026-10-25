# KIHD Pharmacy / Lab prototype

Pharmacy side of the Karachi Institute of Heart Diseases prototype, plus the shared backend the Doctor app talks to.
Node.js 18+, no npm dependencies.

## Run

```bash
npm start
```

The server listens on `0.0.0.0:3000` and prints the LAN URLs. Open `/lab/` on a laptop or phone on the same network.

Demo prescriptions (stands in for the Doctor app):

```bash
npm run seed
```

Data lives in `data/db.json` (seeded with 18 medicines on first run). Delete it to reset. Only `db.js` touches storage.

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/medicines` | `[{id,name,formula,stock,form,price,threshold}]` |
| POST | `/api/medicines` | No `id`: create (`name`, `formula` required). With `id`: update only the sent `stock`/`threshold`/`price`. Stock never below 0. |
| GET | `/api/prescriptions` | Newest first |
| POST | `/api/prescriptions` | `{patient:{name,age,phone,token}, doctor, items:[{medicineId,qty,dosage}]}` → `RX-0001…`, status `pending` |
| POST | `/api/prescriptions/:id/dispense` | 404 not found, 400 already dispensed, 409 `Insufficient stock: …`; otherwise deducts stock |
| GET | `/api/events` | Server-Sent Events: `medicines`, `prescriptions` |

## Files

`server.js`, `db.js`, `seed.js`, `public/shared.css`, `public/shared.js`, `public/lab/index.html`
