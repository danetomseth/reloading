import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { db, Load } from '../../lib/supabase';
import { C, commonStyles, statusColor } from '../../lib/theme';
import { Ionicons } from '@expo/vector-icons';

export default function Reloads() {
  const router = useRouter();
  const [loads,   setLoads]   = useState<Load[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [filter,  setFilter]  = useState('');

  const fetch = async () => {
    const { data } = await db.loads.getAll();
    setLoads(data || []);
    setLoading(false);
    setRefresh(false);
  };

  useFocusEffect(useCallback(() => { fetch(); }, []));

  const filtered = loads.filter(l =>
    !filter || [l.rifle, l.bullet, l.powder, l.status, l.lot_number]
      .some(v => v?.toLowerCase().includes(filter.toLowerCase()))
  );

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  return (
    <View style={commonStyles.screen}>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={C.muted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.search}
          value={filter}
          onChangeText={setFilter}
          placeholder="Search loads…"
          placeholderTextColor={C.muted}
        />
      </View>

      <ScrollView
        contentContainerStyle={commonStyles.content}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); fetch(); }} tintColor={C.accent} />}
      >
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{filter ? 'No results' : 'No loads yet'}</Text>
          </View>
        ) : filtered.map(l => {
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
                {l.lot_number ? <Text style={[styles.tag, { color: C.accent }]}>LOT {l.lot_number}</Text> : null}
                {l.velocity   ? <Text style={[styles.tag, { color: C.green }]}>{l.velocity}fps</Text> : null}
                {l.sd         ? <Text style={styles.tag}>SD {l.sd}</Text> : null}
                {l.group_size ? <Text style={styles.tag}>🎯 {l.group_size}" @ {l.distance}yd</Text> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity style={commonStyles.fab} onPress={() => router.push('/load/new' as any)}>
        <Ionicons name="add" size={28} color={C.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, margin: 16, marginBottom: 4, borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 8 },
  search:     { flex: 1, color: C.text, fontSize: 14 },
  empty:      { alignItems: 'center', marginTop: 80 },
  emptyText:  { color: C.muted, fontSize: 15 },
  row:        { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  rifle:      { fontSize: 15, fontWeight: '700', color: C.text },
  bullet:     { fontSize: 12, color: C.textSoft, marginTop: 2 },
  badge:      { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:  { fontSize: 11, fontWeight: '700' },
  tags:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tag:        { fontSize: 12, color: C.textSoft },
});
