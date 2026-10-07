// Offline read-through cache for Supabase data.
// Every successful fetch is mirrored to AsyncStorage; when the network is
// unavailable, reads fall back to the last-synced copy so the app stays
// usable with no signal. Writes still require a connection.

import AsyncStorage from '@react-native-async-storage/async-storage';

type ListRes<T> = { data: T[] | null; error: unknown };
type RowRes<T> = { data: T | null; error: unknown };

const key = (name: string) => `lrs.cache.${name}`;

export async function readCache<T>(name: string): Promise<T[]> {
  try {
    const v = await AsyncStorage.getItem(key(name));
    return v ? (JSON.parse(v) as T[]) : [];
  } catch {
    return [];
  }
}

async function writeCache<T>(name: string, rows: T[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key(name), JSON.stringify(rows));
  } catch {
    // best-effort; a full disk shouldn't break a fetch
  }
}

// Run a Supabase `getAll()` query: on success mirror to cache and return it;
// offline (or on error) return the last-synced rows.
export async function cachedList<T>(name: string, query: PromiseLike<ListRes<T>>): Promise<T[]> {
  try {
    const { data, error } = await query;
    if (!error && Array.isArray(data)) {
      await writeCache(name, data);
      return data;
    }
  } catch {
    // network failure — fall through to cache
  }
  return readCache<T>(name);
}

// Run a Supabase `get(id)` query: on success return the row; offline fall back
// to the matching row from the cached collection.
export async function cachedGet<T extends { id: string }>(
  name: string,
  query: PromiseLike<RowRes<T>>,
  id: string,
): Promise<T | null> {
  try {
    const { data, error } = await query;
    if (!error && data) return data;
  } catch {
    // network failure — fall through to cache
  }
  const rows = await readCache<T>(name);
  return rows.find((r) => r.id === id) ?? null;
}
