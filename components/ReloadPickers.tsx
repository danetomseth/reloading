import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, commonStyles, F } from '../lib/theme';
import {
  POWDERS, Bullet, bulletDiameters, bulletsForDiameter, diameterLabel,
  suggestDiameter, computeSD,
} from '../lib/reloadData';
import { ManualCartridge, ManualBullet, ManualRow, points, range } from '../lib/manualData';

// ── Powder: text input with a filterable dropdown (still free-text) ───────────
export function PowderInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const q = (value || '').toLowerCase();
  const matches = POWDERS.filter(p => p.toLowerCase().includes(q)).slice(0, 8);

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={commonStyles.label}>Powder</Text>
      <View style={styles.row}>
        <TextInput
          style={[commonStyles.input, { flex: 1, marginBottom: 0 }]}
          value={value}
          onChangeText={v => { onChange(v); setOpen(true); }}
          placeholder="Powder"
          placeholderTextColor={C.muted}
          onFocus={() => setOpen(true)}
        />
        <TouchableOpacity style={styles.chev} onPress={() => setOpen(o => !o)}>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
        </TouchableOpacity>
      </View>
      {open && matches.length > 0 && (
        <View style={styles.dropdown}>
          {matches.map(p => (
            <TouchableOpacity key={p} style={styles.option} onPress={() => { onChange(p); setOpen(false); }}>
              <Text style={styles.optionText}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Bullet library: pick a caliber group → a bullet → fills the form ──────────
export function BulletLibrary({ caliber, onPick }: { caliber?: string; onPick: (b: Bullet) => void }) {
  const [open, setOpen] = useState(false);
  const dias = bulletDiameters();
  const [dia, setDia] = useState<number>(suggestDiameter(caliber || '') ?? dias[0]);

  // follow the load's caliber when it maps to a group we have
  useEffect(() => {
    const g = suggestDiameter(caliber || '');
    if (g) setDia(g);
  }, [caliber]);

  const list = bulletsForDiameter(dia);

  return (
    <View style={styles.lib}>
      <TouchableOpacity style={styles.libHead} onPress={() => setOpen(o => !o)}>
        <Ionicons name="library-outline" size={16} color={C.accent} />
        <Text style={styles.libTitle}>Bullet Library</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={C.muted} />
      </TouchableOpacity>

      {open && (
        <View style={{ marginTop: 10 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {dias.map(d => (
              <TouchableOpacity key={d} style={[styles.calChip, dia === d && styles.calChipOn]} onPress={() => setDia(d)}>
                <Text style={[styles.calChipText, dia === d && styles.calChipTextOn]}>{diameterLabel(d)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {list.map((b, i) => (
            <TouchableOpacity key={i} style={styles.bRow} onPress={() => { onPick(b); setOpen(false); }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bName}>{b.weight}gr · {b.mfr} {b.model}</Text>
                <Text style={styles.bSpec}>
                  {b.bcG1 != null ? `G1 ${b.bcG1}` : ''}{b.bcG7 != null ? `  ·  G7 ${b.bcG7}` : ''}
                  {`  ·  SD ${computeSD(b.weight, b.diameter)}`}
                </Text>
              </View>
              <Ionicons name="add-circle-outline" size={20} color={C.green} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Manual data: published charges for this cartridge + bullet ───────────────
export function ManualDataCard({ cartridge: c, bullet: b, row, charge, onPowder, onCharge, onCaseData, onLadder }: {
  cartridge: ManualCartridge; bullet: ManualBullet; row: ManualRow | null; charge?: string;
  onPowder: (p: string) => void; onCharge: (c: string) => void; onCaseData: () => void; onLadder: () => void;
}) {
  const rg = row ? range(b, row) : null;
  const cur = parseFloat(charge || '');
  const over = rg != null && !/\d\s*[-–]\s*\d/.test(charge || '') && cur > rg.max.charge;
  const spec = [c.barrel && `${c.barrel} barrel`, c.primer, c.case && `${c.case} brass`, b.col && `COL ${b.col.toFixed(3)}"`].filter(Boolean).join(' · ');

  return (
    <View style={styles.md}>
      <View style={styles.libHead}>
        <Ionicons name="book-outline" size={16} color={C.accent} />
        <Text style={styles.libTitle}>{c.source} · {c.name}</Text>
      </View>
      <Text style={styles.mdSub}>{b.weight} gr {b.mfr} {b.model}{spec ? `  ·  ${spec}` : ''}</Text>

      {row && rg ? (
        <>
          <Text style={styles.mdRange}>
            {row.powder}: start {rg.start.charge.toFixed(1)} gr ({rg.start.velocity} fps), max {rg.max.charge.toFixed(1)} gr ({rg.max.velocity} fps)
          </Text>
          <View style={styles.mdChips}>
            {points(b, row).map((p, i, all) => {
              const isMax = i === all.length - 1;
              return (
                <TouchableOpacity key={p.velocity} style={[styles.mdChip, isMax && styles.mdChipMax]} onPress={() => onCharge(p.charge.toFixed(1))}>
                  <Text style={[styles.mdChipGr, isMax && { color: C.red }]}>{p.charge.toFixed(1)}</Text>
                  <Text style={styles.mdChipFps}>{isMax ? `MAX · ${p.velocity}` : p.velocity}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {over && <Text style={styles.mdWarn}>{charge} gr is above the published max of {rg.max.charge.toFixed(1)} gr.</Text>}
          <View style={styles.mdBtns}>
            <TouchableOpacity style={styles.mdBtn} onPress={onLadder}><Text style={styles.mdBtnText}>Plan ladder start→max</Text></TouchableOpacity>
            <TouchableOpacity style={styles.mdBtn} onPress={onCaseData}><Text style={styles.mdBtnText}>Fill case data</Text></TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.mdHint}>Pick a powder from this manual:</Text>
          {b.rows.map(r => {
            const x = range(b, r);
            return (
              <TouchableOpacity key={r.powder} style={styles.bRow} onPress={() => onPowder(r.powder)}>
                <Text style={[styles.bName, { flex: 1 }]}>{r.powder}</Text>
                {x && <Text style={styles.bSpec}>{x.start.charge.toFixed(1)}–{x.max.charge.toFixed(1)} gr · to {x.max.velocity} fps</Text>}
              </TouchableOpacity>
            );
          })}
          <View style={styles.mdBtns}>
            <TouchableOpacity style={styles.mdBtn} onPress={onCaseData}><Text style={styles.mdBtnText}>Fill case data</Text></TouchableOpacity>
          </View>
        </>
      )}
      <Text style={styles.mdFoot}>Tested in a {c.testRifle?.toLowerCase() || 'test rifle'}. Start low and work up; your rifle may reach pressure before the listed max.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center' },
  chev:       { paddingHorizontal: 8, paddingVertical: 8, marginLeft: 4 },
  dropdown:   { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderHi, borderRadius: 6, marginTop: 4, overflow: 'hidden' },
  option:     { paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border },
  optionText: { fontFamily: F.regular, color: C.text, fontSize: 14 },

  lib:        { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderHi, borderRadius: 8, padding: 12, marginBottom: 12 },
  libHead:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  libTitle:   { color: C.accent, fontSize: 13, fontFamily: F.bold, flex: 1 },
  calChip:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, marginRight: 8 },
  calChipOn:  { backgroundColor: C.accent + '22', borderColor: C.accent },
  calChipText:   { color: C.muted, fontSize: 12, fontFamily: F.semibold },
  calChipTextOn: { color: C.accent },
  bRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border },
  bName:      { color: C.text, fontSize: 14, fontFamily: F.semibold },
  bSpec:      { fontFamily: F.regular, color: C.textSoft, fontSize: 12, marginTop: 2 },

  md:         { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderHi, borderRadius: 8, padding: 12, marginBottom: 12 },
  mdSub:      { fontFamily: F.regular, color: C.textSoft, fontSize: 12, marginTop: 4 },
  mdRange:    { color: C.text, fontSize: 14, fontFamily: F.semibold, marginTop: 10 },
  mdHint:     { fontFamily: F.regular, color: C.textSoft, fontSize: 13, marginTop: 10, marginBottom: 2 },
  mdChips:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  mdChip:     { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, alignItems: 'center' },
  mdChipMax:  { borderColor: C.red, backgroundColor: C.red + '18' },
  mdChipGr:   { color: C.text, fontSize: 14, fontFamily: F.bold, fontVariant: ['tabular-nums'] },
  mdChipFps:  { fontFamily: F.regular, color: C.muted, fontSize: 11, marginTop: 1 },
  mdWarn:     { color: C.red, fontSize: 13, fontFamily: F.semibold, marginTop: 8 },
  mdBtns:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  mdBtn:      { backgroundColor: C.accent + '22', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  mdBtnText:  { color: C.accent, fontFamily: F.bold, fontSize: 13 },
  mdFoot:     { fontFamily: F.regular, color: C.muted, fontSize: 11, marginTop: 10 },
});
