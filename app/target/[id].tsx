// Group analyzer: tap where each shot hit. Mean radius uses every shot, so it
// compares loads with fewer shots than extreme spread; both are shown.
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { db, Load, Rifle, uid } from '../../lib/supabase';
import { cachedGet, cachedList } from '../../lib/cache';
import { C, Type, commonStyles, F } from '../../lib/theme';
import { Button, Chips, EmptyState, HeaderButton, InputItem, Item, Note, Section, StatStrip, ToggleItem } from '../../components/Form';
import { TargetPlot } from '../../components/Visuals';
import { rifleOf } from '../../lib/loadIds';
import { num, scopeUnit } from '../../lib/ballisticProfile';
import { fromMil } from '../../lib/ballistics/truing';
import { PlottedGroup, Shot, groupStats, inchesToMoa, sampleNote } from '../../lib/groups';

const SCALES = [{ key: '1', label: '2" view' }, { key: '2', label: '4" view' }, { key: '4', label: '8" view' }, { key: '8', label: '16" view' }];

export default function TargetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [load,      setLoad]      = useState<Load | null>(null);
  const [rifles,    setRifles]    = useState<Rifle[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [shots,     setShots]     = useState<Shot[]>([]);
  const [half,      setHalf]      = useState('2');
  const [distance,  setDistance]  = useState('100');
  const [setResult, setSetResult] = useState(true);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    (async () => {
      const [l, rs] = await Promise.all([
        cachedGet<Load>('loads', db.loads.get(id), id),
        cachedList<Rifle>('rifles', db.rifles.getAll()),
      ]);
      setLoad(l);
      setRifles(rs);
      if (l?.distance) setDistance(l.distance);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;
  if (!load) return <EmptyState icon="alert-circle-outline" title="Load not found" />;

  const unit = scopeUnit(rifleOf(load, rifles));
  const stats = groupStats(shots);
  const dist = num(distance) ?? 100;
  const moa = (inches: number) => inchesToMoa(inches, dist);
  const note = sampleNote(shots.length);
  const corr = (inches: number) => fromMil(-inches / (dist * 0.036), unit); // inches at range → dial

  const save = async () => {
    if (!stats || stats.n < 2) return;
    setSaving(true);
    let raw: Record<string, unknown> = {};
    try { raw = load.ballistics ? JSON.parse(load.ballistics) : {}; } catch { raw = {}; }
    const group: PlottedGroup = { id: uid(), date: new Date().toISOString().slice(0, 10), distanceYd: dist, shots };
    const groups = Array.isArray(raw.groups) ? (raw.groups as PlottedGroup[]) : [];
    const patch: Partial<Load> = { ballistics: JSON.stringify({ ...raw, groups: [...groups, group] }) };
    if (setResult) { patch.group_size = stats.es.toFixed(2); patch.distance = String(dist); }
    const { error } = await db.loads.update(load.id, patch);
    setSaving(false);
    if (error) {
      Alert.alert('Save failed', error.message + (/column/i.test(error.message) ? '\n\nRun supabase-migration-ids-ballistics.sql first.' : ''));
      return;
    }
    router.back();
  };

  const u = unit === 'mil' ? 'mil' : 'MOA';
  const dialText = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(unit === 'mil' ? 1 : 2)} ${u} ${v >= 0 ? pos : neg}`;

  return (
    <>
      <Stack.Screen options={{ title: 'Plot a group', headerRight: () => <HeaderButton label="Save" disabled={saving || !stats || stats.n < 2} onPress={save} /> }} />
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>
        <Text style={[Type.sub, { marginBottom: 12 }]}>
          {`${load.load_id || 'Load'}: tap each bullet hole where it hit. The orange cross is your aim point.`}
        </Text>
        <Chips items={SCALES} selected={half} onSelect={setHalf} />
        <TargetPlot shots={shots} halfIn={Number(half)} onAdd={s => setShots(p => [...p, s])} />
        <View style={st.actions}>
          <TouchableOpacity style={st.action} disabled={!shots.length} onPress={() => setShots(p => p.slice(0, -1))}>
            <Ionicons name="arrow-undo-outline" size={16} color={shots.length ? C.accent : C.muted} />
            <Text style={[st.actionText, !shots.length && { color: C.muted }]}>Undo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.action} disabled={!shots.length} onPress={() => setShots([])}>
            <Ionicons name="trash-outline" size={16} color={shots.length ? C.red : C.muted} />
            <Text style={[st.actionText, { color: shots.length ? C.red : C.muted }]}>Clear</Text>
          </TouchableOpacity>
          <Text style={st.count}>{`${shots.length} shot${shots.length === 1 ? '' : 's'}`}</Text>
        </View>

        {stats && stats.n >= 2 && (
          <>
            <StatStrip items={[
              { label: 'Mean radius', value: moa(stats.mr).toFixed(2), sub: `MOA · ${stats.mr.toFixed(2)}"` },
              { label: 'Group (ES)', value: moa(stats.es).toFixed(2), sub: `MOA · ${stats.es.toFixed(2)}"` },
              { label: 'ES ÷ MR', value: (stats.es / Math.max(stats.mr, 1e-6)).toFixed(1), sub: 'about 2.7 is typical' },
            ]} />
            <Section title="Shape and center" footer="Dashed circle is the mean radius around the group center (blue cross). Red line joins the two widest shots.">
              <Item label="Vertical spread (SD)" value={`${stats.sdy.toFixed(2)}" · ${moa(stats.sdy).toFixed(2)} MOA`} />
              <Item label="Horizontal spread (SD)" value={`${stats.sdx.toFixed(2)}" · ${moa(stats.sdx).toFixed(2)} MOA`} />
              <Item label="Center vs aim" value={`${Math.abs(stats.cy).toFixed(2)}" ${stats.cy >= 0 ? 'high' : 'low'}, ${Math.abs(stats.cx).toFixed(2)}" ${stats.cx >= 0 ? 'right' : 'left'}`} />
              <Item label="To center it, dial" value={`${dialText(corr(stats.cy), 'up', 'down')}, ${dialText(corr(stats.cx), 'right', 'left')}`} />
            </Section>
          </>
        )}

        <View style={{ marginTop: 14 }}><Note tone={note.tone}>{note.text}</Note></View>

        <Section title="Group">
          <InputItem label="Distance" value={distance} onChange={setDistance} unit="yd" keyboard="number-pad" />
          <ToggleItem label="Use as this load's group result" value={setResult} onChange={setSetResult} />
        </Section>

        <Button label={saving ? 'Saving…' : 'Save group'} onPress={save} disabled={saving || !stats || stats.n < 2} />
      </ScrollView>
    </>
  );
}

const st = StyleSheet.create({
  actions:    { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 12, marginBottom: 6 },
  action:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { color: C.accent, fontSize: 15, fontFamily: F.semibold },
  count:      { fontFamily: F.regular, marginLeft: 'auto', color: C.textSoft, fontSize: 14, fontVariant: ['tabular-nums'] },
});
