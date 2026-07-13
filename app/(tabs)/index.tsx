import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { db, Rifle, Load, Session } from '../../lib/supabase';
import { C, commonStyles } from '../../lib/theme';

export default function Dashboard() {
  const router = useRouter();
  const [rifles,   setRifles]   = useState<Rifle[]>([]);
  const [loads,    setLoads]    = useState<Load[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refresh,  setRefresh]  = useState(false);

  const fetchAll = useCallback(async () => {
    const [r, l, s] = await Promise.all([
      db.rifles.getAll(),
      db.loads.getAll(),
      db.sessions.getAll(),
    ]);
    setRifles(r.data || []);
    setLoads(l.data || []);
    setSessions(s.data || []);
    setLoading(false);
    setRefresh(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  if (loading) return (
    <View style={commonStyles.center}>
      <ActivityIndicator color={C.accent} size="large" />
    </View>
  );

  const proven = loads.filter(l => l.status === 'proven');

  return (
    <ScrollView
      style={commonStyles.screen}
      contentContainerStyle={commonStyles.content}
      refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); fetchAll(); }} tintColor={C.accent} />}
    >
      <Text style={styles.logo}>⊕ LRS TRACKER</Text>

      {/* Stats */}
      <View style={styles.statsRow}>
        {[
          { label: 'Rifles',   val: rifles.length,   route: '/(tabs)/rifles' },
          { label: 'Loads',    val: loads.length,    route: '/(tabs)/reloads' },
          { label: 'Sessions', val: sessions.length, route: '/(tabs)/fieldlog' },
          { label: 'Proven',   val: proven.length,   route: '/(tabs)/reloads' },
        ].map(s => (
          <TouchableOpacity key={s.label} style={styles.statCard} onPress={() => router.push(s.route as any)}>
            <Text style={styles.statVal}>{s.val}</Text>
            <Text style={styles.statLbl}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Proven loads */}
      {proven.length > 0 && (
        <>
          <Text style={commonStyles.sectionTitle}>PROVEN LOADS</Text>
          {proven.slice(0, 3).map(l => (
            <TouchableOpacity key={l.id} style={commonStyles.card} onPress={() => router.push(`/load/${l.id}` as any)}>
              <Text style={styles.loadRifle}>{l.rifle}</Text>
              <Text style={styles.loadSub}>{l.bullet} {l.bullet_wt}gr · {l.powder} {l.charge}gr</Text>
              {l.velocity ? <Text style={styles.loadVel}>{l.velocity} fps  SD:{l.sd}</Text> : null}
            </TouchableOpacity>
          ))}
        </>
      )}

      {/* Recent sessions */}
      {sessions.length > 0 && (
        <>
          <Text style={commonStyles.sectionTitle}>RECENT SESSIONS</Text>
          {sessions.slice(0, 3).map(s => (
            <TouchableOpacity key={s.id} style={commonStyles.card} onPress={() => router.push(`/session/${s.id}` as any)}>
              <Text style={styles.loadRifle}>{s.rifle}</Text>
              <Text style={styles.loadSub}>{s.date?.slice(0, 10)}{s.location ? ` · ${s.location}` : ''}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      {/* Quick add */}
      <Text style={commonStyles.sectionTitle}>QUICK ADD</Text>
      <View style={styles.quickRow}>
        {[
          { label: '+ Rifle',   route: '/rifle/new' },
          { label: '+ Load',    route: '/load/new' },
          { label: '+ Session', route: '/session/new' },
        ].map(q => (
          <TouchableOpacity key={q.label} style={styles.quickBtn} onPress={() => router.push(q.route as any)}>
            <Text style={styles.quickBtnText}>{q.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  logo:      { fontSize: 18, fontWeight: '800', color: C.accent, letterSpacing: 1.5, marginBottom: 20 },
  statsRow:  { flexDirection: 'row', gap: 8, marginBottom: 8 },
  statCard:  { flex: 1, backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 12, alignItems: 'center' },
  statVal:   { fontSize: 22, fontWeight: '800', color: C.accent },
  statLbl:   { fontSize: 10, color: C.muted, marginTop: 2 },
  loadRifle: { fontSize: 14, fontWeight: '700', color: C.text },
  loadSub:   { fontSize: 12, color: C.textSoft, marginTop: 3 },
  loadVel:   { fontSize: 12, color: C.green, marginTop: 3, fontWeight: '600' },
  quickRow:  { flexDirection: 'row', gap: 8 },
  quickBtn:  { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 12, alignItems: 'center' },
  quickBtnText: { color: C.accent, fontWeight: '600', fontSize: 13 },
});
