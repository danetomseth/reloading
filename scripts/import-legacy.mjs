// One-time merge import of legacy LRS Tracker data (scripts/legacy-data.json)
// into Supabase, authenticated as the user so RLS assigns ownership.
//
//   SB_EMAIL=you@example.com SB_PASSWORD=secret node scripts/import-legacy.mjs
//
// Merge rules (per user): match existing rows; fill ONLY blank fields from the
// sheet (never overwrite non-empty values); insert rows that don't exist.
// Re-runnable and non-destructive.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// same project + publishable key the app uses (lib/supabase.ts)
const SUPABASE_URL = 'https://skbwtsanxkgxzdbaqhnm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_4euvL4DCHv3nwS87gXpzXA_KbgwvuU7';

const EMAIL = process.env.SB_EMAIL;
const PASSWORD = process.env.SB_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Set SB_EMAIL and SB_PASSWORD env vars, e.g.:\n  SB_EMAIL=you@example.com SB_PASSWORD=... node scripts/import-legacy.mjs');
  process.exit(1);
}

const data = JSON.parse(readFileSync(join(__dirname, 'legacy-data.json'), 'utf8'));

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const genLoadId = () => {
  const d = new Date();
  const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${stamp}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
};
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const blank = (v) => v === null || v === undefined || String(v).trim() === '';

// merged update: only fill existing blanks from incoming non-blanks
function fillBlanks(existing, incoming) {
  const upd = {};
  for (const k of Object.keys(incoming)) {
    if (!blank(incoming[k]) && blank(existing[k])) upd[k] = incoming[k];
  }
  return upd;
}

const RIFLE_DEFAULTS = { caliber: '', barrel_len: '', twist: '', scope_model: '', scope_height: '', scope_unit: 'moa', muzzle_device: '', notes: '' };
const LOAD_DEFAULTS = {
  caliber: '', bullet: '', bullet_wt: '', bullet_bc: '', powder: '', charge: '', primer: '', brass: '',
  brass_fires: '', trim_len: '', overall_coal: '', headspace_coal: '', max_overall_coal: '', max_headspace_coal: '',
  neck_tension: '', lot_number: '', velocity: '', sd: '', es: '', group_size: '', distance: '', status: 'testing',
  tumbled: 0, ultrasonic: 0, fl_sized: 0, neck_sized: 0, case_trimmed: 0, chrono_sessions: '', ladder: '', notes: '',
};
const SESSION_DEFAULTS = {
  location: '', distance: '', temp: '', humidity: '', pressure: '', density_alt: '', wind_speed: '', wind_dir: '',
  altitude: '', scope_adj: '', clicks_up: '', clicks_right: '', group_size: '', rounds_fired: '', load_id: '', notes: '',
};

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  const { error: authErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (authErr) { console.error('Sign-in failed:', authErr.message); process.exit(1); }
  console.log(`Signed in as ${EMAIL}\n`);

  const [{ data: rifles = [] }, { data: loads = [] }, { data: sessions = [] }] = await Promise.all([
    supabase.from('rifles').select('*'),
    supabase.from('loads').select('*'),
    supabase.from('sessions').select('*'),
  ]);
  console.log(`Existing: ${rifles.length} rifles, ${loads.length} loads, ${sessions.length} sessions\n`);

  const tally = { rifles: { created: 0, merged: 0, skipped: 0 }, loads: { created: 0, merged: 0, skipped: 0 }, sessions: { created: 0, merged: 0, skipped: 0 } };

  // ── Rifles: match by name ──
  const rifleByName = new Map(rifles.map((r) => [norm(r.name), r]));
  for (const inc of data.rifles) {
    const match = rifleByName.get(norm(inc.name));
    if (match) {
      const upd = fillBlanks(match, inc);
      if (Object.keys(upd).length) {
        const { error } = await supabase.from('rifles').update(upd).eq('id', match.id);
        if (error) { console.error('rifle merge', inc.name, error.message); continue; }
        Object.assign(match, upd); tally.rifles.merged++;
        console.log(`~ rifle merged: ${inc.name} (+${Object.keys(upd).join(', ')})`);
      } else tally.rifles.skipped++;
    } else {
      const row = { id: uid(), ...RIFLE_DEFAULTS, ...inc };
      const { data: ins, error } = await supabase.from('rifles').insert(row).select().single();
      if (error) { console.error('rifle insert', inc.name, error.message); continue; }
      rifleByName.set(norm(inc.name), ins); tally.rifles.created++;
      console.log(`+ rifle created: ${inc.name}`);
    }
  }

  // ── Loads: match by rifle + bullet + charge ──
  const loadKey = (l) => `${norm(l.rifle)}|${norm(l.bullet)}|${norm(l.charge)}`;
  const loadByKey = new Map(loads.map((l) => [loadKey(l), l]));
  for (const inc of data.loads) {
    const match = loadByKey.get(loadKey(inc));
    if (match) {
      const upd = fillBlanks(match, inc);
      if (Object.keys(upd).length) {
        const { error } = await supabase.from('loads').update(upd).eq('id', match.id);
        if (error) { console.error('load merge', inc.bullet, error.message); continue; }
        Object.assign(match, upd); tally.loads.merged++;
        console.log(`~ load merged: ${inc.rifle} / ${inc.bullet} ${inc.charge}gr (+${Object.keys(upd).join(', ')})`);
      } else tally.loads.skipped++;
    } else {
      const row = { id: uid(), load_id: genLoadId(), ...LOAD_DEFAULTS, ...inc };
      const { data: ins, error } = await supabase.from('loads').insert(row).select().single();
      if (error) { console.error('load insert', inc.bullet, error.message); continue; }
      loadByKey.set(loadKey(inc), ins); tally.loads.created++;
      console.log(`+ load created: ${inc.rifle} / ${inc.bullet} ${inc.charge}gr`);
    }
  }

  // ── Sessions: match by rifle + date ──
  const sesKey = (s) => `${norm(s.rifle)}|${norm(s.date)}`;
  const sesByKey = new Map(sessions.map((s) => [sesKey(s), s]));
  for (const inc of data.sessions) {
    const match = sesByKey.get(sesKey(inc));
    if (match) {
      const upd = fillBlanks(match, inc);
      if (Object.keys(upd).length) {
        const { error } = await supabase.from('sessions').update(upd).eq('id', match.id);
        if (error) { console.error('session merge', inc.rifle, error.message); continue; }
        Object.assign(match, upd); tally.sessions.merged++;
        console.log(`~ session merged: ${inc.rifle} ${inc.date}`);
      } else tally.sessions.skipped++;
    } else {
      const row = { id: uid(), ...SESSION_DEFAULTS, ...inc };
      const { data: ins, error } = await supabase.from('sessions').insert(row).select().single();
      if (error) { console.error('session insert', inc.rifle, error.message); continue; }
      sesByKey.set(sesKey(inc), ins); tally.sessions.created++;
      console.log(`+ session created: ${inc.rifle} ${inc.date}`);
    }
  }

  console.log('\n── Summary ──');
  for (const t of ['rifles', 'loads', 'sessions']) {
    const x = tally[t];
    console.log(`${t.padEnd(9)} created ${x.created}  merged ${x.merged}  skipped ${x.skipped}`);
  }
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
