import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet, ActivityIndicator, Alert, DevSettings } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { db, supabase, Rifle, Load, Session } from '../../lib/supabase';
import { cachedList } from '../../lib/cache';
import { C, Type, commonStyles, statusColor, F, isDark, saveThemeMode, ThemeMode } from '../../lib/theme';
import { IconName, Item, Section } from '../../components/Form';
import { assignCodes, belongsTo, planUpgrade, rifleOf } from '../../lib/loadIds';
import { headline, monthlyTotals, pickBest, recipe, shortDate } from '../../lib/metrics';
import { setMode } from '../../lib/mode';
import { num } from '../../lib/ballisticProfile';
import { ColumnChart } from '../../components/Chart';

const signOut = () => Alert.alert('Sign out', 'Sign out of your account?', [
  { text: 'Cancel', style: 'cancel' },
  { text: 'Sign out', style: 'destructive', onPress: () => { supabase.auth.signOut(); } },
]);

// styles are built at launch, so restart to switch
const applyTheme = async (m: ThemeMode) => {
  saveThemeMode(m);
  try { await require('expo-updates').reloadAsync(); }
  catch {
    try { DevSettings.reload(); }
    catch { Alert.alert('Restart to apply', 'Close and reopen the app to switch appearance.'); }
  }
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rifles,   setRifles]   = useState<Rifle[]>([]);
  const [loads,    setLoads]    = useState<Load[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refresh,  setRefresh]  = useState(false);

  const fetchAll = useCallback(async () => {
    const [r, l, s] = await Promise.all([
      cachedList<Rifle>('rifles', db.rifles.getAll()),
      cachedList<Load>('loads', db.loads.getAll()),
      cachedList<Session>('sessions', db.sessions.getAll()),
    ]);
    setRifles(r);
    setLoads(l);
    setSessions(s);
    setLoading(false);
    setRefresh(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const plan = useMemo(() => planUpgrade(rifles, loads, assignCodes(rifles)), [rifles, loads]);
  const best = useMemo(() => rifles.map(r => {
    const mine = loads.filter(l => belongsTo(l, r));
    return { rifle: r, count: mine.length, load: pickBest(mine) };
  }), [rifles, loads]);
  const activity = useMemo(() => {
    const rounds = monthlyTotals(sessions, s => s.date, s => num(s.rounds_fired) ?? 0);
    const anyRounds = rounds.some(m => m.value > 0);
    return { anyRounds, months: anyRounds ? rounds : monthlyTotals(sessions, s => s.date, () => 1) };
  }, [sessions]);
  const recent = useMemo(() => [...sessions].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 4), [sessions]);

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  const pending = plan.pending + plan.unlinked.length;
  const go = (path: string) => router.push(path as any);

  return (
    <ScrollView
      style={commonStyles.screen}
      contentContainerStyle={[commonStyles.content, { paddingTop: insets.top + 16 }]}
      refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); fetchAll(); }} tintColor={C.accent} />}
    >
      <Text style={Type.display}>LRS Tracker</Text>
      <Text style={[Type.sub, { marginTop: 4 }]}>
        {plural(rifles.length, 'rifle')}, {plural(loads.length, 'load')}, {plural(sessions.length, 'range session')}
      </Text>

      <View style={st.quickRow}>
        <Quick icon="add-circle" label="New load" onPress={() => go('/load/new')} />
        <Quick icon="clipboard" label="Log session" onPress={() => go('/session/new')} />
        <Quick icon="speedometer" label="Field mode" onPress={() => { setMode('field'); router.replace('/field' as any); }} />
      </View>

      {pending > 0 && (
        <TouchableOpacity style={st.banner} onPress={() => go('/load-ids')} activeOpacity={0.7}>
          <Ionicons name="pricetags-outline" size={18} color={C.orange} />
          <View style={{ flex: 1 }}>
            <Text style={st.bannerTitle}>Switch to per-rifle load IDs</Text>
            <Text style={st.bannerText}>{plural(pending, 'load')} to update. Old IDs stay attached.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={C.muted} />
        </TouchableOpacity>
      )}

      <Section title="Best load per rifle" action={rifles.length ? 'All rifles' : undefined} onAction={() => go('/(tabs)/rifles')}>
        {best.length === 0
          ? <Item icon="add" tone="accent" label="Add your first rifle" onPress={() => go('/rifle/new')} />
          : best.map(({ rifle, count, load }) => (
            <Item
              key={rifle.id}
              dot={load ? statusColor(load.status) : C.border}
              label={rifle.name}
              sub={load ? `${load.load_id || 'No ID'} · ${recipe(load) || load.status}` : count ? plural(count, 'load') : 'No loads yet'}
              value={load ? headline(load) : ''}
              onPress={() => go(load ? `/load/${load.id}` : `/rifle/${rifle.id}`)}
            />
          ))}
      </Section>

      {sessions.length > 0 && activity.months.some(m => m.value > 0) && (
        <Section title={activity.anyRounds ? 'Rounds fired' : 'Range sessions'} plain footer="Last six months, from your field log.">
          <ColumnChart items={activity.months} />
        </Section>
      )}

      {recent.length > 0 && (
        <Section title="Recent range sessions" action="Field log" onAction={() => go('/(tabs)/fieldlog')}>
          {recent.map(s => {
            const load = loads.find(l => l.id === s.load_id);
            return (
              <Item
                key={s.id}
                label={`${shortDate(s.date)} · ${rifleOf(s, rifles)?.name ?? s.rifle ?? 'Session'}`}
                sub={[load?.load_id, s.location, s.distance ? `${s.distance} yd` : ''].filter(Boolean).join(' · ') || undefined}
                value={s.group_size ? `${s.group_size}"` : ''}
                onPress={() => go(`/session/${s.id}`)}
              />
            );
          })}
        </Section>
      )}

      <Section title="Appearance" footer="Light is easier to read in bright sun. The app restarts to apply it.">
        {(['dark', 'light'] as const).map(m => {
          const on = (isDark ? 'dark' : 'light') === m;
          return (
            <Item key={m} label={m === 'dark' ? 'Dark' : 'Light'} chevron={false}
              right={on ? <Ionicons name="checkmark" size={20} color={C.accent} /> : undefined}
              onPress={() => { if (!on) applyTheme(m); }} />
          );
        })}
      </Section>

      <Section>
        <Item icon="cloud-download-outline" label="Import Garmin CSVs" onPress={() => go('/import')} />
        <Item icon="log-out-outline" tone="danger" label="Sign out" chevron={false} onPress={signOut} />
      </Section>
    </ScrollView>
  );
}

function Quick({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={st.quick} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={22} color={C.accent} />
      <Text style={st.quickText}>{label}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  quickRow:    { flexDirection: 'row', gap: 10, marginTop: 20 },
  quick:       { flex: 1, backgroundColor: C.card, borderRadius: 14, paddingVertical: 14, alignItems: 'center', gap: 6 },
  quickText:   { color: C.text, fontSize: 13, fontFamily: F.semibold },
  banner:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.orange + '14', borderRadius: 14, padding: 14, marginTop: 18 },
  bannerTitle: { color: C.text, fontFamily: F.bold, fontSize: 15 },
  bannerText:  { fontFamily: F.regular, color: C.textSoft, fontSize: 13, marginTop: 2 },
});
