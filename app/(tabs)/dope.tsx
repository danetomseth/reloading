import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { db, Rifle, Session } from '../../lib/supabase';
import { C, commonStyles } from '../../lib/theme';

export default function Dope() {
  const [rifles,   setRifles]   = useState<Rifle[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState('');
  const [loading,  setLoading]  = useState(true);

  useFocusEffect(useCallback(() => {
    Promise.all([db.rifles.getAll(), db.sessions.getAll()]).then(([r, s]) => {
      const rs = r.data || [];
      setRifles(rs);
      setSessions(s.data || []);
      // default to first rifle on first load, but keep the user's current pick on refocus
      setSelected(prev => prev || (rs[0]?.name ?? ''));
      setLoading(false);
    });
  }, []));

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  const rows = sessions
    .filter(s => s.rifle === selected && s.distance && s.clicks_up)
    .sort((a, b) => Number(a.distance) - Number(b.distance));

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        {rifles.map(r => (
          <TouchableOpacity key={r.id}
            style={[styles.chip, selected === r.name && styles.chipActive]}
            onPress={() => setSelected(r.name)}
          >
            <Text style={[styles.chipText, selected === r.name && styles.chipTextActive]}>{r.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No dope data yet</Text>
          <Text style={styles.emptyHint}>Log sessions with scope adjustments to build your dope card</Text>
        </View>
      ) : (
        <>
          <Text style={commonStyles.sectionTitle}>DOPE — {selected.toUpperCase()}</Text>
          <View style={styles.header}>
            {['Range', 'Up', 'Right', 'Group', 'Temp'].map(h => (
              <Text key={h} style={styles.th}>{h}</Text>
            ))}
          </View>
          {rows.map((s, i) => (
            <View key={s.id} style={[styles.row, i % 2 === 0 && styles.rowEven]}>
              <Text style={styles.td}>{s.distance}yd</Text>
              <Text style={styles.td}>{s.clicks_up || '—'}</Text>
              <Text style={styles.td}>{s.clicks_right || '—'}</Text>
              <Text style={styles.td}>{s.group_size ? `${s.group_size}"` : '—'}</Text>
              <Text style={styles.td}>{s.temp ? `${s.temp}°` : '—'}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chipScroll:    { marginBottom: 8 },
  chip:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, marginRight: 8 },
  chipActive:    { backgroundColor: C.accent + '22', borderColor: C.accent },
  chipText:      { color: C.muted, fontSize: 13, fontWeight: '600' },
  chipTextActive:{ color: C.accent },
  empty:         { alignItems: 'center', marginTop: 60 },
  emptyText:     { color: C.text, fontSize: 16, fontWeight: '600' },
  emptyHint:     { color: C.muted, fontSize: 13, marginTop: 6, textAlign: 'center' },
  header:        { flexDirection: 'row', backgroundColor: C.card, padding: 10, borderRadius: 6, marginBottom: 2 },
  row:           { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  rowEven:       { backgroundColor: C.surface },
  th:            { flex: 1, fontSize: 10, fontWeight: '700', color: C.accent, textTransform: 'uppercase' },
  td:            { flex: 1, fontSize: 13, color: C.text },
});
