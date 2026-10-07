import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { db, Load, Rifle, Group, parseLoadIds } from '../../lib/supabase';
import { cachedList } from '../../lib/cache';
import { C, commonStyles, statusColor } from '../../lib/theme';
import { Ionicons } from '@expo/vector-icons';
import { allIds, assignCodes, belongsTo, parseLoadId, planUpgrade, rifleOf } from '../../lib/loadIds';

type Mode = 'loads' | 'groups';

export default function Reloads() {
  const router = useRouter();
  const [mode,     setMode]     = useState<Mode>('loads');
  const [loads,    setLoads]    = useState<Load[]>([]);
  const [rifles,   setRifles]   = useState<Rifle[]>([]);
  const [groups,   setGroups]   = useState<Group[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refresh,  setRefresh]  = useState(false);
  const [filter,   setFilter]   = useState('');
  const [rifleSel, setRifleSel] = useState('');

  const fetch = async () => {
    const [l, r, g] = await Promise.all([
      cachedList<Load>('loads', db.loads.getAll()),
      cachedList<Rifle>('rifles', db.rifles.getAll()),
      cachedList<Group>('groups', db.groups.getAll()),
    ]);
    setLoads(l);
    setRifles(r);
    setGroups(g);
    setLoading(false);
    setRefresh(false);
  };

  useFocusEffect(useCallback(() => { fetch(); }, []));

  const plan = useMemo(() => planUpgrade(rifles, loads, assignCodes(rifles)), [rifles, loads]);
  const sel = rifles.find(r => r.id === rifleSel);
  const q = filter.trim().toLowerCase();

  const filteredLoads = useMemo(() => {
    const list = loads
      .filter(l => !sel || belongsTo(l, sel))
      .filter(l => !q || [...allIds(l), l.rifle, l.bullet, l.powder, l.status]
        .some(v => (v || '').toLowerCase().includes(q)));
    if (sel) list.sort((a, b) => (parseLoadId(b.load_id)?.seq ?? 0) - (parseLoadId(a.load_id)?.seq ?? 0));
    return list;
  }, [loads, sel, q]);

  const filteredGroups = groups.filter(g => !q || (g.name || '').toLowerCase().includes(q));

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  const pendingText = [
    plan.pending ? `${plan.pending} to renumber` : '',
    plan.unlinked.length ? `${plan.unlinked.length} without a rifle` : '',
  ].filter(Boolean).join(', ');

  return (
    <View style={commonStyles.screen}>
      <View style={styles.toggleRow}>
        {(['loads', 'groups'] as Mode[]).map(m => (
          <TouchableOpacity key={m} style={[styles.toggle, mode === m && styles.toggleOn]} onPress={() => setMode(m)}>
            <Text style={[styles.toggleText, mode === m && styles.toggleTextOn]}>
              {m === 'loads' ? `Loads (${loads.length})` : `Groups (${groups.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={C.muted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.search}
          value={filter}
          onChangeText={setFilter}
          placeholder={mode === 'loads' ? 'Search IDs, bullets, powders…' : 'Search groups…'}
          placeholderTextColor={C.muted}
          autoCapitalize="none"
        />
        {mode === 'loads' && (
          <TouchableOpacity onPress={() => router.push('/import' as any)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="download-outline" size={18} color={C.accent} />
          </TouchableOpacity>
        )}
      </View>

      {mode === 'loads' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipBar} contentContainerStyle={styles.chipBarInner}>
          <TouchableOpacity style={[styles.chip, !sel && styles.chipOn]} onPress={() => setRifleSel('')}>
            <Text style={[styles.chipText, !sel && styles.chipTextOn]}>All {loads.length}</Text>
          </TouchableOpacity>
          {rifles.map(r => {
            const on = sel?.id === r.id;
            return (
              <TouchableOpacity key={r.id} style={[styles.chip, on && styles.chipOn]} onPress={() => setRifleSel(on ? '' : r.id)}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.name} {loads.filter(l => belongsTo(l, r)).length}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <ScrollView
        contentContainerStyle={commonStyles.content}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); fetch(); }} tintColor={C.accent} />}
      >
        {mode === 'loads' ? (
          <>
            {pendingText !== '' && (
              <TouchableOpacity style={styles.banner} onPress={() => router.push('/load-ids' as any)}>
                <Ionicons name="pricetags-outline" size={18} color={C.orange} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bannerTitle}>Switch to per-rifle load IDs</Text>
                  <Text style={styles.bannerText}>{pendingText}. Old IDs stay attached.</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.muted} />
              </TouchableOpacity>
            )}
            {filteredLoads.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>{filter ? 'No results' : sel ? `No loads for ${sel.name} yet` : 'No loads yet'}</Text>
              </View>
            ) : filteredLoads.map(l => {
              const sc = statusColor(l.status);
              const recipe = [
                l.bullet ? `${l.bullet} ${l.bullet_wt}gr` : '',
                l.powder ? `${l.powder} ${l.charge}gr` : '',
              ].filter(Boolean).join(' · ');
              return (
                <TouchableOpacity key={l.id} style={commonStyles.card} onPress={() => router.push(`/load/${l.id}` as any)}>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.loadId, !l.load_id && { color: C.muted }]}>{l.load_id || 'No ID yet'}</Text>
                      {!sel && <Text style={styles.rifleName}>{rifleOf(l, rifles)?.name ?? l.rifle}</Text>}
                      {recipe !== '' && <Text style={styles.bullet}>{recipe}</Text>}
                    </View>
                    <View style={[styles.badge, { borderColor: sc + '44', backgroundColor: sc + '22' }]}>
                      <Text style={[styles.badgeText, { color: sc }]}>{l.status}</Text>
                    </View>
                  </View>
                  <View style={styles.tags}>
                    {l.ladder && l.ladder !== '[]' ? <Text style={[styles.tag, { color: C.purple }]}>📈 ladder</Text> : null}
                    {l.velocity   ? <Text style={[styles.tag, { color: C.green }]}>{l.velocity}fps</Text> : null}
                    {l.sd         ? <Text style={styles.tag}>SD {l.sd}</Text> : null}
                    {l.group_size ? <Text style={styles.tag}>🎯 {l.group_size}" @ {l.distance}yd</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        ) : (
          filteredGroups.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{filter ? 'No results' : 'No groups yet'}</Text>
              {!filter && <Text style={styles.emptyHint}>Tap + to create a group and add loads to it</Text>}
            </View>
          ) : filteredGroups.map(g => {
            const ids = new Set(parseLoadIds(g.load_ids));
            const members = loads.filter(l => ids.has(l.id));
            const names = [...new Set(members.map(m => rifleOf(m, rifles)?.name ?? m.rifle).filter(Boolean))];
            return (
              <TouchableOpacity key={g.id} style={commonStyles.card} onPress={() => router.push(`/group/${g.id}` as any)}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupName}>{g.name || 'Untitled group'}</Text>
                    {g.notes ? <Text style={styles.bullet} numberOfLines={1}>{g.notes}</Text> : null}
                  </View>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{ids.size}</Text>
                  </View>
                </View>
                {names.length > 0 && (
                  <View style={styles.tags}>
                    {names.slice(0, 4).map(r => <Text key={r} style={styles.tag}>{r}</Text>)}
                    {names.length > 4 ? <Text style={styles.tag}>+{names.length - 4}</Text> : null}
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <TouchableOpacity
        style={commonStyles.fab}
        onPress={() => router.push((mode === 'groups' ? '/group/new' : sel ? `/load/new?rifle=${sel.id}` : '/load/new') as any)}
      >
        <Ionicons name="add" size={28} color={C.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow:    { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 12 },
  toggle:       { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center' },
  toggleOn:     { backgroundColor: C.accent + '22', borderColor: C.accent },
  toggleText:   { color: C.muted, fontSize: 13, fontWeight: '700' },
  toggleTextOn: { color: C.accent },
  searchWrap:   { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, margin: 16, marginBottom: 8, borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 8 },
  search:       { flex: 1, color: C.text, fontSize: 14 },
  chipBar:      { flexGrow: 0 },
  chipBarInner: { paddingHorizontal: 16, paddingBottom: 4 },
  chip:         { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, marginRight: 8 },
  chipOn:       { backgroundColor: C.accent + '22', borderColor: C.accent },
  chipText:     { color: C.muted, fontSize: 12, fontWeight: '600' },
  chipTextOn:   { color: C.accent },
  banner:       { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.orange + '12', borderWidth: 1, borderColor: C.orange + '55', borderRadius: 8, padding: 12, marginBottom: 12 },
  bannerTitle:  { color: C.text, fontWeight: '700', fontSize: 14 },
  bannerText:   { color: C.textSoft, fontSize: 12, marginTop: 2 },
  empty:        { alignItems: 'center', marginTop: 80 },
  emptyText:    { color: C.muted, fontSize: 15 },
  emptyHint:    { color: C.muted, fontSize: 13, marginTop: 6, textAlign: 'center' },
  row:          { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  loadId:       { fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: 0.3 },
  rifleName:    { fontSize: 13, fontWeight: '600', color: C.accent, marginTop: 2 },
  groupName:    { fontSize: 15, fontWeight: '700', color: C.text },
  bullet:       { fontSize: 12, color: C.textSoft, marginTop: 2 },
  badge:        { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:    { fontSize: 11, fontWeight: '700' },
  countBadge:   { backgroundColor: C.accent + '22', borderWidth: 1, borderColor: C.accent + '44', borderRadius: 14, minWidth: 28, height: 28, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  countText:    { color: C.accent, fontSize: 13, fontWeight: '800' },
  tags:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tag:          { fontSize: 12, color: C.textSoft },
});
