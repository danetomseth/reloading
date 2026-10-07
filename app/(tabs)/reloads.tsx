import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { db, Load, Group, parseLoadIds } from '../../lib/supabase';
import { cachedList } from '../../lib/cache';
import { C, commonStyles, statusColor } from '../../lib/theme';
import { Ionicons } from '@expo/vector-icons';

type View = 'loads' | 'groups';

export default function Reloads() {
  const router = useRouter();
  const [view,    setView]    = useState<View>('loads');
  const [loads,   setLoads]   = useState<Load[]>([]);
  const [groups,  setGroups]  = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [filter,  setFilter]  = useState('');

  const fetch = async () => {
    const [l, g] = await Promise.all([
      cachedList<Load>('loads', db.loads.getAll()),
      cachedList<Group>('groups', db.groups.getAll()),
    ]);
    setLoads(l);
    setGroups(g);
    setLoading(false);
    setRefresh(false);
  };

  useFocusEffect(useCallback(() => { fetch(); }, []));

  const filteredLoads = loads.filter(l =>
    !filter || [l.rifle, l.bullet, l.powder, l.status, l.lot_number]
      .some(v => v?.toLowerCase().includes(filter.toLowerCase()))
  );
  const filteredGroups = groups.filter(g =>
    !filter || g.name?.toLowerCase().includes(filter.toLowerCase())
  );

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  return (
    <View style={commonStyles.screen}>
      <View style={styles.toggleRow}>
        {(['loads', 'groups'] as View[]).map(v => (
          <TouchableOpacity key={v} style={[styles.toggle, view === v && styles.toggleOn]} onPress={() => setView(v)}>
            <Text style={[styles.toggleText, view === v && styles.toggleTextOn]}>
              {v === 'loads' ? `Loads (${loads.length})` : `Groups (${groups.length})`}
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
          placeholder={view === 'loads' ? 'Search loads…' : 'Search groups…'}
          placeholderTextColor={C.muted}
        />
        {view === 'loads' && (
          <TouchableOpacity onPress={() => router.push('/import' as any)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="download-outline" size={18} color={C.accent} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={commonStyles.content}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); fetch(); }} tintColor={C.accent} />}
      >
        {view === 'loads' ? (
          filteredLoads.length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyText}>{filter ? 'No results' : 'No loads yet'}</Text></View>
          ) : filteredLoads.map(l => {
            const sc = statusColor(l.status);
            return (
              <TouchableOpacity key={l.id} style={commonStyles.card} onPress={() => router.push(`/load/${l.id}` as any)}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rifle}>{l.rifle}</Text>
                    <Text style={styles.bullet}>{l.bullet} {l.bullet_wt}gr · {l.powder} {l.charge}gr</Text>
                  </View>
                  <View style={[styles.badge, { borderColor: sc + '44', backgroundColor: sc + '22' }]}>
                    <Text style={[styles.badgeText, { color: sc }]}>{l.status}</Text>
                  </View>
                </View>
                <View style={styles.tags}>
                  {l.load_id ? <Text style={[styles.tag, { color: C.accent }]}>#{l.load_id}</Text> : null}
                  {l.lot_number ? <Text style={styles.tag}>LOT {l.lot_number}</Text> : null}
                  {l.ladder && l.ladder !== '[]' ? <Text style={[styles.tag, { color: C.purple }]}>📈 ladder</Text> : null}
                  {l.velocity   ? <Text style={[styles.tag, { color: C.green }]}>{l.velocity}fps</Text> : null}
                  {l.sd         ? <Text style={styles.tag}>SD {l.sd}</Text> : null}
                  {l.group_size ? <Text style={styles.tag}>🎯 {l.group_size}" @ {l.distance}yd</Text> : null}
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          filteredGroups.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{filter ? 'No results' : 'No groups yet'}</Text>
              {!filter && <Text style={styles.emptyHint}>Tap + to create a group and add loads to it</Text>}
            </View>
          ) : filteredGroups.map(g => {
            const ids = new Set(parseLoadIds(g.load_ids));
            const members = loads.filter(l => ids.has(l.id));
            const rifles = [...new Set(members.map(m => m.rifle).filter(Boolean))];
            return (
              <TouchableOpacity key={g.id} style={commonStyles.card} onPress={() => router.push(`/group/${g.id}` as any)}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rifle}>{g.name || 'Untitled group'}</Text>
                    {g.notes ? <Text style={styles.bullet} numberOfLines={1}>{g.notes}</Text> : null}
                  </View>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{ids.size}</Text>
                  </View>
                </View>
                {rifles.length > 0 && (
                  <View style={styles.tags}>
                    {rifles.slice(0, 4).map(r => <Text key={r} style={styles.tag}>{r}</Text>)}
                    {rifles.length > 4 ? <Text style={styles.tag}>+{rifles.length - 4}</Text> : null}
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <TouchableOpacity
        style={commonStyles.fab}
        onPress={() => router.push((view === 'groups' ? '/group/new' : '/load/new') as any)}
      >
        <Ionicons name="add" size={28} color={C.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow:  { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 12 },
  toggle:     { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center' },
  toggleOn:   { backgroundColor: C.accent + '22', borderColor: C.accent },
  toggleText: { color: C.muted, fontSize: 13, fontWeight: '700' },
  toggleTextOn:{ color: C.accent },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, margin: 16, marginBottom: 4, borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 8 },
  search:     { flex: 1, color: C.text, fontSize: 14 },
  empty:      { alignItems: 'center', marginTop: 80 },
  emptyText:  { color: C.muted, fontSize: 15 },
  emptyHint:  { color: C.muted, fontSize: 13, marginTop: 6, textAlign: 'center' },
  row:        { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  rifle:      { fontSize: 15, fontWeight: '700', color: C.text },
  bullet:     { fontSize: 12, color: C.textSoft, marginTop: 2 },
  badge:      { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:  { fontSize: 11, fontWeight: '700' },
  countBadge: { backgroundColor: C.accent + '22', borderWidth: 1, borderColor: C.accent + '44', borderRadius: 14, minWidth: 28, height: 28, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  countText:  { color: C.accent, fontSize: 13, fontWeight: '800' },
  tags:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tag:        { fontSize: 12, color: C.textSoft },
});
