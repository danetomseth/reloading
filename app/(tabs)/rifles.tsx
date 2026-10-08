import { useState, useCallback, useMemo } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect, Tabs } from 'expo-router';
import { db, Rifle, Load } from '../../lib/supabase';
import { cachedList } from '../../lib/cache';
import { C, commonStyles } from '../../lib/theme';
import { EmptyState, HeaderButton, Item, Section } from '../../components/Form';
import { assignCodes, belongsTo } from '../../lib/loadIds';
import { headline, pickBest } from '../../lib/metrics';

export default function Rifles() {
  const router = useRouter();
  const [rifles,  setRifles]  = useState<Rifle[]>([]);
  const [loads,   setLoads]   = useState<Load[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const fetch = async () => {
    const [r, l] = await Promise.all([
      cachedList<Rifle>('rifles', db.rifles.getAll()),
      cachedList<Load>('loads', db.loads.getAll()),
    ]);
    setRifles(r);
    setLoads(l);
    setLoading(false);
    setRefresh(false);
  };

  useFocusEffect(useCallback(() => { fetch(); }, []));
  const codes = useMemo(() => assignCodes(rifles), [rifles]);

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  return (
    <View style={commonStyles.screen}>
      <Tabs.Screen options={{ headerRight: () => <HeaderButton icon="add" inset onPress={() => router.push('/rifle/new' as any)} /> }} />
      <ScrollView
        contentContainerStyle={commonStyles.content}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); fetch(); }} tintColor={C.accent} />}
      >
        {rifles.length === 0 ? (
          <EmptyState icon="locate-outline" title="No rifles yet" body="Add a rifle and its loads get numbered automatically."
            action="Add rifle" onAction={() => router.push('/rifle/new' as any)} />
        ) : (
          <Section style={{ marginTop: 0 }}>
            {rifles.map(r => {
              const mine = loads.filter(l => belongsTo(l, r));
              const best = pickBest(mine);
              return (
                <Item
                  key={r.id}
                  label={r.name}
                  sub={[r.caliber, codes[r.id], `${mine.length} load${mine.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                  value={best ? headline(best) : ''}
                  onPress={() => router.push(`/rifle/${r.id}` as any)}
                />
              );
            })}
          </Section>
        )}
      </ScrollView>
    </View>
  );
}
