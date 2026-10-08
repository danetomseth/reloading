import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, StyleSheet, LayoutAnimation } from 'react-native';
import { useRouter, useFocusEffect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { db, Rifle, Load } from '../../lib/supabase';
import { cachedList } from '../../lib/cache';
import { C, F, Type, commonStyles } from '../../lib/theme';
import { EmptyState, HeaderButton } from '../../components/Form';
import { assignCodes, belongsTo } from '../../lib/loadIds';
import { headline, pickBest } from '../../lib/metrics';
import { groupByCaliber, nameWithin } from '../../lib/calibers';

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export default function Rifles() {
  const router = useRouter();
  const [rifles,  setRifles]  = useState<Rifle[]>([]);
  const [loads,   setLoads]   = useState<Load[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [tab,     setTab]     = useState('all');
  const [open,    setOpen]    = useState<Record<string, boolean>>({});

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
  const groups = useMemo(() => groupByCaliber(rifles), [rifles]);
  const loadsOf = (r: Rifle) => loads.filter(l => belongsTo(l, r));

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  const active = groups.some(g => g.key === tab) ? tab : 'all';
  const shown = active === 'all' ? groups : groups.filter(g => g.key === active);
  const isOpen = (key: string) => active !== 'all' || (open[key] ?? groups.length <= 3);
  const toggle = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
    setOpen(p => ({ ...p, [key]: !isOpen(key) }));
  };
  const tabs = [{ key: 'all', label: 'All', n: rifles.length }, ...groups.map(g => ({ key: g.key, label: g.label, n: g.rifles.length }))];

  return (
    <View style={commonStyles.screen}>
      <Tabs.Screen options={{ headerRight: () => <HeaderButton icon="add" inset onPress={() => router.push('/rifle/new' as any)} /> }} />
      {rifles.length > 0 && (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.tabs}>
            {tabs.map(t => {
              const on = active === t.key;
              return (
                <TouchableOpacity key={t.key} style={st.tab} activeOpacity={0.6} onPress={() => setTab(t.key)}>
                  <Text style={[st.tabText, on && st.tabTextOn]}>
                    {t.label}<Text style={st.tabCount}>{`  ${t.n}`}</Text>
                  </Text>
                  <View style={[st.tabLine, on && st.tabLineOn]} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={st.tabRule} />
        </View>
      )}

      <ScrollView
        contentContainerStyle={[commonStyles.content, { paddingTop: 8 }]}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); fetch(); }} tintColor={C.accent} />}
      >
        {rifles.length === 0 ? (
          <EmptyState icon="locate-outline" title="No rifles yet" body="Add a rifle and its loads get numbered automatically."
            action="Add rifle" onAction={() => router.push('/rifle/new' as any)} />
        ) : shown.map(g => {
          const groupLoads = g.rifles.flatMap(loadsOf);
          const best = pickBest(groupLoads);
          const bestText = best ? headline(best) : '';
          const summary = `${plural(g.rifles.length, 'rifle')}, ${plural(groupLoads.length, 'load')}${bestText ? `, best ${bestText}` : ''}`;
          const expanded = isOpen(g.key);
          return (
            <View key={g.key} style={st.group}>
              {active === 'all' ? (
                <TouchableOpacity style={st.groupHead} activeOpacity={0.6} onPress={() => toggle(g.key)}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.groupTitle}>{g.label}</Text>
                    <Text style={st.groupMeta}>{summary}</Text>
                  </View>
                  <Ionicons name="chevron-down" size={18} color={C.textSoft} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
                </TouchableOpacity>
              ) : (
                <View style={st.hero}>
                  <Text style={Type.display}>{g.label}</Text>
                  <Text style={[Type.sub, { marginTop: 2 }]}>{summary}</Text>
                </View>
              )}
              {expanded && (
                <View style={st.list}>
                  {g.rifles.map((r, i) => {
                    const mine = loadsOf(r);
                    const b = pickBest(mine);
                    const bt = b ? headline(b) : '';
                    return (
                      <TouchableOpacity key={r.id} activeOpacity={0.6} onPress={() => router.push(`/rifle/${r.id}` as any)}>
                        {i > 0 && <View style={st.sep} />}
                        <View style={st.row}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={st.rowTitle} numberOfLines={1}>{nameWithin(r, g.label)}</Text>
                            <Text style={st.rowSub} numberOfLines={1}>
                              {mine.length ? `${plural(mine.length, 'load')}${bt ? `, best ${bt}` : ''}` : 'No loads yet'}
                            </Text>
                          </View>
                          {codes[r.id] ? <View style={st.code}><Text style={st.codeText}>{codes[r.id]}</Text></View> : null}
                          <Ionicons name="chevron-forward" size={16} color={C.muted} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  tabs:       { paddingHorizontal: 12 },
  tab:        { paddingHorizontal: 10, paddingTop: 6 },
  tabText:    { fontFamily: F.medium, fontSize: 16, color: C.textSoft },
  tabTextOn:  { fontFamily: F.semibold, color: C.text },
  tabCount:   { fontFamily: F.numMedium, fontSize: 14, color: C.muted },
  tabLine:    { height: 2, borderRadius: 1, marginTop: 9, backgroundColor: 'transparent' },
  tabLineOn:  { backgroundColor: C.accent },
  tabRule:    { height: StyleSheet.hairlineWidth, backgroundColor: C.line },
  group:      { marginTop: 14 },
  groupHead:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 8 },
  groupTitle: { fontFamily: F.semibold, fontSize: 19, color: C.text },
  groupMeta:  { fontFamily: F.regular, fontSize: 14, color: C.textSoft, marginTop: 2 },
  hero:       { paddingHorizontal: 4, paddingBottom: 10 },
  list:       { backgroundColor: C.card, borderRadius: 12, overflow: 'hidden', marginTop: 6 },
  sep:        { height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginLeft: 16 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13, minHeight: 58 },
  rowTitle:   { fontFamily: F.medium, fontSize: 17, color: C.text },
  rowSub:     { fontFamily: F.regular, fontSize: 14, color: C.textSoft, marginTop: 2 },
  code:       { borderWidth: 1, borderColor: C.accent + '70', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  codeText:   { fontFamily: F.numMedium, fontSize: 13, color: C.accent, letterSpacing: 0.4 },
});
