import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

const SUPABASE_URL = 'https://skbwtsanxkgxzdbaqhnm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_4euvL4DCHv3nwS87gXpzXA_KbgwvuU7';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// keep the auth token fresh while the app is in the foreground
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export type Rifle = {
  id: string;
  name: string;
  caliber: string;
  barrel_len: string;
  twist: string;
  scope_model: string;
  scope_height: string;
  scope_unit: string;
  muzzle_device: string;
  notes: string;
  code?: string;        // short prefix for load IDs, e.g. "25CM" → 25CM-001
  zero_range?: string;  // yards
  created_at?: string;
  updated_at?: string;
};

export type Load = {
  id: string;
  load_id?: string;     // human ID, e.g. "25CM-007"
  legacy_ids?: string;  // JSON array of earlier IDs (old load_id / lot number)
  rifle_id?: string;    // rifles.id — the reliable link; `rifle` (name) kept for display
  ballistics?: string;  // JSON BallisticProfile (lib/ballisticProfile.ts)
  date: string;
  rifle: string;
  caliber: string;
  bullet: string;
  bullet_wt: string;
  bullet_bc: string;
  powder: string;
  charge: string;
  primer: string;
  brass: string;
  brass_fires: string;
  trim_len: string;
  overall_coal: string;
  headspace_coal: string;
  max_overall_coal: string;
  max_headspace_coal: string;
  neck_tension: string;
  lot_number: string;
  velocity: string;
  sd: string;
  es: string;
  group_size: string;
  distance: string;
  status: string;
  tumbled: number;
  ultrasonic: number;
  fl_sized: number;
  neck_sized: number;
  case_trimmed: number;
  chrono_sessions: string;
  ladder?: string;
  notes: string;
  created_at?: string;
  updated_at?: string;
};

export type Group = {
  id: string;
  name: string;
  load_ids: string;   // JSON array of load id strings
  notes: string;
  created_at?: string;
  updated_at?: string;
};

export type Session = {
  id: string;
  date: string;
  rifle: string;
  rifle_id?: string;
  load_id: string;
  location: string;
  distance: string;
  temp: string;
  humidity: string;
  pressure: string;
  density_alt: string;
  wind_speed: string;
  wind_dir: string;
  altitude: string;
  scope_adj: string;
  clicks_up: string;
  clicks_right: string;
  group_size: string;
  rounds_fired: string;
  ranges?: string;
  notes: string;
  created_at?: string;
  updated_at?: string;
};

export const db = {
  rifles: {
    getAll: () => supabase.from('rifles').select('*').order('created_at', { ascending: false }),
    get: (id: string) => supabase.from('rifles').select('*').eq('id', id).single(),
    upsert: (r: Partial<Rifle>) => supabase.from('rifles').upsert(r),
    update: (id: string, patch: Partial<Rifle>) => supabase.from('rifles').update(patch).eq('id', id),
    delete: (id: string) => supabase.from('rifles').delete().eq('id', id),
  },
  loads: {
    getAll: () => supabase.from('loads').select('*').order('created_at', { ascending: false }),
    get: (id: string) => supabase.from('loads').select('*').eq('id', id).single(),
    upsert: (l: Partial<Load>) => supabase.from('loads').upsert(l),
    update: (id: string, patch: Partial<Load>) => supabase.from('loads').update(patch).eq('id', id),
    delete: (id: string) => supabase.from('loads').delete().eq('id', id),
  },
  sessions: {
    getAll: () => supabase.from('sessions').select('*').order('created_at', { ascending: false }),
    get: (id: string) => supabase.from('sessions').select('*').eq('id', id).single(),
    upsert: (s: Partial<Session>) => supabase.from('sessions').upsert(s),
    update: (id: string, patch: Partial<Session>) => supabase.from('sessions').update(patch).eq('id', id),
    delete: (id: string) => supabase.from('sessions').delete().eq('id', id),
  },
  groups: {
    getAll: () => supabase.from('groups').select('*').order('created_at', { ascending: false }),
    get: (id: string) => supabase.from('groups').select('*').eq('id', id).single(),
    upsert: (g: Partial<Group>) => supabase.from('groups').upsert(g),
    delete: (id: string) => supabase.from('groups').delete().eq('id', id),
  },
};

// membership helpers — load_ids is stored as a JSON array string
export const parseLoadIds = (json?: string): string[] => {
  if (!json) return [];
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; } catch { return []; }
};

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Load IDs are generated per rifle (e.g. "25CM-007") — see lib/loadIds.ts.
