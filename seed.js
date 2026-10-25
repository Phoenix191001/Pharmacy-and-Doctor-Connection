// Posts a few sample prescriptions to a running server (stands in for the Doctor app).
// Usage: node seed.js [baseUrl]   (default http://localhost:3000)
const base = process.argv[2] || 'http://localhost:3000';

const samples = [
  { patient: { name: 'Muhammad Aslam', age: 58, phone: '0300-1112233', token: 'A-014' }, doctor: 'Dr. Farhan Siddiqui',
    items: [{ medicineId: 'M003', qty: 30, dosage: '1 tab daily' }, { medicineId: 'M004', qty: 30, dosage: '1 tab at night' }] },
  { patient: { name: 'Shabana Khan', age: 64, phone: '0321-4445566', token: 'A-015' }, doctor: 'Dr. Ayesha Rahim',
    items: [{ medicineId: 'M006', qty: 30, dosage: '1 tab morning' }, { medicineId: 'M011', qty: 20, dosage: '1 tab twice daily' }] },
  { patient: { name: 'Tariq Mehmood', age: 71, phone: '0333-7778899', token: 'A-016' }, doctor: 'Dr. Farhan Siddiqui',
    items: [{ medicineId: 'M012', qty: 30, dosage: '1 tab daily' }] }, // out of stock: shows "short"
];

(async () => {
  for (const s of samples) {
    const res = await fetch(base + '/api/prescriptions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s),
    });
    const data = await res.json();
    console.log(res.ok ? `Created ${data.id} for ${data.patient.name}` : `Failed: ${data.error}`);
  }
})().catch((e) => { console.error('Is the server running?', e.message); process.exit(1); });
