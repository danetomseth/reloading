// Small shared form + display pieces for the ballistics and truing screens.
import { ReactNode, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardTypeOptions } from 'react-native';
import { C, commonStyles } from '../lib/theme';

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Field({ label, value, onChange, placeholder, keyboard = 'decimal-pad', hint }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; keyboard?: KeyboardTypeOptions; hint?: string;
}) {
  return (
    <View style={s.field}>
      <Text style={commonStyles.label}>{label}</Text>
      <TextInput
        style={commonStyles.input} value={value} onChangeText={onChange}
        placeholder={placeholder ?? ''} placeholderTextColor={C.muted} keyboardType={keyboard}
      />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export const Row = ({ children }: { children: ReactNode }) => <View style={s.row}>{children}</View>;

export function Segment<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <View style={s.segment}>
      {options.map(o => (
        <TouchableOpacity key={o.value} style={[s.segBtn, value === o.value && s.segOn]} onPress={() => onChange(o.value)}>
          <Text style={[s.segText, value === o.value && s.segTextOn]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function Chips({ items, selected, onSelect }: {
  items: { key: string; label: string }[]; selected: string | null; onSelect: (key: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll}>
      {items.map(it => (
        <TouchableOpacity key={it.key} style={[s.chip, selected === it.key && s.chipOn]} onPress={() => onSelect(it.key)}>
          <Text style={[s.chipText, selected === it.key && s.chipTextOn]}>{it.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'good' }) {
  const color = tone === 'warn' ? C.orange : tone === 'good' ? C.green : C.accent;
  return (
    <View style={[s.note, { borderColor: color + '55', backgroundColor: color + '14' }]}>
      <Text style={s.noteText}>{children}</Text>
    </View>
  );
}

export function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, color ? { color } : null]}>{value}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

export type TableRow = { cells: string[]; tone?: 'pick' | 'warn' | 'bad' };

export function Table({ head, rows, flex }: { head: string[]; rows: TableRow[]; flex?: number[] }) {
  const w = (i: number) => ({ flex: flex?.[i] ?? 1 });
  return (
    <View style={s.table}>
      <View style={s.thead}>
        {head.map((h, i) => <Text key={h + i} style={[s.th, w(i)]}>{h}</Text>)}
      </View>
      {rows.map((r, ri) => {
        const color = r.tone === 'pick' ? C.green : r.tone === 'warn' ? C.orange : r.tone === 'bad' ? C.red : C.text;
        return (
          <View key={ri} style={[s.tr, ri % 2 === 0 && s.trEven, r.tone === 'pick' && s.trPick]}>
            {r.cells.map((c, ci) => <Text key={ci} style={[s.td, w(ci), { color: ci === 0 ? color : C.text }]}>{c}</Text>)}
          </View>
        );
      })}
    </View>
  );
}

export function Button({ label, onPress, kind = 'primary', disabled }: {
  label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger'; disabled?: boolean;
}) {
  const style = kind === 'primary' ? commonStyles.primaryBtn : kind === 'danger' ? commonStyles.dangerBtn : s.secondary;
  const text = kind === 'primary' ? commonStyles.primaryBtnText : kind === 'danger' ? commonStyles.dangerBtnText : s.secondaryText;
  return (
    <TouchableOpacity style={[style, disabled && { opacity: 0.5 }]} onPress={onPress} disabled={disabled}>
      <Text style={text}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  field:      { flex: 1 },
  hint:       { color: C.muted, fontSize: 11, marginTop: -6, marginBottom: 10 },
  row:        { flexDirection: 'row', gap: 10 },
  segment:    { flexDirection: 'row', gap: 8, marginBottom: 12 },
  segBtn:     { flex: 1, paddingVertical: 9, borderRadius: 6, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center' },
  segOn:      { backgroundColor: C.accent + '22', borderColor: C.accent },
  segText:    { color: C.muted, fontWeight: '600', fontSize: 13 },
  segTextOn:  { color: C.accent },
  chipScroll: { marginBottom: 12 },
  chip:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, marginRight: 8 },
  chipOn:     { backgroundColor: C.accent + '22', borderColor: C.accent },
  chipText:   { color: C.muted, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: C.accent },
  note:       { borderWidth: 1, borderRadius: 8, padding: 11, marginBottom: 10 },
  noteText:   { color: C.text, fontSize: 13, lineHeight: 19 },
  stat:       { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 10 },
  statLabel:  { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  statValue:  { color: C.text, fontSize: 17, fontWeight: '700', marginTop: 2 },
  statSub:    { color: C.textSoft, fontSize: 11, marginTop: 2 },
  table:      { marginBottom: 12 },
  thead:      { flexDirection: 'row', backgroundColor: C.card, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 6 },
  th:         { fontSize: 10, fontWeight: '700', color: C.accent, textTransform: 'uppercase' },
  tr:         { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  trEven:     { backgroundColor: C.surface },
  trPick:     { backgroundColor: C.green + '14' },
  td:         { fontSize: 13, fontVariant: ['tabular-nums'] },
  secondary:  { borderWidth: 1, borderColor: C.borderHi, backgroundColor: C.surface, borderRadius: 8, padding: 13, alignItems: 'center', marginTop: 10 },
  secondaryText: { color: C.text, fontWeight: '700', fontSize: 14 },
});
