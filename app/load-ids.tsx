// One-time switch to per-rifle load IDs. Shows every change before applying,
// keeps old IDs and lot numbers on each load, and links loads to rifles by ID.
import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { db, Load, Rifle } from '../lib/supabase';
import { C, commonStyles } from '../lib/theme';
import { allIds, assignCodes, cleanCode, planUpgrade } from '../lib/loadIds';

export default function LoadIdUpgrade() {
  const router = useRouter();
  const [rifles,  setRifles]  = useState<Rifle[]>([]);
  const [loads,   setLoads]   = useState<Load[]>([]);
  const [codes,   setCodes]   = useState<Record<string, string>>({});
  const [assign,  setAssign]  = useState<Record<string, string>>({}); // load.id → rifle.id for unlinked loads
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [done,    setDone]    = useState<string | null>(null);

  const fetchAll = async () => {
    const [r, l] = await Promise.all([db.rifles.getAll(), db.loads.getAll()]);
    const rs: Rifle[] = r.data || [];
    setRifles(rs);
    setLoads(l.data || []);
    setCodes(assignCodes(rs));
    setAssign({});
    setLoading(false);
  };
  useEffect(() => { fetchAll(); }, []);

  const effective = useMemo(() => loads.map(l => {
    const r = assign[l.id] ? rifles.find(x => x.id === assign[l.id]) : undefined;
    return r ? { ...l, rifle: r.name, rifle_id: r.id } : l;
  }), [loads, assign, rifles]);
  const plan = useMemo(() => planUpgrade(rifles, effective, codes), [rifles, effective, codes]);

  const dupCodes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const g of plan.groups) seen.set(g.code, (seen.get(g.code) ?? 0) + 1);
    return [...seen.entries()].filter(([, n]) => n > 1).map(([c]) => c);
  }, [plan]);

  const linkCount = plan.groups.reduce((n, g) => n + g.items.filter(it => {
    const orig = loads.find(l => l.id === it.load.id);
    return orig && orig.rifle_id !== g.rifle.id;
  }).length, 0);

  const apply = async () => {
    if (dupCodes.length) { Alert.alert('Duplicate code', `${dupCodes.join(', ')} is used by more than one rifle.`); return; }
    setBusy(true);
    let renumbered = 0, linked = 0, failed = 0;
    let firstError = '';
    const fail = (msg: string) => { failed++; if (!firstError) firstError = msg; };

    for (const r of rifles) {
      const code = cleanCode(codes[r.id] || '');
      if (code && code !== cleanCode(r.code || '')) {
        const { error } = await db.rifles.update(r.id, { code });
        if (error) fail(error.message);
      }
    }
    for (const g of plan.groups) {
      for (const it of g.items) {
        const orig = loads.find(l => l.id === it.load.id);
        const patch: Partial<Load> = {};
        if (!it.keep) { patch.load_id = it.newId; patch.legacy_ids = JSON.stringify(it.oldIds); }
        if (!orig || orig.rifle_id !== g.rifle.id || orig.rifle !== g.rifle.name) { patch.rifle_id = g.rifle.id; patch.rifle = g.rifle.name; }
        if (Object.keys(patch).length === 0) continue;
        const { error } = await db.loads.update(it.load.id, patch);
        if (error) fail(error.message);
        else if (!it.keep) renumbered++;
        else linked++;
      }
    }
    setBusy(false);
    if (failed) {
      const hint = /column/i.test(firstError) ? '\n\nRun supabase-migration-ids-ballistics.sql in the Supabase SQL editor first.' : '';
      Alert.alert(`${failed} update${failed > 1 ? 's' : ''} failed`, firstError + hint);
    }
    setDone(`${renumbered} load${renumbered === 1 ? '' : 's'} renumbered${linked ? `, ${linked} linked to their rifle` : ''}.`);
    fetchAll();
  };

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  return (
    <>
      <Stack.Screen options={{ title: 'Upgrade Load IDs' }} />
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>
        <Text style={styles.intro}>
          Each rifle gets a short code, and its loads are numbered in date order: 25CM-001, 25CM-002 and so on.
          Old IDs and lot numbers stay on each load and still work in search and Garmin imports.
          Name Xero sessions with the new ID and imports land on the right load.
        </Text>

        {done && <View style={styles.doneCard}><Text style={styles.doneText}>{done}</Text></View>}

        {plan.unlinked.length > 0 && (
          <>
            <Text style={commonStyles.sectionTitle}>Loads without a rifle</Text>
            <Text style={styles.sub}>Pick the rifle each one belongs to, or leave it for later.</Text>
            {plan.unlinked.map(l => (
              <View key={l.id} style={styles.card}>
                <Text style={styles.oldId}>{allIds(l)[0] || l.bullet || 'Unnamed load'}</Text>
                <Text style={styles.sub}>{[l.rifle && `rifle "${l.rifle}"`, l.bullet, l.powder].filter(Boolean).join(' · ')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {rifles.map(r => (
                    <TouchableOpacity key={r.id} style={[styles.chip, assign[l.id] === r.id && styles.chipOn]}
                      onPress={() => setAssign(p => ({ ...p, [l.id]: r.id }))}>
                      <Text style={[styles.chipText, assign[l.id] === r.id && styles.chipTextOn]}>{r.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ))}
          </>
        )}

        {plan.groups.map(g => (
          <View key={g.rifle.id}>
            <View style={styles.groupHead}>
              <Text style={[commonStyles.sectionTitle, { flex: 1 }]}>{g.rifle.name}</Text>
              <TextInput
                style={[styles.codeInput, dupCodes.includes(g.code) && { borderColor: C.red }]}
                value={codes[g.rifle.id] ?? g.code}
                onChangeText={v => setCodes(p => ({ ...p, [g.rifle.id]: cleanCode(v) }))}
                autoCapitalize="characters" autoCorrect={false}
              />
            </View>
            {g.items.map(it => (
              <View key={it.load.id} style={styles.itemRow}>
                <Text style={[styles.oldId, it.keep && { color: C.muted }]} numberOfLines={1}>
                  {it.keep ? 'unchanged' : (it.oldIds.join(', ') || 'no ID')}
                </Text>
                <Text style={styles.arrow}>→</Text>
                <Text style={[styles.newId, it.keep && { color: C.muted }]}>{it.newId}</Text>
              </View>
            ))}
          </View>
        ))}

        {plan.groups.length === 0 && plan.unlinked.length === 0 && <Text style={styles.sub}>No loads yet.</Text>}

        <TouchableOpacity
          style={[commonStyles.primaryBtn, (busy || (plan.pending === 0 && linkCount === 0)) && { opacity: 0.5 }]}
          onPress={apply} disabled={busy || (plan.pending === 0 && linkCount === 0)}>
          <Text style={commonStyles.primaryBtnText}>
            {busy ? 'Applying…' : plan.pending ? `Apply ${plan.pending} new ID${plan.pending > 1 ? 's' : ''}` : linkCount ? 'Link loads to rifles' : 'All loads are up to date'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>Back to reloads</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  intro:      { color: C.textSoft, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  sub:        { color: C.muted, fontSize: 12, marginBottom: 6 },
  doneCard:   { backgroundColor: C.green + '18', borderWidth: 1, borderColor: C.green + '55', borderRadius: 8, padding: 12, marginVertical: 8 },
  doneText:   { color: C.text, fontSize: 13 },
  card:       { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 11, marginBottom: 8 },
  groupHead:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  codeInput:  { marginTop: 8, minWidth: 90, textAlign: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderHi, borderRadius: 6, color: C.accent, fontWeight: '800', fontSize: 15, paddingVertical: 6, paddingHorizontal: 10 },
  itemRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border },
  oldId:      { flex: 1, color: C.textSoft, fontSize: 13 },
  arrow:      { color: C.muted, fontSize: 13 },
  newId:      { color: C.text, fontSize: 14, fontWeight: '800', minWidth: 90, textAlign: 'right' },
  chip:       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, marginRight: 8 },
  chipOn:     { backgroundColor: C.accent + '22', borderColor: C.accent },
  chipText:   { color: C.muted, fontSize: 12, fontWeight: '600' },
  chipTextOn: { color: C.accent },
  backBtn:    { padding: 14, alignItems: 'center' },
  backText:   { color: C.accent, fontWeight: '700', fontSize: 15 },
});
