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
  created_at?: string;
  updated_at?: string;
};

export type Load = {
  id: string;
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
  notes: string;
  created_at?: string;
  updated_at?: string;
};

export type Session = {
  id: string;
  date: string;
  rifle: string;
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
  notes: string;
  created_at?: string;
  updated_at?: string;
};

export const db = {
  rifles: {
    getAll: () => supabase.from('rifles').select('*').order('created_at', { ascending: false }),
    get: (id: string) => supabase.from('rifles').select('*').eq('id', id).single(),
    upsert: (r: Partial<Rifle>) => supabase.from('rifles').upsert(r),
    delete: (id: string) => supabase.from('rifles').delete().eq('id', id),
  },
  loads: {
    getAll: () => supabase.from('loads').select('*').order('created_at', { ascending: false }),
    get: (id: string) => supabase.from('loads').select('*').eq('id', id).single(),
    upsert: (l: Partial<Load>) => supabase.from('loads').upsert(l),
    delete: (id: string) => supabase.from('loads').delete().eq('id', id),
  },
  sessions: {
    getAll: () => supabase.from('sessions').select('*').order('created_at', { ascending: false }),
    get: (id: string) => supabase.from('sessions').select('*').eq('id', id).single(),
    upsert: (s: Partial<Session>) => supabase.from('sessions').upsert(s),
    delete: (id: string) => supabase.from('sessions').delete().eq('id', id),
  },
};

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
