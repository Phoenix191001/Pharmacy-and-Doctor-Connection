// Storage layer. Everything the server needs goes through these functions,
// so swapping the JSON file for a cloud database later only means rewriting this file.
const fs = require('fs');
const path = require('path');

const FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');

const SEED = {
  medicines: [
    ['Panadol 500mg', 'Paracetamol', 120, 'Tablet', 40, 20],
    ['Calpol 500mg', 'Paracetamol', 0, 'Tablet', 35, 20],
    ['Paracetamol Syrup 120mg', 'Paracetamol', 45, 'Syrup', 90, 15],
    ['Brufen 400mg', 'Ibuprofen', 80, 'Tablet', 60, 20],
    ['Ibuprofen Syrup', 'Ibuprofen', 0, 'Syrup', 110, 10],
    ['Augmentin 625mg', 'Amoxicillin + Clavulanic Acid', 0, 'Tablet', 450, 15],
    ['Amoxil 500mg', 'Amoxicillin', 60, 'Capsule', 120, 20],
    ['Flagyl 400mg', 'Metronidazole', 90, 'Tablet', 50, 20],
    ['Risek 20mg', 'Omeprazole', 14, 'Capsule', 130, 20],
    ['Losec 20mg', 'Omeprazole', 70, 'Capsule', 150, 20],
    ['Concor 5mg', 'Bisoprolol', 55, 'Tablet', 180, 15],
    ['Cardiopril 5mg', 'Bisoprolol', 0, 'Tablet', 140, 15],
    ['Disprin 300mg', 'Aspirin', 200, 'Tablet', 15, 40],
    ['Ecosprin 75mg', 'Aspirin', 150, 'Tablet', 25, 40],
    ['Lipitor 20mg', 'Atorvastatin', 8, 'Tablet', 320, 15],
    ['Atorva 20mg', 'Atorvastatin', 65, 'Tablet', 210, 15],
    ['Ventolin Inhaler', 'Salbutamol', 12, 'Inhaler', 380, 5],
    ['ORS Sachet', 'Oral Rehydration Salts', 300, 'Sachet', 20, 50],
  ].map((m, i) => ({
    id: 'm' + (i + 1), name: m[0], formula: m[1], stock: m[2], form: m[3], price: m[4], threshold: m[5],
  })),
  prescriptions: [],
  nextRx: 1,
};

let state;

function load() {
  try { state = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { state = JSON.parse(JSON.stringify(SEED)); save(); }
}
function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
}
load();

module.exports = {
  listMedicines: () => state.medicines,
  getMedicine: (id) => state.medicines.find((m) => m.id === id),
  upsertMedicine(data) {
    let m = data.id && state.medicines.find((x) => x.id === data.id);
    if (!m) {
      m = { id: 'm' + Date.now() };
      state.medicines.push(m);
    }
    Object.assign(m, {
      name: String(data.name || m.name || '').trim(),
      formula: String(data.formula || m.formula || '').trim(),
      form: data.form || m.form || 'Tablet',
      stock: Math.max(0, Number(data.stock ?? m.stock ?? 0)),
      price: Number(data.price ?? m.price ?? 0),
      threshold: Number(data.threshold ?? m.threshold ?? 10),
    });
    save();
    return m;
  },
  listPrescriptions: () => state.prescriptions,
  getPrescription: (id) => state.prescriptions.find((p) => p.id === id),
  addPrescription(rx) {
    rx.id = 'RX-' + String(state.nextRx++).padStart(4, '0');
    rx.createdAt = new Date().toISOString();
    rx.status = 'pending';
    state.prescriptions.unshift(rx);
    save();
    return rx;
  },
  save,
};
