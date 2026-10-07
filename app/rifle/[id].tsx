import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { db, supabase, Rifle, Load, uid } from '../../lib/supabase';
import { C, commonStyles, statusColor } from '../../lib/theme';
import { cachedGet, cachedList } from '../../lib/cache';
import { assignCodes, belongsTo, cleanCode, parseLoadId } from '../../lib/loadIds';
import { performance } from '../../lib/recommend';

const empty = (): Partial<Rifle> => ({
  id: uid(), name: '', caliber: '', barrel_len: '', twist: '',
  scope_model: '', scope_height: '', scope_unit: 'moa', muzzle_device: '', notes: '',
  code: '', zero_range: '100',
});

export default function RifleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const isNew   = id === 'new';
  const [form,     setForm]     = useState<Partial<Rifle>>(empty());
  const [original, setOriginal] = useState<Rifle | null>(null);
  const [rifles,   setRifles]   = useState<Rifle[]>([]);
  const [loads,    setLoads]    = useState<Load[]>([]);
  const [loading,  setLoading]  = useState(!isNew);
  const [saving,   setSaving]   = useState(false);

  const f = (k: keyof Rifle, v: string) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (isNew) return;
    cachedGet<Rifle>('rifles', db.rifles.get(id), id).then((data) => {
      if (data) { setForm(data); setOriginal(data); }
      setLoading(false);
    });
  }, [id]);

  // refresh the load list when coming back from a load
  useFocusEffect(useCallback(() => {
    Promise.all([
      cachedList<Rifle>('rifles', db.rifles.getAll()),
      cachedList<Load>('loads', db.loads.getAll()),
    ]).then(([r, l]) => { setRifles(r); setLoads(l); });
  }, []));

  const suggested = useMemo(() => {
    const others = rifles.filter(r => r.id !== form.id);
    return assignCodes([...others, { ...(form as Rifle), code: '' }])[form.id!] || 'R';
  }, [rifles, form.id, form.name, form.caliber]);
  const code = cleanCode(form.code || '') || suggested;

  const myLoads = useMemo(() => isNew ? [] : loads
    .filter(l => belongsTo(l, { ...(original ?? form), id: form.id } as Rifle))
    .sort((a, b) => (parseLoadId(b.load_id)?.seq ?? 0) - (parseLoadId(a.load_id)?.seq ?? 0)), [loads, original, form.id, isNew]);

  const save = async () => {
    if (!form.name?.trim()) { Alert.alert('Name required'); return; }
    const clash = rifles.find(r => r.id !== form.id && cleanCode(r.code || '') === code);
    if (clash) { Alert.alert('Code already used', `${clash.name} already uses ${code}. Pick another so load IDs stay unique.`); return; }
    setSaving(true);
    const now = new Date().toISOString();
    const { error } = await db.rifles.upsert({ ...form, code, updated_at: now, created_at: form.created_at || now });
    if (!error && original && original.name !== form.name) {
      // keep loads and sessions attached after a rename
      await supabase.from('loads').update({ rifle: form.name, rifle_id: original.id }).eq('rifle', original.name);
      await supabase.from('loads').update({ rifle: form.name }).eq('rifle_id', original.id);
      await supabase.from('sessions').update({ rifle: form.name, rifle_id: original.id }).eq('rifle', original.name);
      await supabase.from('sessions').update({ rifle: form.name }).eq('rifle_id', original.id);
    }
    setSaving(false);
    if (error) {
      const hint = /column/i.test(error.message)
        ? '\n\nRun supabase-migration-ids-ballistics.sql in the Supabase SQL editor, then try again.' : '';
      Alert.alert('Save failed', error.message + hint);
      return;
    }
    router.back();
  };

  const del = () => Alert.alert('Delete Rifle', myLoads.length ? `Its ${myLoads.length} loads stay, but lose their rifle link.` : 'Are you sure?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await db.rifles.delete(form.id!); router.back(); } },
  ]);

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  const inp = (k: keyof Rifle, lbl: string, placeholder = '', keyboard: 'default' | 'decimal-pad' = 'default') => (
    <View key={k}>
      <Text style={commonStyles.label}>{lbl}</Text>
      <TextInput style={commonStyles.input} value={String(form[k] || '')} onChangeText={v => f(k, v)}
        placeholderTextColor={C.muted} placeholder={placeholder || lbl} keyboardType={keyboard} />
    </View>
  );

  const codeChanged = !!original && cleanCode(original.code || '') !== '' && cleanCode(original.code || '') !== code;

  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'New Rifle' : (form.name || 'Edit Rifle') }} />
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>
        {!isNew && (
          <>
            <View style={styles.loadsHead}>
              <Text style={[commonStyles.sectionTitle, { flex: 1 }]}>Loads ({myLoads.length})</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => router.push(`/load/new?rifle=${form.id}` as any)}>
                <Text style={styles.addBtnText}>+ New load</Text>
              </TouchableOpacity>
            </View>
            {myLoads.length === 0 && <Text style={styles.emptyLoads}>No loads yet. New loads here are numbered {code}-001, {code}-002…</Text>}
            {myLoads.map(l => (
              <TouchableOpacity key={l.id} style={styles.loadRow} onPress={() => router.push(`/load/${l.id}` as any)}>
                <View style={[styles.dot, { backgroundColor: statusColor(l.status) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.loadId}>{l.load_id || 'No ID yet'}</Text>
                  <Text style={styles.loadSub} numberOfLines={1}>
                    {[l.bullet && `${l.bullet} ${l.bullet_wt}gr`, l.powder && `${l.powder} ${l.charge}gr`].filter(Boolean).join(' · ') || '—'}
                  </Text>
                  {performance(l) !== '' && <Text style={styles.loadPerf}>{performance(l)}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.muted} />
              </TouchableOpacity>
            ))}
          </>
        )}

        <Text style={commonStyles.sectionTitle}>Rifle Info</Text>
        {inp('name', 'Rifle Name *')}
        {inp('caliber', 'Caliber')}
        <Text style={commonStyles.label}>Load ID code</Text>
        <TextInput style={commonStyles.input} value={form.code || ''} onChangeText={v => f('code', cleanCode(v))}
          placeholder={suggested} placeholderTextColor={C.muted} autoCapitalize="characters" autoCorrect={false} />
        <Text style={styles.hint}>
          Loads for this rifle are numbered {code}-001, {code}-002…
          {codeChanged ? ' Existing loads keep their IDs until you renumber them from Reloads.' : ''}
        </Text>
        {inp('barrel_len', 'Barrel Length (in)', '', 'decimal-pad')}
        {inp('twist', 'Twist Rate (1:?)', 'e.g. 1:8 (add LH for left-hand)')}
        {inp('muzzle_device', 'Muzzle Device')}

        <Text style={commonStyles.sectionTitle}>Scope</Text>
        {inp('scope_model', 'Scope Model')}
        {inp('scope_height', 'Scope Height (in)', 'Center of bore to center of scope', 'decimal-pad')}
        {inp('zero_range', 'Zero Distance (yd)', '100', 'decimal-pad')}
        <Text style={commonStyles.label}>Adjustment Unit</Text>
        <View style={styles.row}>
          {(['moa', 'mrad'] as const).map(u => (
            <TouchableOpacity key={u} style={[styles.toggle, form.scope_unit === u && styles.toggleOn]} onPress={() => f('scope_unit', u)}>
              <Text style={[styles.toggleText, form.scope_unit === u && styles.toggleTextOn]}>{u.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={commonStyles.sectionTitle}>Notes</Text>
        <TextInput style={[commonStyles.input, styles.textarea]} value={form.notes || ''} onChangeText={v => f('notes', v)}
          placeholderTextColor={C.muted} placeholder="Notes…" multiline numberOfLines={4} />

        <TouchableOpacity style={commonStyles.primaryBtn} onPress={save} disabled={saving}>
          <Text style={commonStyles.primaryBtnText}>{saving ? 'Saving…' : 'Save Rifle'}</Text>
        </TouchableOpacity>
        {!isNew && (
          <TouchableOpacity style={commonStyles.dangerBtn} onPress={del}>
            <Text style={commonStyles.dangerBtnText}>Delete Rifle</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  row:          { flexDirection: 'row', gap: 8, marginBottom: 12 },
  toggle:       { flex: 1, padding: 10, borderRadius: 6, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center' },
  toggleOn:     { backgroundColor: C.accent + '22', borderColor: C.accent },
  toggleText:   { color: C.muted, fontWeight: '600' },
  toggleTextOn: { color: C.accent },
  textarea:     { height: 100, textAlignVertical: 'top' },
  hint:         { color: C.muted, fontSize: 11, marginTop: -6, marginBottom: 12 },
  loadsHead:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addBtn:       { backgroundColor: C.green + '22', borderWidth: 1, borderColor: C.green, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 5, marginTop: 8 },
  addBtnText:   { color: C.green, fontSize: 12, fontWeight: '700' },
  emptyLoads:   { color: C.muted, fontSize: 13, marginBottom: 8 },
  loadRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 11, marginBottom: 8 },
  dot:          { width: 8, height: 8, borderRadius: 4 },
  loadId:       { color: C.text, fontSize: 15, fontWeight: '800' },
  loadSub:      { color: C.textSoft, fontSize: 12, marginTop: 1 },
  loadPerf:     { color: C.green, fontSize: 12, marginTop: 1 },
});
