import { useState, useCallback, useMemo } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect, Tabs } from 'expo-router';
import { db, Session, Rifle, Load } from '../../lib/supabase';
import { cachedList } from '../../lib/cache';
import { C, commonStyles } from '../../lib/theme';
import { EmptyState, HeaderButton, Item, Section } from '../../components/Form';
import { rifleOf } from '../../lib/loadIds';
import { monthLabel, shortDate } from '../../lib/metrics';

export default function FieldLog() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [rifles,   setRifles]   = useState<Rifle[]>([]);
  const [loads,    setLoads]    = useState<Load[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refresh,  setRefresh]  = useState(false);

  const fetch = async () => {
    const [s, r, l] = await Promise.all([
      cachedList<Session>('sessions', db.sessions.getAll()),
      cachedList<Rifle>('rifles', db.rifles.getAll()),
      cachedList<Load>('loads', db.loads.getAll()),
    ]);
    setSessions(s);
    setRifles(r);
    setLoads(l);
    setLoading(false);
    setRefresh(false);
  };

  useFocusEffect(useCallback(() => { fetch(); }, []));

  const months = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const map = new Map<string, Session[]>();
    for (const s of sorted) {
      const k = monthLabel(s.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return [...map.entries()];
  }, [sessions]);

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  return (
    <View style={commonStyles.screen}>
      <Tabs.Screen options={{ headerRight: () => <HeaderButton icon="add" inset onPress={() => router.push('/session/new' as any)} /> }} />
      <ScrollView
        contentContainerStyle={commonStyles.content}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); fetch(); }} tintColor={C.accent} />}
      >
        {sessions.length === 0 ? (
          <EmptyState icon="clipboard-outline" title="No range sessions yet"
            body="Log conditions, dope and groups each time you shoot. Calculated drops fill in from the load."
            action="Log session" onAction={() => router.push('/session/new' as any)} />
        ) : months.map(([month, list], gi) => (
          <Section key={month} title={month} style={gi === 0 ? { marginTop: 0 } : undefined}>
            {list.map(s => {
              const load = loads.find(l => l.id === s.load_id);
              const cond = [s.temp ? `${s.temp}°F` : '', s.wind_speed ? `${s.wind_speed} mph` : ''].filter(Boolean).join(', ');
              return (
                <Item
                  key={s.id}
                  label={`${shortDate(s.date)} · ${rifleOf(s, rifles)?.name ?? s.rifle ?? 'Session'}`}
                  sub={[load?.load_id, s.location, cond].filter(Boolean).join(' · ') || undefined}
                  value={[s.distance ? `${s.distance} yd` : '', s.group_size ? `${s.group_size}"` : ''].filter(Boolean).join('  ')}
                  onPress={() => router.push(`/session/${s.id}` as any)}
                />
              );
            })}
          </Section>
        ))}
      </ScrollView>
    </View>
  );
}
