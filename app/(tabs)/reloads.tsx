import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
import { useRouter, useFocusEffect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { db, Load, Rifle, Group, parseLoadIds } from '../../lib/supabase';
import { cachedList } from '../../lib/cache';
import { C, commonStyles, statusColor, F } from '../../lib/theme';
import { Chips, EmptyState, HeaderButton, Item, Section, Segment } from '../../components/Form';
import { allIds, assignCodes, belongsTo, parseLoadId, planUpgrade, rifleOf } from '../../lib/loadIds';
import { headline, recipe } from '../../lib/metrics';

type Mode = 'loads' | 'groups';

export default function Reloads() {
  const router = useRouter();
  const [mode,     setMode]     = useState<Mode>('loads');
  const [loads,    setLoads]    = useState<Load[]>([]);
  const [rifles,   setRifles]   = useState<Rifle[]>([]);
  const [groups,   setGroups]   = useState<Group[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refresh,  setRefresh]  = useState(false);
  const [filter,   setFilter]   = useState('');
  const [rifleSel, setRifleSel] = useState('');

  const fetch = async () => {
    const [l, r, g] = await Promise.all([
      cachedList<Load>('loads', db.loads.getAll()),
      cachedList<Rifle>('rifles', db.rifles.getAll()),
      cachedList<Group>('groups', db.groups.getAll()),
    ]);
    setLoads(l);
    setRifles(r);
    setGroups(g);
    setLoading(false);
    setRefresh(false);
  };

  useFocusEffect(useCallback(() => { fetch(); }, []));

  const plan = useMemo(() => planUpgrade(rifles, loads, assignCodes(rifles)), [rifles, loads]);
  const sel = rifles.find(r => r.id === rifleSel);
  const q = filter.trim().toLowerCase();

  const filteredLoads = useMemo(() => {
    const list = loads
      .filter(l => !sel || belongsTo(l, sel))
      .filter(l => !q || [...allIds(l), l.rifle, l.bullet, l.powder, l.status].some(v => (v || '').toLowerCase().includes(q)));
    if (sel) list.sort((a, b) => (parseLoadId(b.load_id)?.seq ?? 0) - (parseLoadId(a.load_id)?.seq ?? 0));
    return list;
  }, [loads, sel, q]);
  const filteredGroups = groups.filter(g => !q || (g.name || '').toLowerCase().includes(q));

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  const go = (path: string) => router.push(path as any);
  const newPath = mode === 'groups' ? '/group/new' : sel ? `/load/new?rifle=${sel.id}` : '/load/new';
  const pending = [
    plan.pending ? `${plan.pending} to renumber` : '',
    plan.unlinked.length ? `${plan.unlinked.length} without a rifle` : '',
  ].filter(Boolean).join(', ');

  return (
    <View style={commonStyles.screen}>
      <Tabs.Screen options={{ headerRight: () => <HeaderButton icon="add" inset onPress={() => go(newPath)} /> }} />
      <View style={st.top}>
        <Segment
          options={[{ value: 'loads', label: `Loads ${loads.length}` }, { value: 'groups', label: `Groups ${groups.length}` }]}
          value={mode} onChange={setMode}
        />
        <View style={st.search}>
          <Ionicons name="search" size={16} color={C.muted} />
          <TextInput
            style={st.searchInput} value={filter} onChangeText={setFilter}
            placeholder={mode === 'loads' ? 'Search IDs, bullets, powders' : 'Search groups'}
            placeholderTextColor={C.muted} autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing"
          />
        </View>
        {mode === 'loads' && rifles.length > 0 && (
          <Chips
            items={[{ key: '', label: 'All rifles' }, ...rifles.map(r => ({ key: r.id, label: r.name }))]}
            selected={rifleSel} onSelect={k => setRifleSel(k === rifleSel ? '' : k)}
          />
        )}
      </View>

      <ScrollView
        contentContainerStyle={[commonStyles.content, { paddingTop: 4 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); fetch(); }} tintColor={C.accent} />}
      >
        {mode === 'loads' ? (
          <>
            {pending !== '' && (
              <TouchableOpacity style={st.banner} onPress={() => go('/load-ids')} activeOpacity={0.7}>
                <Ionicons name="pricetags-outline" size={18} color={C.orange} />
                <View style={{ flex: 1 }}>
                  <Text style={st.bannerTitle}>Switch to per-rifle load IDs</Text>
                  <Text style={st.bannerText}>{pending}. Old IDs stay attached.</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.muted} />
              </TouchableOpacity>
            )}
            {filteredLoads.length === 0 ? (
              <EmptyState
                icon="layers-outline"
                title={filter ? 'No matches' : sel ? `No loads for ${sel.name} yet` : 'No loads yet'}
                body={filter ? 'Search covers current and old IDs, bullets, powders and status.' : 'Each load gets an ID from its rifle, like 25CM-001.'}
                action={filter ? undefined : 'New load'} onAction={() => go(newPath)}
              />
            ) : (
              <Section style={{ marginTop: 0 }}>
                {filteredLoads.map(l => (
                  <Item
                    key={l.id}
                    dot={statusColor(l.status)}
                    label={l.load_id || 'No ID yet'}
                    sub={[!sel ? (rifleOf(l, rifles)?.name ?? l.rifle) : '', recipe(l)].filter(Boolean).join(' · ') || undefined}
                    value={headline(l)}
                    onPress={() => go(`/load/${l.id}`)}
                  />
                ))}
              </Section>
            )}
          </>
        ) : filteredGroups.length === 0 ? (
          <EmptyState
            icon="folder-open-outline"
            title={filter ? 'No matches' : 'No groups yet'}
            body="Groups collect loads across rifles, like a powder test or a match lineup."
            action={filter ? undefined : 'New group'} onAction={() => go('/group/new')}
          />
        ) : (
          <Section style={{ marginTop: 0 }}>
            {filteredGroups.map(g => {
              const ids = new Set(parseLoadIds(g.load_ids));
              const names = [...new Set(loads.filter(l => ids.has(l.id)).map(m => rifleOf(m, rifles)?.name ?? m.rifle).filter(Boolean))];
              return (
                <Item
                  key={g.id}
                  label={g.name || 'Untitled group'}
                  sub={g.notes || names.slice(0, 3).join(', ') || undefined}
                  value={`${ids.size} load${ids.size === 1 ? '' : 's'}`}
                  onPress={() => go(`/group/${g.id}`)}
                />
              );
            })}
          </Section>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  top:         { paddingHorizontal: 16, paddingTop: 8 },
  search:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12 },
  searchInput: { fontFamily: F.regular, flex: 1, color: C.text, fontSize: 16, padding: 0 },
  banner:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.orange + '14', borderRadius: 14, padding: 14, marginBottom: 14 },
  bannerTitle: { color: C.text, fontFamily: F.bold, fontSize: 15 },
  bannerText:  { fontFamily: F.regular, color: C.textSoft, fontSize: 13, marginTop: 2 },
});
