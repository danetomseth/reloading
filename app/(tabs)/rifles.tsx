import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { db, Rifle } from '../../lib/supabase';
import { C, commonStyles } from '../../lib/theme';
import { Ionicons } from '@expo/vector-icons';

export default function Rifles() {
  const router = useRouter();
  const [rifles,  setRifles]  = useState<Rifle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const fetch = async () => {
    const { data } = await db.rifles.getAll();
    setRifles(data || []);
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
        {rifles.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No rifles yet</Text>
            <Text style={styles.emptyHint}>Tap + to add your first rifle</Text>
          </View>
        ) : rifles.map(r => (
          <TouchableOpacity key={r.id} style={commonStyles.card} onPress={() => router.push(`/rifle/${r.id}` as any)}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{r.name}</Text>
                <Text style={styles.caliber}>{r.caliber}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </View>
            <View style={styles.details}>
              {r.barrel_len ? <Text style={styles.detail}>🔫 {r.barrel_len}"</Text> : null}
              {r.twist ? <Text style={styles.detail}>1:{r.twist} twist</Text> : null}
              {r.scope_model ? <Text style={styles.detail}>🔭 {r.scope_model}</Text> : null}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <TouchableOpacity style={commonStyles.fab} onPress={() => router.push('/rifle/new' as any)}>
        <Ionicons name="add" size={28} color={C.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  empty:     { alignItems: 'center', marginTop: 80 },
  emptyText: { color: C.text, fontSize: 16, fontWeight: '600' },
  emptyHint: { color: C.muted, fontSize: 13, marginTop: 6 },
  row:       { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  name:      { fontSize: 15, fontWeight: '700', color: C.text },
  caliber:   { fontSize: 13, color: C.accent, marginTop: 2 },
  details:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detail:    { fontSize: 12, color: C.textSoft },
});
