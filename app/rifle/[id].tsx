import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { db, Rifle, uid } from '../../lib/supabase';
import { C, commonStyles } from '../../lib/theme';

const empty = (): Partial<Rifle> => ({
  id: uid(), name: '', caliber: '', barrel_len: '', twist: '',
  scope_model: '', scope_height: '', scope_unit: 'moa', muzzle_device: '', notes: '',
});

export default function RifleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const isNew   = id === 'new';
  const [form,    setForm]    = useState<Partial<Rifle>>(empty());
  const [loading, setLoading] = useState(!isNew);
  const [saving,  setSaving]  = useState(false);

  const f = (k: keyof Rifle, v: string) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (isNew) return;
    db.rifles.get(id).then(({ data }) => { if (data) setForm(data); setLoading(false); });
  }, [id]);

  const save = async () => {
    if (!form.name?.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    const now = new Date().toISOString();
    const { error } = await db.rifles.upsert({ ...form, updated_at: now, created_at: form.created_at || now });
    setSaving(false);
    if (error) { Alert.alert('Save failed', error.message); return; }
    router.back();
  };

  const del = () => Alert.alert('Delete Rifle', 'Are you sure?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await db.rifles.delete(form.id!); router.back(); } },
  ]);

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  const inp = (k: keyof Rifle, lbl: string, placeholder = '') => (
    <View key={k}>
      <Text style={commonStyles.label}>{lbl}</Text>
      <TextInput style={commonStyles.input} value={String(form[k] || '')} onChangeText={v => f(k, v)}
        placeholderTextColor={C.muted} placeholder={placeholder || lbl} />
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'New Rifle' : (form.name || 'Edit Rifle') }} />
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>
        <Text style={commonStyles.sectionTitle}>Rifle Info</Text>
        {inp('name', 'Rifle Name *')}
        {inp('caliber', 'Caliber')}
        {inp('barrel_len', 'Barrel Length (in)')}
        {inp('twist', 'Twist Rate (1:?)')}
        {inp('muzzle_device', 'Muzzle Device')}

        <Text style={commonStyles.sectionTitle}>Scope</Text>
        {inp('scope_model', 'Scope Model')}
        {inp('scope_height', 'Scope Height (in)')}
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
});
