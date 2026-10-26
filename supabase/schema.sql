-- KIHD Pharmacy <-> Doctor schema.
-- Run once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run again; it never deletes existing data.

-- ---------------------------------------------------------------- users
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null,
  role          text not null check (role in ('doctor', 'pharmacy')),
  display_name  text not null,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- medicines
create sequence if not exists med_seq;

create table if not exists medicines (
  id         text primary key default ('M' || lpad(nextval('med_seq')::text, 3, '0')),
  name       text not null,
  formula    text not null,
  stock      integer not null default 0 check (stock >= 0),
  form       text not null default 'Tablet',
  price      numeric not null default 0 check (price >= 0),
  threshold  integer not null default 10 check (threshold >= 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- prescriptions
create sequence if not exists rx_seq;

create table if not exists prescriptions (
  id            text primary key default ('RX-' || lpad(nextval('rx_seq')::text, 4, '0')),
  patient       jsonb not null,            -- {name, age, phone, token}
  doctor        text not null default '',  -- display name, printed on the slip
  doctor_id     uuid references users(id),
  items         jsonb not null,            -- [{medicineId, name, formula, qty, dosage}]
  status        text not null default 'pending' check (status in ('pending', 'dispensed')),
  created_at    timestamptz not null default now(),
  dispensed_at  timestamptz,
  dispensed_by  text
);
create index if not exists prescriptions_status_idx on prescriptions (status, created_at desc);
create index if not exists prescriptions_doctor_idx on prescriptions (doctor_id, created_at desc);

-- ---------------------------------------------------------------- security
-- The app talks to the database only through its own API using the service-role key
-- (server side). RLS is on with no policies, so the public "anon" key can read nothing.
alter table users         enable row level security;
alter table medicines     enable row level security;
alter table prescriptions enable row level security;

-- ---------------------------------------------------------------- dispense (atomic)
-- Checks stock, deducts it and marks the prescription dispensed in one transaction,
-- so two pharmacists clicking at once can never oversell or double-dispense.
-- Error codes PT404 / PT400 / PT409 become HTTP 404 / 400 / 409 through PostgREST.
create or replace function dispense_prescription(p_id text, p_by text)
returns prescriptions
language plpgsql
as $$
declare
  rx   prescriptions;
  need record;
  med  medicines;
  short text[] := '{}';
begin
  select * into rx from prescriptions where id = p_id for update;
  if not found then
    raise exception 'Prescription not found' using errcode = 'PT404';
  end if;
  if rx.status = 'dispensed' then
    raise exception 'Already dispensed' using errcode = 'PT400';
  end if;

  -- Sum per medicine so duplicate lines are checked against combined demand.
  for need in
    select (i->>'medicineId') as medicine_id, sum((i->>'qty')::int) as qty
    from jsonb_array_elements(rx.items) i
    group by 1
    order by 1                      -- fixed lock order avoids deadlocks
  loop
    select * into med from medicines where id = need.medicine_id for update;
    if not found or med.stock < need.qty then
      short := short || coalesce(med.name, need.medicine_id);
    end if;
  end loop;

  if array_length(short, 1) > 0 then
    raise exception 'Insufficient stock: %', array_to_string(short, ', ') using errcode = 'PT409';
  end if;

  update medicines m
     set stock = m.stock - n.qty
    from (
      select (i->>'medicineId') as medicine_id, sum((i->>'qty')::int) as qty
      from jsonb_array_elements(rx.items) i group by 1
    ) n
   where m.id = n.medicine_id;

  update prescriptions
     set status = 'dispensed', dispensed_at = now(), dispensed_by = p_by
   where id = p_id
   returning * into rx;
  return rx;
end;
$$;

revoke all on function dispense_prescription(text, text) from public, anon, authenticated;
grant execute on function dispense_prescription(text, text) to service_role;

-- ---------------------------------------------------------------- starting medicine list
insert into medicines (id, name, formula, stock, form, price, threshold) values
  ('M001', 'Disprin',          'Aspirin 300mg',             120, 'Tablet',     3,   30),
  ('M002', 'Ecosprin',         'Aspirin 75mg',              200, 'Tablet',     2,   40),
  ('M003', 'Plavix',           'Clopidogrel 75mg',           80, 'Tablet',    45,   20),
  ('M004', 'Lipitor',          'Atorvastatin 20mg',          90, 'Tablet',    40,   20),
  ('M005', 'Crestor',          'Rosuvastatin 10mg',          60, 'Tablet',    55,   15),
  ('M006', 'Concor',           'Bisoprolol 5mg',             75, 'Tablet',    30,   15),
  ('M007', 'Tenormin',         'Atenolol 50mg',               8, 'Tablet',    12,   15),
  ('M008', 'Norvasc',          'Amlodipine 5mg',            110, 'Tablet',    18,   20),
  ('M009', 'Zestril',          'Lisinopril 10mg',            70, 'Tablet',    22,   15),
  ('M010', 'Diovan',           'Valsartan 80mg',             45, 'Tablet',    60,   10),
  ('M011', 'Lasix',            'Furosemide 40mg',           100, 'Tablet',     6,   20),
  ('M012', 'Aldactone',        'Spironolactone 25mg',         0, 'Tablet',    25,   10),
  ('M013', 'Lanoxin',          'Digoxin 0.25mg',             35, 'Tablet',    15,   10),
  ('M014', 'Cordarone',        'Amiodarone 200mg',           28, 'Tablet',    50,   10),
  ('M015', 'Sorbitrate',       'Isosorbide dinitrate 10mg',  65, 'Tablet',     8,   15),
  ('M016', 'Angised',          'Glyceryl trinitrate 0.5mg',   9, 'Sublingual', 10,  10),
  ('M017', 'Xarelto',          'Rivaroxaban 20mg',           40, 'Tablet',   150,   10),
  ('M018', 'Clexane',          'Enoxaparin 40mg',            25, 'Injection',400,   10),
  -- general medicines from the doctor app's original list
  ('M019', 'Panadol 500mg',            'Paracetamol',                   120, 'Tablet',  40, 20),
  ('M020', 'Calpol 500mg',             'Paracetamol',                     0, 'Tablet',  35, 20),
  ('M021', 'Paracetamol Syrup 120mg',  'Paracetamol',                    45, 'Syrup',   90, 15),
  ('M022', 'Brufen 400mg',             'Ibuprofen',                      80, 'Tablet',  60, 20),
  ('M023', 'Ibuprofen Syrup',          'Ibuprofen',                       0, 'Syrup',  110, 10),
  ('M024', 'Augmentin 625mg',          'Amoxicillin + Clavulanic Acid',   0, 'Tablet', 450, 15),
  ('M025', 'Amoxil 500mg',             'Amoxicillin',                    60, 'Capsule',120, 20),
  ('M026', 'Flagyl 400mg',             'Metronidazole',                  90, 'Tablet',  50, 20),
  ('M027', 'Risek 20mg',               'Omeprazole',                     14, 'Capsule',130, 20),
  ('M028', 'Losec 20mg',               'Omeprazole',                     70, 'Capsule',150, 20),
  ('M029', 'Cardiopril 5mg',           'Bisoprolol 5mg',                  0, 'Tablet', 140, 15),
  ('M030', 'Atorva 20mg',              'Atorvastatin 20mg',              65, 'Tablet', 210, 15),
  ('M031', 'Ventolin Inhaler',         'Salbutamol',                     12, 'Inhaler',380,  5),
  ('M032', 'ORS Sachet',               'Oral Rehydration Salts',        300, 'Sachet',  20, 50)
on conflict (id) do nothing;

-- Next auto-generated medicine id will be M101, M102, ...
select setval('med_seq', greatest((select last_value from med_seq), 100));
