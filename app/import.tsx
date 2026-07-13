import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { db, Rifle, Load, uid } from '../lib/supabase';
import { C, commonStyles } from '../lib/theme';
import {
  parseShotView, ParsedXero, matchRifle, matchLoad, alreadyImported,
  buildNewLoad, mergeIntoLoad, MATCH_THRESHOLD,
} from '../lib/importXero';

const NEW = '__new__';

type Item = {
  key: string;
  fileName: string;
  parsed: ParsedXero;
  rifleChoice: string;    // existing rifle name, or NEW
  newRifleName: string;   // used when rifleChoice === NEW
  merge: Load | null;     // existing load matched by lot
  dup: boolean;           // already imported into that load
};

export default function Import() {
  const router = useRouter();
  const [rifles, setRifles] = useState<Rifle[]>([]);
  const [loads,  setLoads]  = useState<Load[]>([]);
  const [ready,  setReady]  = useState(false);
  const [items,  setItems]  = useState<Item[]>([]);
  const [busy,   setBusy]   = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([db.rifles.getAll(), db.loads.getAll()]).then(([r, l]) => {
      setRifles(r.data || []);
      setLoads(l.data || []);
      setReady(true);
    });
  }, []);

  const buildItem = (fileName: string, parsed: ParsedXero, rs: Rifle[], ls: Load[]): Item => {
    const m = matchRifle(parsed.riflePart, rs);
    const rifleChoice = m.rifle && m.score >= MATCH_THRESHOLD ? m.rifle.name : NEW;
    const effName = rifleChoice === NEW ? parsed.riflePart : rifleChoice;
    const merge = matchLoad(parsed, effName, ls);
    return {
      key: fileName + ':' + parsed.name + ':' + uid(),
      fileName, parsed, rifleChoice, newRifleName: parsed.riflePart,
      merge, dup: merge ? alreadyImported(merge, parsed) : false,
    };
  };

  const pick = async () => {
    setResult(null);
    const res = await DocumentPicker.getDocumentAsync({
      multiple: true, copyToCacheDirectory: true,
      type: ['text/csv', 'text/comma-separated-values', 'public.comma-separated-values', '*/*'],
    });
    if (res.canceled) return;
    const next: Item[] = [];
    for (const asset of res.assets) {
      try {
        const text = await new File(asset.uri).text();
        const parsed = parseShotView(text);
        if (!parsed.shots.length && !parsed.avg) continue; // not a ShotView CSV
        next.push(buildItem(asset.name || 'file.csv', parsed, rifles, loads));
      } catch (e) {
        // skip unreadable files silently; others still import
      }
    }
    setItems(prev => [...prev, ...next]);
  };

  const setRifleChoice = (key: string, choice: string) =>
    setItems(prev => prev.map(it => {
      if (it.key !== key) return it;
      const effName = choice === NEW ? it.newRifleName : choice;
      const merge = matchLoad(it.parsed, effName, loads);
      return { ...it, rifleChoice: choice, merge, dup: merge ? alreadyImported(merge, it.parsed) : false };
    }));

  const setNewName = (key: string, name: string) =>
    setItems(prev => prev.map(it => it.key === key ? { ...it, newRifleName: name } : it));

  const remove = (key: string) => setItems(prev => prev.filter(it => it.key !== key));

  const runImport = async () => {
    setBusy(true);
    // local working copies so multiple files can resolve against just-created rows
    const workRifles = [...rifles];
    const workLoads  = [...loads];
    let created = 0, merged = 0, skipped = 0, rifleAdds = 0, failed = 0;

    for (const it of items) {
      try {
        // 1) resolve rifle
        let rifleName: string;
        if (it.rifleChoice === NEW) {
          rifleName = (it.newRifleName || it.parsed.riflePart).trim() || 'Unnamed';
          const exists = workRifles.find(r => r.name.trim().toLowerCase() === rifleName.toLowerCase());
          if (!exists) {
            const newRifle: Partial<Rifle> = {
              id: uid(), name: rifleName, caliber: '', barrel_len: '', twist: '',
              scope_model: '', scope_height: '', scope_unit: 'moa', muzzle_device: '', notes: '',
            };
            const { error } = await db.rifles.upsert(newRifle);
            if (error) throw error;
            workRifles.push(newRifle as Rifle);
            rifleAdds++;
          }
        } else {
          rifleName = it.rifleChoice;
        }

        // 2) resolve load (merge into matching lot, else create)
        const merge = matchLoad(it.parsed, rifleName, workLoads);
        if (merge) {
          if (alreadyImported(merge, it.parsed)) { skipped++; continue; }
          const updated = mergeIntoLoad(merge, it.parsed);
          const { error } = await db.loads.upsert(updated);
          if (error) throw error;
          const idx = workLoads.findIndex(l => l.id === merge.id);
          if (idx >= 0) workLoads[idx] = updated as Load;
          merged++;
        } else {
          const load = buildNewLoad(it.parsed, rifleName);
          const now = new Date().toISOString();
          const { error } = await db.loads.upsert({ ...load, created_at: now, updated_at: now });
          if (error) throw error;
          workLoads.push(load as Load);
          created++;
        }
      } catch (e) {
        failed++;
      }
    }

    setBusy(false);
    const parts = [
      created ? `${created} new reload${created > 1 ? 's' : ''}` : '',
      merged ? `${merged} merged` : '',
      rifleAdds ? `${rifleAdds} new rifle${rifleAdds > 1 ? 's' : ''}` : '',
      skipped ? `${skipped} skipped (already imported)` : '',
      failed ? `${failed} failed` : '',
    ].filter(Boolean);
    setResult(parts.length ? parts.join(' · ') : 'Nothing to import');
    setItems([]);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Import Chrono Data' }} />
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>
        <Text style={styles.intro}>
          Import Garmin Xero / ShotView CSV exports. Each file adds its velocity, SD and ES to a reload
          as a chrono session — powder, bullet and charge stay blank for you to fill in.
        </Text>

        <TouchableOpacity style={styles.pickBtn} onPress={pick} disabled={!ready || busy}>
          <Ionicons name="folder-open-outline" size={18} color={C.accent} />
          <Text style={styles.pickText}>{ready ? 'Choose CSV file(s)' : 'Loading…'}</Text>
        </TouchableOpacity>

        {result && (
          <View style={styles.resultCard}>
            <Ionicons name="checkmark-circle" size={18} color={C.green} />
            <Text style={styles.resultText}>{result}</Text>
          </View>
        )}

        {items.map(it => {
          const p = it.parsed;
          return (
            <View key={it.key} style={commonStyles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>{p.name || it.fileName}</Text>
                <TouchableOpacity onPress={() => remove(it.key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={18} color={C.muted} />
                </TouchableOpacity>
              </View>

              <View style={styles.stats}>
                <Stat label="AVG" value={`${p.avg} fps`} color={C.green} />
                <Stat label="SD" value={p.sd} />
                <Stat label="ES" value={p.es} />
                <Stat label="SHOTS" value={String(p.count)} />
              </View>
              <Text style={styles.date}>{p.isoDate}{p.lotPart ? `  ·  lot ${p.lotPart}` : ''}</Text>

              <Text style={styles.miniLabel}>RIFLE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <Chip
                  label={`+ New "${it.rifleChoice === NEW ? (it.newRifleName || p.riflePart) : p.riflePart}"`}
                  on={it.rifleChoice === NEW}
                  onPress={() => setRifleChoice(it.key, NEW)}
                />
                {rifles.map(r => (
                  <Chip key={r.id} label={r.name.trim()} on={it.rifleChoice === r.name} onPress={() => setRifleChoice(it.key, r.name)} />
                ))}
              </ScrollView>
              {it.rifleChoice === NEW && (
                <TextInput
                  style={commonStyles.input}
                  value={it.newRifleName}
                  onChangeText={t => setNewName(it.key, t)}
                  placeholder="New rifle name"
                  placeholderTextColor={C.muted}
                />
              )}

              <View style={[styles.destRow, { borderColor: it.dup ? C.orange + '55' : C.borderHi }]}>
                <Ionicons
                  name={it.dup ? 'alert-circle-outline' : it.merge ? 'git-merge-outline' : 'add-circle-outline'}
                  size={15}
                  color={it.dup ? C.orange : it.merge ? C.purple : C.green}
                />
                <Text style={styles.destText}>
                  {it.dup
                    ? 'Already imported into this reload — will skip'
                    : it.merge
                      ? `Merge into existing reload (lot ${it.merge.lot_number})`
                      : 'Create a new reload'}
                </Text>
              </View>
            </View>
          );
        })}

        {items.length > 0 && (
          <TouchableOpacity style={commonStyles.primaryBtn} onPress={runImport} disabled={busy}>
            <Text style={commonStyles.primaryBtnText}>
              {busy ? 'Importing…' : `Import ${items.length} session${items.length > 1 ? 's' : ''}`}
            </Text>
          </TouchableOpacity>
        )}

        {result && (
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </>
  );
}

const Stat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <View style={styles.stat}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={[styles.statValue, color ? { color } : null]}>{value || '—'}</Text>
  </View>
);

const Chip = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
  <TouchableOpacity style={[styles.chip, on && styles.chipOn]} onPress={onPress}>
    <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  intro:      { color: C.textSoft, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  pickBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.accent + '18', borderWidth: 1, borderColor: C.accent, borderRadius: 8, padding: 13 },
  pickText:   { color: C.accent, fontWeight: '700', fontSize: 14 },
  resultCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.green + '18', borderWidth: 1, borderColor: C.green + '55', borderRadius: 8, padding: 12, marginTop: 14 },
  resultText: { color: C.text, fontSize: 13, flex: 1 },
  cardHead:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle:  { color: C.text, fontSize: 15, fontWeight: '700', flex: 1 },
  stats:      { flexDirection: 'row', gap: 16, marginBottom: 6 },
  stat:       {},
  statLabel:  { color: C.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  statValue:  { color: C.text, fontSize: 15, fontWeight: '700', marginTop: 1 },
  date:       { color: C.textSoft, fontSize: 12, marginBottom: 12 },
  miniLabel:  { color: C.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  chip:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, marginRight: 8 },
  chipOn:     { backgroundColor: C.accent + '22', borderColor: C.accent },
  chipText:   { color: C.muted, fontSize: 12, fontWeight: '600' },
  chipTextOn: { color: C.accent },
  destRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 6, padding: 9, marginTop: 4 },
  destText:   { color: C.textSoft, fontSize: 12, flex: 1 },
  doneBtn:    { padding: 14, alignItems: 'center', marginTop: 10 },
  doneText:   { color: C.accent, fontWeight: '700', fontSize: 15 },
});
