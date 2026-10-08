import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { db, Group, Load, uid, parseLoadIds } from '../../lib/supabase';
import { cachedList, cachedGet } from '../../lib/cache';
import { C, commonStyles, statusColor } from '../../lib/theme';

const emptyGroup = (): Partial<Group> => ({
  id: uid(), name: '', load_ids: '[]', notes: '',
});

export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const isNew   = id === 'new';
  const [form,     setForm]     = useState<Partial<Group>>(emptyGroup());
  const [loads,    setLoads]    = useState<Load[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading,  setLoading]  = useState(!isNew);
  const [saving,   setSaving]   = useState(false);
  const [filter,   setFilter]   = useState('');

  useEffect(() => {
    cachedList<Load>('loads', db.loads.getAll()).then(setLoads);
    if (isNew) return;
    cachedGet<Group>('groups', db.groups.get(id), id).then((data) => {
      if (data) { setForm(data); setSelected(new Set(parseLoadIds(data.load_ids))); }
      setLoading(false);
    });
  }, [id]);

  const toggle = (loadId: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(loadId) ? next.delete(loadId) : next.add(loadId);
    return next;
  });

  const save = async () => {
    if (!form.name?.trim()) { Alert.alert('Name required', 'Give the group a name.'); return; }
    setSaving(true);
    const now = new Date().toISOString();
    const { error } = await db.groups.upsert({
      ...form,
      load_ids: JSON.stringify([...selected]),
      updated_at: now, created_at: form.created_at || now,
    });
    setSaving(false);
    if (error) { Alert.alert('Save failed', error.message); return; }
    router.back();
  };

  const del = () => Alert.alert('Delete Group', 'This only deletes the group, not the loads in it.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await db.groups.delete(form.id!); router.back(); } },
  ]);

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  const filtered = loads.filter(l =>
    !filter || [l.load_id, l.rifle, l.bullet, l.powder, l.lot_number].some(v => v?.toLowerCase().includes(filter.toLowerCase()))
  );

  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'New Group' : (form.name || 'Group') }} />
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content} keyboardShouldPersistTaps="handled">

        <Text style={commonStyles.label}>Group Name</Text>
        <TextInput style={commonStyles.input} value={form.name || ''} onChangeText={v => setForm(p => ({ ...p, name: v }))}
          placeholderTextColor={C.muted} placeholder="e.g. Match Loads, 25CM Development" />

        <Text style={commonStyles.label}>Notes</Text>
        <TextInput style={[commonStyles.input, styles.textarea]} value={form.notes || ''} onChangeText={v => setForm(p => ({ ...p, notes: v }))}
          placeholderTextColor={C.muted} placeholder="Notes…" multiline numberOfLines={3} />

        <View style={styles.header}>
          <Text style={commonStyles.sectionTitle}>Loads in Group</Text>
          <Text style={styles.count}>{selected.size} selected</Text>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color={C.muted} style={{ marginRight: 8 }} />
          <TextInput style={styles.search} value={filter} onChangeText={setFilter}
            placeholder="Search loads…" placeholderTextColor={C.muted} />
        </View>

        {filtered.length === 0 ? (
          <Text style={styles.empty}>{loads.length ? 'No matching loads' : 'No loads yet'}</Text>
        ) : filtered.map(l => {
          const on = selected.has(l.id);
          const sc = statusColor(l.status);
          return (
            <TouchableOpacity key={l.id} style={[styles.loadRow, on && styles.loadRowOn]} onPress={() => toggle(l.id)}>
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? C.accent : C.muted} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.loadRifle}>{l.load_id ? `${l.load_id} · ` : ''}{l.rifle}</Text>
                <Text style={styles.loadSub}>{l.bullet} {l.bullet_wt}gr · {l.powder} {l.charge}gr</Text>
              </View>
              <View style={[styles.badge, { borderColor: sc + '44', backgroundColor: sc + '22' }]}>
                <Text style={[styles.badgeText, { color: sc }]}>{l.status}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={commonStyles.primaryBtn} onPress={save} disabled={saving}>
          <Text style={commonStyles.primaryBtnText}>{saving ? 'Saving…' : 'Save Group'}</Text>
        </TouchableOpacity>
        {!isNew && (
          <TouchableOpacity style={commonStyles.dangerBtn} onPress={del}>
            <Text style={commonStyles.dangerBtnText}>Delete Group</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  textarea:   { height: 80, textAlignVertical: 'top' },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  count:      { color: C.accent, fontSize: 12, fontWeight: '700' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  search:     { flex: 1, color: C.text, fontSize: 14 },
  empty:      { color: C.muted, fontSize: 14, textAlign: 'center', marginVertical: 20 },
  loadRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 8 },
  loadRowOn:  { borderColor: C.accent, backgroundColor: C.accent + '12' },
  loadRifle:  { fontSize: 14, fontWeight: '700', color: C.text },
  loadSub:    { fontSize: 12, color: C.textSoft, marginTop: 2 },
  badge:      { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:  { fontSize: 10, fontWeight: '700' },
});
