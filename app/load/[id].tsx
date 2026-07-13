import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Switch } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { db, Load, Rifle, uid } from '../../lib/supabase';
import { C, commonStyles } from '../../lib/theme';

type CS = { id: string; date: string; temp: string; distance: string; velocity: string; sd: string; es: string; group_size: string };

const emptyLoad = (): Partial<Load> => ({
  id: uid(), date: new Date().toISOString().slice(0, 10), rifle: '', caliber: '',
  bullet: '', bullet_wt: '', bullet_bc: '', powder: '', charge: '', primer: '',
  brass: '', brass_fires: '', trim_len: '', overall_coal: '', headspace_coal: '',
  max_overall_coal: '', max_headspace_coal: '', neck_tension: '', lot_number: '',
  velocity: '', sd: '', es: '', group_size: '', distance: '', status: 'testing',
  tumbled: 0, ultrasonic: 0, fl_sized: 0, neck_sized: 0, case_trimmed: 0,
  chrono_sessions: '', notes: '',
});

export default function LoadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const isNew   = id === 'new';
  const [form,    setForm]    = useState<Partial<Load>>(emptyLoad());
  const [rifles,  setRifles]  = useState<Rifle[]>([]);
  const [cs,      setCs]      = useState<CS[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving,  setSaving]  = useState(false);

  const f = (k: keyof Load, v: any) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    db.rifles.getAll().then(({ data }) => setRifles(data || []));
    if (isNew) return;
    db.loads.get(id).then(({ data }) => {
      if (data) { setForm(data); try { setCs(data.chrono_sessions ? JSON.parse(data.chrono_sessions) : []); } catch(e) {} }
      setLoading(false);
    });
  }, [id]);

  const save = async () => {
    setSaving(true);
    const now = new Date().toISOString();
    await db.loads.upsert({ ...form, chrono_sessions: JSON.stringify(cs), updated_at: now, created_at: form.created_at || now });
    setSaving(false);
    router.back();
  };

  const del = () => Alert.alert('Delete Load', 'Are you sure?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await db.loads.delete(form.id!); router.back(); } },
  ]);

  const addCs = () => setCs(p => [...p, { id: uid(), date: new Date().toISOString().slice(0,10), temp: '', distance: '', velocity: '', sd: '', es: '', group_size: '' }]);
  const updCs = (sid: string, k: keyof CS, v: string) => setCs(p => p.map(s => s.id === sid ? { ...s, [k]: v } : s));
  const delCs = (sid: string) => setCs(p => p.filter(s => s.id !== sid));

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  const inp = (k: keyof Load, lbl: string, placeholder = '') => (
    <View key={k}>
      <Text style={commonStyles.label}>{lbl}</Text>
      <TextInput style={commonStyles.input} value={String(form[k] || '')} onChangeText={v => f(k, v)}
        placeholderTextColor={C.muted} placeholder={placeholder || lbl} keyboardType="default" />
    </View>
  );

  const tog = (k: keyof Load, lbl: string) => (
    <View key={k} style={styles.togRow}>
      <Text style={styles.togLbl}>{lbl}</Text>
      <Switch value={!!form[k]} onValueChange={v => f(k, v ? 1 : 0)} trackColor={{ true: C.accent }} thumbColor={C.white} />
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'New Load' : `${form.rifle || 'Load'} · ${form.lot_number || ''}` }} />
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>

        <Text style={commonStyles.sectionTitle}>Rifle</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {rifles.map(r => (
            <TouchableOpacity key={r.id} style={[styles.chip, form.rifle === r.name && styles.chipOn]} onPress={() => f('rifle', r.name)}>
              <Text style={[styles.chipText, form.rifle === r.name && styles.chipTextOn]}>{r.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={commonStyles.sectionTitle}>Status</Text>
        <View style={styles.statusRow}>
          {['testing', 'promising', 'proven', 'retired'].map(s => (
            <TouchableOpacity key={s} style={[styles.statusBtn, form.status === s && styles.statusBtnOn]} onPress={() => f('status', s)}>
              <Text style={[styles.statusText, form.status === s && styles.statusTextOn]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={commonStyles.sectionTitle}>Components</Text>
        {inp('caliber', 'Caliber')}
        {inp('bullet', 'Bullet')}
        {inp('bullet_wt', 'Bullet Weight (gr)')}
        {inp('bullet_bc', 'BC')}
        {inp('powder', 'Powder')}
        {inp('charge', 'Charge (gr)')}
        {inp('primer', 'Primer')}
        {inp('brass', 'Brass')}
        {inp('brass_fires', 'Fires')}
        {inp('lot_number', 'Lot Number')}

        <Text style={commonStyles.sectionTitle}>COAL</Text>
        {inp('overall_coal', 'Overall COAL (in)')}
        {inp('headspace_coal', 'Headspace COAL (in)')}
        {inp('trim_len', 'Trim Length (in)')}

        <Text style={commonStyles.sectionTitle}>Case Prep</Text>
        {tog('tumbled', 'Tumbled')}
        {tog('ultrasonic', 'Ultrasonic')}
        {tog('fl_sized', 'FL Sized')}
        {tog('neck_sized', 'Neck Sized')}
        {tog('case_trimmed', 'Case Trimmed')}

        <Text style={commonStyles.sectionTitle}>Primary Results</Text>
        {inp('velocity', 'Velocity (fps)')}
        {inp('sd', 'SD')}
        {inp('es', 'ES')}
        {inp('group_size', 'Group Size (in)')}
        {inp('distance', 'Distance (yd)')}

        <View style={styles.csHeader}>
          <Text style={commonStyles.sectionTitle}>Chrono Sessions</Text>
          <TouchableOpacity style={styles.addBtn} onPress={addCs}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>
        {cs.map((s, i) => (
          <View key={s.id} style={styles.csCard}>
            <View style={styles.csTitleRow}>
              <Text style={styles.csTitle}>Session {i + 1}{s.distance ? ` — ${s.distance}yd` : ''}</Text>
              <TouchableOpacity onPress={() => delCs(s.id)}><Text style={styles.csDelete}>✕</Text></TouchableOpacity>
            </View>
            {(['date', 'temp', 'distance', 'velocity', 'sd', 'es', 'group_size'] as (keyof CS)[]).map(k => (
              <View key={k}>
                <Text style={commonStyles.label}>{k.replace('_', ' ')}</Text>
                <TextInput style={commonStyles.input} value={s[k]} onChangeText={v => updCs(s.id, k, v)}
                  placeholderTextColor={C.muted} placeholder={k} />
              </View>
            ))}
          </View>
        ))}

        <Text style={commonStyles.sectionTitle}>Notes</Text>
        <TextInput style={[commonStyles.input, styles.textarea]} value={form.notes || ''} onChangeText={v => f('notes', v)}
          placeholderTextColor={C.muted} placeholder="Notes…" multiline numberOfLines={4} />

        <TouchableOpacity style={commonStyles.primaryBtn} onPress={save} disabled={saving}>
          <Text style={commonStyles.primaryBtnText}>{saving ? 'Saving…' : 'Save Load'}</Text>
        </TouchableOpacity>
        {!isNew && (
          <TouchableOpacity style={commonStyles.dangerBtn} onPress={del}>
            <Text style={commonStyles.dangerBtnText}>Delete Load</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  chipScroll:   { marginBottom: 12 },
  chip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, marginRight: 8 },
  chipOn:       { backgroundColor: C.accent + '22', borderColor: C.accent },
  chipText:     { color: C.muted, fontSize: 13, fontWeight: '600' },
  chipTextOn:   { color: C.accent },
  statusRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statusBtn:    { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  statusBtnOn:  { backgroundColor: C.accent + '22', borderColor: C.accent },
  statusText:   { color: C.muted, fontSize: 12, fontWeight: '600' },
  statusTextOn: { color: C.accent },
  togRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  togLbl:       { color: C.text, fontSize: 14 },
  csHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addBtn:       { backgroundColor: C.green + '22', borderWidth: 1, borderColor: C.green, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 5 },
  addBtnText:   { color: C.green, fontSize: 12, fontWeight: '700' },
  csCard:       { backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.borderHi, padding: 12, marginBottom: 10 },
  csTitleRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  csTitle:      { fontSize: 13, fontWeight: '700', color: C.accent },
  csDelete:     { color: C.red, fontSize: 16, fontWeight: '700' },
  textarea:     { height: 100, textAlignVertical: 'top' },
});
