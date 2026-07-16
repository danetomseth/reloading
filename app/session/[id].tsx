import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { db, Session, Rifle, Load, uid } from '../../lib/supabase';
import { C, commonStyles } from '../../lib/theme';

type RangeRow = { id: string; range: string; calc_drop: string; obs_drop: string; wind: string; windage_hold: string };

const emptySession = (): Partial<Session> => ({
  id: uid(), date: new Date().toISOString().slice(0, 10), rifle: '', load_id: '',
  location: '', distance: '', temp: '', humidity: '', pressure: '', density_alt: '',
  wind_speed: '', wind_dir: '', altitude: '', scope_adj: '', clicks_up: '',
  clicks_right: '', group_size: '', rounds_fired: '', ranges: '', notes: '',
});

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const isNew   = id === 'new';
  const [form,    setForm]    = useState<Partial<Session>>(emptySession());
  const [rifles,  setRifles]  = useState<Rifle[]>([]);
  const [loads,   setLoads]   = useState<Load[]>([]);
  const [ranges,  setRanges]  = useState<RangeRow[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving,  setSaving]  = useState(false);

  const f = (k: keyof Session, v: string) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    db.rifles.getAll().then(({ data }) => setRifles(data || []));
    db.loads.getAll().then(({ data }) => setLoads(data || []));
    if (isNew) return;
    db.sessions.get(id).then(({ data }) => {
      if (data) { setForm(data); try { setRanges(data.ranges ? JSON.parse(data.ranges) : []); } catch(e) {} }
      setLoading(false);
    });
  }, [id]);

  const addRange = () => setRanges(p => [...p, { id: uid(), range: '', calc_drop: '', obs_drop: '', wind: '', windage_hold: '' }]);
  const updRange = (rid: string, k: keyof RangeRow, v: string) => setRanges(p => p.map(r => r.id === rid ? { ...r, [k]: v } : r));
  const delRange = (rid: string) => setRanges(p => p.filter(r => r.id !== rid));

  const save = async () => {
    setSaving(true);
    const now = new Date().toISOString();
    const { error } = await db.sessions.upsert({ ...form, ranges: JSON.stringify(ranges), updated_at: now, created_at: form.created_at || now });
    setSaving(false);
    if (error) { Alert.alert('Save failed', error.message); return; }
    router.back();
  };

  const del = () => Alert.alert('Delete Session', 'Are you sure?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await db.sessions.delete(form.id!); router.back(); } },
  ]);

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  const inp = (k: keyof Session, lbl: string, placeholder = '') => (
    <View key={k}>
      <Text style={commonStyles.label}>{lbl}</Text>
      <TextInput style={commonStyles.input} value={String(form[k] || '')} onChangeText={v => f(k, v)}
        placeholderTextColor={C.muted} placeholder={placeholder || lbl} />
    </View>
  );

  const rifleLoads = loads.filter(l => l.rifle === form.rifle);

  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'New Session' : `${form.rifle || 'Session'} · ${form.date?.slice(0, 10) || ''}` }} />
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>

        <Text style={commonStyles.sectionTitle}>Rifle</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {rifles.map(r => (
            <TouchableOpacity key={r.id} style={[styles.chip, form.rifle === r.name && styles.chipOn]} onPress={() => f('rifle', r.name)}>
              <Text style={[styles.chipText, form.rifle === r.name && styles.chipTextOn]}>{r.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {rifleLoads.length > 0 && (
          <>
            <Text style={commonStyles.sectionTitle}>Load</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {rifleLoads.map(l => (
                <TouchableOpacity key={l.id} style={[styles.chip, form.load_id === l.id && styles.chipOn]} onPress={() => f('load_id', l.id)}>
                  <Text style={[styles.chipText, form.load_id === l.id && styles.chipTextOn]}>
                    {l.lot_number ? `LOT ${l.lot_number}` : `${l.bullet} ${l.bullet_wt}gr`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <Text style={commonStyles.sectionTitle}>Session Info</Text>
        {inp('date', 'Date')}
        {inp('location', 'Location')}
        {inp('distance', 'Distance (yd)')}
        {inp('rounds_fired', 'Rounds Fired')}

        <Text style={commonStyles.sectionTitle}>Environmental</Text>
        {inp('temp', 'Temperature (°F)')}
        {inp('humidity', 'Humidity (%)')}
        {inp('pressure', 'Pressure (inHg)')}
        {inp('altitude', 'Altitude (ft)')}
        {inp('density_alt', 'Density Altitude (ft)')}
        {inp('wind_speed', 'Wind Speed (mph)')}
        {inp('wind_dir', 'Wind Direction')}

        <Text style={commonStyles.sectionTitle}>Scope Adjustments</Text>
        {inp('clicks_up', 'Clicks Up')}
        {inp('clicks_right', 'Clicks Right')}
        {inp('scope_adj', 'Scope Notes')}

        <View style={styles.rangeHeader}>
          <Text style={commonStyles.sectionTitle}>Ranges</Text>
          <TouchableOpacity style={styles.addBtn} onPress={addRange}>
            <Text style={styles.addBtnText}>+ Add Range</Text>
          </TouchableOpacity>
        </View>
        {ranges.map((r, i) => (
          <View key={r.id} style={styles.rangeCard}>
            <View style={styles.rangeTitleRow}>
              <Text style={styles.rangeTitle}>Range {i + 1}{r.range ? ` — ${r.range} yd` : ''}</Text>
              <TouchableOpacity onPress={() => delRange(r.id)}><Text style={styles.rangeDel}>✕</Text></TouchableOpacity>
            </View>
            <Text style={commonStyles.label}>Range (yd)</Text>
            <TextInput style={commonStyles.input} value={r.range} onChangeText={v => updRange(r.id, 'range', v)}
              placeholder="Range (yd)" placeholderTextColor={C.muted} keyboardType="number-pad" />
            <View style={styles.rangeGrid}>
              <View style={styles.rangeCol}>
                <Text style={commonStyles.label}>Calc Drop</Text>
                <TextInput style={commonStyles.input} value={r.calc_drop} onChangeText={v => updRange(r.id, 'calc_drop', v)}
                  placeholder="Calculated" placeholderTextColor={C.muted} />
              </View>
              <View style={styles.rangeCol}>
                <Text style={commonStyles.label}>Observed Drop</Text>
                <TextInput style={commonStyles.input} value={r.obs_drop} onChangeText={v => updRange(r.id, 'obs_drop', v)}
                  placeholder="Observed" placeholderTextColor={C.muted} />
              </View>
            </View>
            <View style={styles.rangeGrid}>
              <View style={styles.rangeCol}>
                <Text style={commonStyles.label}>Wind</Text>
                <TextInput style={commonStyles.input} value={r.wind} onChangeText={v => updRange(r.id, 'wind', v)}
                  placeholder="Wind" placeholderTextColor={C.muted} />
              </View>
              <View style={styles.rangeCol}>
                <Text style={commonStyles.label}>Windage Hold</Text>
                <TextInput style={commonStyles.input} value={r.windage_hold} onChangeText={v => updRange(r.id, 'windage_hold', v)}
                  placeholder="Windage" placeholderTextColor={C.muted} />
              </View>
            </View>
          </View>
        ))}

        <Text style={commonStyles.sectionTitle}>Results</Text>
        {inp('group_size', 'Group Size (in)')}

        <Text style={commonStyles.sectionTitle}>Notes</Text>
        <TextInput style={[commonStyles.input, styles.textarea]} value={form.notes || ''} onChangeText={v => f('notes', v)}
          placeholderTextColor={C.muted} placeholder="Notes…" multiline numberOfLines={4} />

        <TouchableOpacity style={commonStyles.primaryBtn} onPress={save} disabled={saving}>
          <Text style={commonStyles.primaryBtnText}>{saving ? 'Saving…' : 'Save Session'}</Text>
        </TouchableOpacity>
        {!isNew && (
          <TouchableOpacity style={commonStyles.dangerBtn} onPress={del}>
            <Text style={commonStyles.dangerBtnText}>Delete Session</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  chipScroll:  { marginBottom: 12 },
  chip:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, marginRight: 8 },
  chipOn:      { backgroundColor: C.accent + '22', borderColor: C.accent },
  chipText:    { color: C.muted, fontSize: 13, fontWeight: '600' },
  chipTextOn:  { color: C.accent },
  textarea:    { height: 100, textAlignVertical: 'top' },
  rangeHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addBtn:        { backgroundColor: C.green + '22', borderWidth: 1, borderColor: C.green, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 5 },
  addBtnText:    { color: C.green, fontSize: 12, fontWeight: '700' },
  rangeCard:     { backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.borderHi, padding: 12, marginBottom: 10, marginTop: 8 },
  rangeTitleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  rangeTitle:    { fontSize: 13, fontWeight: '700', color: C.accent },
  rangeDel:      { color: C.red, fontSize: 16, fontWeight: '700' },
  rangeGrid:     { flexDirection: 'row', gap: 10 },
  rangeCol:      { flex: 1 },
});
