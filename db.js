// Single storage module. Swap this file for a cloud DB later; server.js only uses these functions.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'db.json');

const SEED = [
  ['Disprin', 'Aspirin 300mg', 120, 'Tablet', 3, 30],
  ['Ecosprin', 'Aspirin 75mg', 200, 'Tablet', 2, 40],
  ['Plavix', 'Clopidogrel 75mg', 80, 'Tablet', 45, 20],
  ['Lipitor', 'Atorvastatin 20mg', 90, 'Tablet', 40, 20],
  ['Crestor', 'Rosuvastatin 10mg', 60, 'Tablet', 55, 15],
  ['Concor', 'Bisoprolol 5mg', 75, 'Tablet', 30, 15],
  ['Tenormin', 'Atenolol 50mg', 8, 'Tablet', 12, 15],
  ['Norvasc', 'Amlodipine 5mg', 110, 'Tablet', 18, 20],
  ['Zestril', 'Lisinopril 10mg', 70, 'Tablet', 22, 15],
  ['Diovan', 'Valsartan 80mg', 45, 'Tablet', 60, 10],
  ['Lasix', 'Furosemide 40mg', 100, 'Tablet', 6, 20],
  ['Aldactone', 'Spironolactone 25mg', 0, 'Tablet', 25, 10],
  ['Lanoxin', 'Digoxin 0.25mg', 35, 'Tablet', 15, 10],
  ['Cordarone', 'Amiodarone 200mg', 28, 'Tablet', 50, 10],
  ['Sorbitrate', 'Isosorbide dinitrate 10mg', 65, 'Tablet', 8, 15],
  ['Angised', 'Glyceryl trinitrate 0.5mg', 9, 'Sublingual', 10, 10],
  ['Xarelto', 'Rivaroxaban 20mg', 40, 'Tablet', 150, 10],
  ['Clexane', 'Enoxaparin 40mg', 25, 'Injection', 400, 10],
].map(([name, formula, stock, form, price, threshold], i) => ({
  id: 'M' + String(i + 1).padStart(3, '0'),
  name, formula, stock, form, price, threshold,
}));

let state = null;

function load() {
  if (state) return state;
  try {
    state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    state = { medicines: SEED, prescriptions: [] };
    save();
  }
  return state;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, FILE);
}

function nextId(prefix, list, width) {
  const max = list.reduce((m, x) => Math.max(m, parseInt(x.id.slice(prefix.length), 10) || 0), 0);
  return prefix + String(max + 1).padStart(width, '0');
}

module.exports = {
  getMedicines: () => load().medicines,
  getPrescriptions: () => [...load().prescriptions].reverse(),
  getMedicine: (id) => load().medicines.find((m) => m.id === id),
  getPrescription: (id) => load().prescriptions.find((p) => p.id === id),
  nextMedicineId: () => nextId('M', load().medicines, 3),
  nextPrescriptionId: () => nextId('RX-', load().prescriptions, 4),
  addMedicine(m) { load().medicines.push(m); save(); return m; },
  addPrescription(p) { load().prescriptions.push(p); save(); return p; },
  save,
};
