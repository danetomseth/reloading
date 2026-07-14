import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, commonStyles } from '../lib/theme';
import {
  POWDERS, Bullet, bulletDiameters, bulletsForDiameter, diameterLabel,
  suggestDiameter, computeSD,
} from '../lib/reloadData';

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

const styles = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center' },
  chev:       { paddingHorizontal: 8, paddingVertical: 8, marginLeft: 4 },
  dropdown:   { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderHi, borderRadius: 6, marginTop: 4, overflow: 'hidden' },
  option:     { paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border },
  optionText: { color: C.text, fontSize: 14 },

  lib:        { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderHi, borderRadius: 8, padding: 12, marginBottom: 12 },
  libHead:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  libTitle:   { color: C.accent, fontSize: 13, fontWeight: '700', flex: 1 },
  calChip:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, marginRight: 8 },
  calChipOn:  { backgroundColor: C.accent + '22', borderColor: C.accent },
  calChipText:   { color: C.muted, fontSize: 12, fontWeight: '600' },
  calChipTextOn: { color: C.accent },
  bRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border },
  bName:      { color: C.text, fontSize: 14, fontWeight: '600' },
  bSpec:      { color: C.textSoft, fontSize: 12, marginTop: 2 },
});
