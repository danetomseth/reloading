// Offline-first data layer for Supabase.
//
// Reads: every successful fetch is mirrored to AsyncStorage. When the network
// is slow or unavailable, reads return the last-synced copy after a short wait
// (or at once, once we know we're offline), so screens never hang on a spinner.
//
// Writes: every change is applied to the local copy straight away. If the
// network is up it is sent immediately; if not, it is queued in an outbox that
// is replayed in order when the connection comes back (on app foreground, every
// 30 s while changes are waiting, and after any successful request).
// Last write wins; queued rows carry their own ids, so replays are idempotent.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { supabase } from './client';

export type Table = 'rifles' | 'loads' | 'sessions' | 'groups';
export const TABLES: Table[] = ['rifles', 'loads', 'sessions', 'groups'];

type Row = { id: string; [k: string]: unknown };
type DbError = { message: string; code?: string };
type ListRes<T> = { data: T[] | null; error: unknown; status?: number };
type RowRes<T> = { data: T | null; error: unknown; status?: number };

export type WriteOp =
  | { table: Table; kind: 'upsert'; row: object }
  | { table: Table; kind: 'update'; rowId: string; patch: object }
  | { table: Table; kind: 'delete'; rowId: string }
  | { table: Table; kind: 'updateWhere'; column: string; value: string; patch: object };

type QueuedOp = WriteOp & { opId: string; at: string };
type FailedOp = QueuedOp & { error: string };

const key = (name: string) => `lrs.cache.${name}`;
const OUTBOX_KEY = 'lrs.outbox';
const FAILED_KEY = 'lrs.outbox.failed';

const READ_TIMEOUT_CACHED = 4000;   // have a local copy: don't make the user wait long
const READ_TIMEOUT_EMPTY = 15000;   // nothing cached yet: worth waiting for the network
const WRITE_TIMEOUT = 10000;
const OFFLINE_COOLDOWN = 15000;     // after a network failure, skip the network this long

// ---------------------------------------------------------------- local store

const mem: Partial<Record<string, Row[]>> = {};

export async function readCache<T>(name: string): Promise<T[]> {
  if (mem[name]) return mem[name] as unknown as T[];
  try {
    const v = await AsyncStorage.getItem(key(name));
    const rows = v ? (JSON.parse(v) as Row[]) : [];
    if (!mem[name]) mem[name] = rows;
    return mem[name] as unknown as T[];
  } catch {
    return [];
  }
}

async function writeCache(name: string, rows: Row[]): Promise<void> {
  mem[name] = rows;
  try {
    await AsyncStorage.setItem(key(name), JSON.stringify(rows));
  } catch {
    // best-effort; a full disk shouldn't break a fetch
  }
}

function applyOp(rows: Row[], op: WriteOp): Row[] {
  switch (op.kind) {
    case 'upsert': {
      const row = op.row as Row;
      if (!row.id) return rows;
      const i = rows.findIndex(r => r.id === row.id);
      if (i < 0) return [row, ...rows];   // lists are newest first
      const next = rows.slice();
      next[i] = { ...rows[i], ...row };
      return next;
    }
    case 'update':
      return rows.map(r => (r.id === op.rowId ? { ...r, ...op.patch } : r));
    case 'delete':
      return rows.filter(r => r.id !== op.rowId);
    case 'updateWhere':
      return rows.map(r => (r[op.column] === op.value ? { ...r, ...op.patch } : r));
  }
}

async function applyLocal(op: WriteOp): Promise<void> {
  const rows = (await readCache<Row>(op.table)) as Row[];
  await writeCache(op.table, applyOp(rows, op));
}

// ----------------------------------------------------------- outbox + status

let outbox: QueuedOp[] | null = null;
let failed: FailedOp[] = [];
let offlineUntil = 0;

async function loadOutbox(): Promise<QueuedOp[]> {
  if (outbox) return outbox;
  try {
    const [q, f] = await Promise.all([AsyncStorage.getItem(OUTBOX_KEY), AsyncStorage.getItem(FAILED_KEY)]);
    if (!outbox) {
      outbox = q ? JSON.parse(q) : [];
      failed = f ? JSON.parse(f) : [];
    }
  } catch {
    if (!outbox) outbox = [];
  }
  emit();
  return outbox!;
}

async function saveOutbox(): Promise<void> {
  emit();
  try {
    await AsyncStorage.multiSet([
      [OUTBOX_KEY, JSON.stringify(outbox ?? [])],
      [FAILED_KEY, JSON.stringify(failed)],
    ]);
  } catch {
    // best-effort
  }
}

export type SyncStatus = { offline: boolean; pending: number; failed: FailedOp[]; syncing: boolean };
let syncing = false;
const listeners = new Set<(s: SyncStatus) => void>();

export function getSyncStatus(): SyncStatus {
  return { offline: Date.now() < offlineUntil, pending: outbox?.length ?? 0, failed, syncing };
}

export function subscribeSync(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn);
  loadOutbox();
  fn(getSyncStatus());
  return () => { listeners.delete(fn); };
}

function emit() {
  const s = getSyncStatus();
  listeners.forEach(fn => fn(s));
}

let offlineTimer: ReturnType<typeof setTimeout> | null = null;
function markOffline() {
  offlineUntil = Date.now() + OFFLINE_COOLDOWN;
  if (offlineTimer) clearTimeout(offlineTimer);
  offlineTimer = setTimeout(emit, OFFLINE_COOLDOWN + 50);   // let the banner notice the cooldown ending
  emit();
}

function markOnline() {
  const was = Date.now() < offlineUntil;
  offlineUntil = 0;
  if (was) emit();
  if (outbox?.length && !flushing) flush();
}

const isOfflineFlagged = () => Date.now() < offlineUntil;

// ------------------------------------------------------------- network calls

// status 0 is what postgrest-js reports when fetch itself failed (no signal,
// DNS, timeout/abort) — anything else is a real answer from the server
const isNetworkFailure = (res: { status?: number } | null | undefined) => !res || res.status === 0;

type Outcome<R> = { kind: 'ok'; res: R } | { kind: 'network' };

// Race a request against a timeout. The query builder is lazy, so the request
// only goes out here. A request that loses the race is aborted.
async function timed<R extends { status?: number; error: unknown }>(
  build: (signal: AbortSignal) => PromiseLike<R>,
  ms: number,
  onLate?: (res: R) => void,
): Promise<Outcome<R>> {
  const ctl = new AbortController();
  let timedOut = false;
  const req = Promise.resolve()
    .then(() => build(ctl.signal))
    .then(
      res => { if (timedOut && onLate && !isNetworkFailure(res)) onLate(res); return res; },
      () => null,
    );
  const timer = new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), ms));
  const winner = await Promise.race([req, timer]);
  if (winner === 'timeout') {
    timedOut = true;
    if (!onLate) ctl.abort();
    return { kind: 'network' };
  }
  if (isNetworkFailure(winner)) return { kind: 'network' };
  return { kind: 'ok', res: winner as R };
}

const withSignal = <Q>(q: Q, signal: AbortSignal): Q => {
  const b = q as unknown as { abortSignal?: (s: AbortSignal) => Q };
  return typeof b.abortSignal === 'function' ? b.abortSignal(signal) : q;
};

async function hasSession(): Promise<boolean> {
  const res = await Promise.race([
    supabase.auth.getSession().then(r => !!r.data.session, () => false),
    new Promise<boolean>(resolve => setTimeout(() => resolve(false), 3000)),
  ]);
  return res;
}

// ---------------------------------------------------------------------- reads

// Bring fetched rows up to date with changes still waiting in the outbox.
async function overlay(name: string, rows: Row[]): Promise<Row[]> {
  const q = await loadOutbox();
  return q.filter(op => op.table === name).reduce(applyOp, rows);
}

async function storeFetched(name: string, data: Row[]): Promise<Row[] | null> {
  const cached = await readCache<Row>(name);
  // An expired token that couldn't refresh makes Supabase fall back to the
  // anonymous key, and row-level security then answers with an empty list.
  // Never let that wipe the local copy.
  if (data.length === 0 && cached.length > 0 && !(await hasSession())) return null;
  const rows = await overlay(name, data);
  await writeCache(name, rows);
  return rows;
}

// Run a Supabase `getAll()` query: on success mirror to cache and return it;
// offline, slow, or on error return the local copy.
export async function cachedList<T>(name: string, query: PromiseLike<ListRes<T>>): Promise<T[]> {
  const cached = await readCache<Row>(name);
  if (isOfflineFlagged()) return cached as unknown as T[];

  const late = (res: ListRes<T>) => {
    if (!res.error && Array.isArray(res.data)) { markOnline(); storeFetched(name, res.data as unknown as Row[]); }
  };
  const out = await timed(s => withSignal(query, s), cached.length ? READ_TIMEOUT_CACHED : READ_TIMEOUT_EMPTY, late);
  if (out.kind === 'network') { markOffline(); return (await readCache<Row>(name)) as unknown as T[]; }

  markOnline();
  const { data, error } = out.res;
  if (!error && Array.isArray(data)) {
    const rows = await storeFetched(name, data as unknown as Row[]);
    if (rows) return rows as unknown as T[];
  }
  return (await readCache<Row>(name)) as unknown as T[];
}

// Run a Supabase `get(id)` query: on success return the row (with any queued
// changes applied); offline fall back to the matching row of the cached list.
export async function cachedGet<T extends { id: string }>(
  name: string,
  query: PromiseLike<RowRes<T>>,
  id: string,
): Promise<T | null> {
  const fromCache = async () => ((await readCache<Row>(name)).find(r => r.id === id) as unknown as T) ?? null;
  if (isOfflineFlagged()) return fromCache();

  const local = await fromCache();
  const out = await timed(s => withSignal(query, s), local ? READ_TIMEOUT_CACHED : READ_TIMEOUT_EMPTY);
  if (out.kind === 'network') { markOffline(); return fromCache(); }

  markOnline();
  const { data, error } = out.res;
  if (error || !data) return fromCache();   // e.g. a row created offline that hasn't synced yet
  const [row] = await overlay(name, [data as unknown as Row]);
  if (!row) return null;                    // deleted locally, delete still queued
  await applyLocal({ table: name as Table, kind: 'upsert', row });
  return row as unknown as T;
}

// Pull every table into the local copy, so all data is there before going offline.
export async function prefetchAll(): Promise<void> {
  await Promise.all(TABLES.map(t =>
    cachedList(t, supabase.from(t).select('*').order('created_at', { ascending: false }))));
}

// --------------------------------------------------------------------- writes

function buildWrite(op: WriteOp) {
  const t = supabase.from(op.table);
  switch (op.kind) {
    case 'upsert':      return t.upsert(op.row);
    case 'update':      return t.update(op.patch).eq('id', op.rowId);
    case 'delete':      return t.delete().eq('id', op.rowId);
    case 'updateWhere': return t.update(op.patch).eq(op.column, op.value);
  }
}

const toError = (e: unknown): DbError => {
  const x = e as { message?: string; code?: string } | null;
  return { message: x?.message || String(e), code: x?.code };
};

async function enqueue(op: WriteOp): Promise<void> {
  const q = await loadOutbox();
  q.push({ ...op, opId: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), at: new Date().toISOString() });
  await applyLocal(op);
  await saveOutbox();
}

// Apply a change locally and send it, or queue it when offline. Resolves with
// `error` only when the server actually rejected the change.
export async function offlineWrite(op: WriteOp): Promise<{ error: DbError | null }> {
  const q = await loadOutbox();
  // keep order: if anything is already waiting, this change waits behind it
  if (isOfflineFlagged() || q.length > 0) {
    await enqueue(op);
    if (!isOfflineFlagged()) flush();
    return { error: null };
  }
  const out = await timed(s => buildWrite(op).abortSignal(s), WRITE_TIMEOUT);
  if (out.kind === 'network') {
    markOffline();
    await enqueue(op);
    return { error: null };
  }
  markOnline();
  if (out.res.error) return { error: toError(out.res.error) };
  await applyLocal(op);
  return { error: null };
}

// ----------------------------------------------------------------------- sync

let flushing: Promise<void> | null = null;

export function flush(): Promise<void> {
  if (!flushing) flushing = doFlush().finally(() => { flushing = null; syncing = false; emit(); });
  return flushing;
}

async function doFlush(): Promise<void> {
  const q = await loadOutbox();
  if (!q.length) return;
  // without a valid session the server would answer as the anonymous user and
  // silently change nothing — keep the changes queued until signed in again
  if (!(await hasSession())) return;
  syncing = true; emit();
  while (q.length) {
    const op = q[0];
    const out = await timed(s => buildWrite(op).abortSignal(s), WRITE_TIMEOUT);
    if (out.kind === 'network') { markOffline(); return; }
    offlineUntil = 0;
    if (out.res.error) failed = [...failed, { ...op, error: toError(out.res.error).message }];
    q.shift();
    await saveOutbox();
  }
}

// Try to sync right now, ignoring the offline cooldown (pull-to-refresh, tapping the banner).
export async function syncNow(): Promise<void> {
  offlineUntil = 0;
  emit();
  await flush();
  if (!isOfflineFlagged()) await prefetchAll();
}

export async function dismissFailed(): Promise<void> {
  failed = [];
  await saveOutbox();
}

let started = false;
export function startSync(): void {
  if (started) return;
  started = true;
  loadOutbox().then(() => syncNow());
  AppState.addEventListener('change', s => { if (s === 'active') syncNow(); });
  setInterval(() => {
    if (AppState.currentState === 'active' && (outbox?.length ?? 0) > 0) { offlineUntil = 0; flush(); }
  }, 30000);
}

// Forget everything stored on this device (on an explicit sign-out).
export async function clearOfflineData(): Promise<void> {
  outbox = [];
  failed = [];
  TABLES.forEach(t => { delete mem[t]; });
  try {
    await AsyncStorage.multiRemove([...TABLES.map(key), OUTBOX_KEY, FAILED_KEY]);
  } catch {
    // best-effort
  }
  emit();
}
