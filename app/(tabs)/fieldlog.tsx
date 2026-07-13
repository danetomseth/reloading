import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { db, Session } from '../../lib/supabase';
import { C, commonStyles } from '../../lib/theme';
import { Ionicons } from '@expo/vector-icons';

export default function FieldLog() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refresh,  setRefresh]  = useState(false);

  const fetch = async () => {
    const { data } = await db.sessions.getAll();
    setSessions(data || []);
    setLoading(false);
    setRefresh(false);
  };

  useFocusEffect(useCallback(() => { fetch(); }, []));

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  return (
    <View style={commonStyles.screen}>
      <ScrollView
        contentContainerStyle={commonStyles.content}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); fetch(); }} tintColor={C.accent} />}
      >
        {sessions.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No sessions yet</Text>
            <Text style={styles.emptyHint}>Tap + to log a range session</Text>
          </View>
        ) : sessions.map(s => (
          <TouchableOpacity key={s.id} style={commonStyles.card} onPress={() => router.push(`/session/${s.id}` as any)}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rifle}>{s.rifle}</Text>
                <Text style={styles.date}>{s.date?.slice(0, 10)}{s.location ? ` · ${s.location}` : ''}</Text>
              </View>
              {s.distance ? (
                <View style={styles.distBadge}>
                  <Text style={styles.distText}>{s.distance}yd</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.env}>
              {s.temp       ? <Text style={styles.envItem}>🌡 {s.temp}°F</Text> : null}
              {s.wind_speed ? <Text style={styles.envItem}>💨 {s.wind_speed}mph {s.wind_dir || ''}</Text> : null}
              {s.humidity   ? <Text style={styles.envItem}>💧 {s.humidity}%</Text> : null}
              {s.group_size ? <Text style={[styles.envItem, { color: C.green }]}>🎯 {s.group_size}"</Text> : null}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <TouchableOpacity style={commonStyles.fab} onPress={() => router.push('/session/new' as any)}>
        <Ionicons name="add" size={28} color={C.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  empty:     { alignItems: 'center', marginTop: 80 },
  emptyText: { color: C.text, fontSize: 16, fontWeight: '600' },
  emptyHint: { color: C.muted, fontSize: 13, marginTop: 6 },
  row:       { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  rifle:     { fontSize: 15, fontWeight: '700', color: C.text },
  date:      { fontSize: 12, color: C.muted, marginTop: 2 },
  distBadge: { backgroundColor: C.accent + '22', borderWidth: 1, borderColor: C.accent + '44', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  distText:  { fontSize: 11, fontWeight: '700', color: C.accent },
  env:       { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  envItem:   { fontSize: 12, color: C.textSoft },
});
