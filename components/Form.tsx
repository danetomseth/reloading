// Shared UI kit. Grouped sections with rows (label left, value or input
// right), disclosures for optional detail, stats, and the form helpers the
// ballistics and truing screens use.
import { Children, Fragment, ReactNode, isValidElement, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardTypeOptions, Switch, StyleProp, ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, commonStyles, F } from '../lib/theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

export function useDebounced<V>(value: V, ms = 300): V {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function withSeparators(children: ReactNode) {
  return Children.toArray(children).map((k, i) => (
    <Fragment key={isValidElement(k) && k.key != null ? String(k.key) : i}>
      {i > 0 ? <View style={s.sep} /> : null}
      {k}
    </Fragment>
  ));
}

type Action = { label: string; onPress: () => void };

export function Section({ title, action, onAction, actions, footer, children, plain, style }: {
  title?: string; action?: string; onAction?: () => void; actions?: Action[];
  footer?: string; children?: ReactNode; plain?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const acts = actions ?? (action && onAction ? [{ label: action, onPress: onAction }] : []);
  return (
    <View style={[s.section, style]}>
      {(title || acts.length > 0) ? (
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>{title ?? ''}</Text>
          <View style={s.actions}>
            {acts.map(a => (
              <TouchableOpacity key={a.label} onPress={a.onPress} hitSlop={HIT}>
                <Text style={s.sectionAction}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
      <View style={[s.group, plain && s.groupPlain]}>{plain ? children : withSeparators(children)}</View>
      {footer ? <Text style={s.footer}>{footer}</Text> : null}
    </View>
  );
}

export function Item({ label, sub, value, valueColor, onPress, chevron, tone, icon, dot, right }: {
  label: string; sub?: string; value?: string; valueColor?: string; onPress?: () => void; chevron?: boolean;
  tone?: 'danger' | 'accent'; icon?: IconName; dot?: string; right?: ReactNode;
}) {
  const showChevron = chevron ?? !!onPress;
  const body = (
    <View style={s.item}>
      {dot ? <View style={[s.dot, { backgroundColor: dot }]} /> : null}
      {icon ? <Ionicons name={icon} size={19} color={tone === 'danger' ? C.red : C.accent} style={s.itemIcon} /> : null}
      <View style={s.itemMain}>
        <Text style={[s.itemLabel, tone === 'danger' && { color: C.red }, tone === 'accent' && { color: C.accent }]} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={s.itemSub} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {value ? <Text style={[s.itemValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>{value}</Text> : null}
      {right}
      {showChevron ? <Ionicons name="chevron-forward" size={16} color={C.muted} style={{ marginLeft: 4 }} /> : null}
    </View>
  );
  return onPress ? <TouchableOpacity activeOpacity={0.6} onPress={onPress}>{body}</TouchableOpacity> : body;
}

export function InputItem({ label, value, onChange, unit, placeholder, keyboard = 'decimal-pad', autoCapitalize = 'sentences' }: {
  label: string; value: string; onChange: (v: string) => void; unit?: string; placeholder?: string;
  keyboard?: KeyboardTypeOptions; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={s.item}>
      <Text style={s.inputLabel} numberOfLines={1}>{label}</Text>
      <TextInput
        style={s.inlineInput} value={value} onChangeText={onChange}
        placeholder={placeholder ?? '—'} placeholderTextColor={C.muted}
        keyboardType={keyboard} autoCapitalize={autoCapitalize} textAlign="right"
      />
      {unit ? <Text style={s.unit}>{unit}</Text> : null}
    </View>
  );
}

export function NotesInput({ value, onChange, placeholder = 'Notes' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <TextInput
      style={s.notes} value={value} onChangeText={onChange} placeholder={placeholder}
      placeholderTextColor={C.muted} multiline textAlignVertical="top"
    />
  );
}

export function ToggleItem({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.item}>
      <Text style={[s.itemLabel, { flex: 1 }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.accent, false: C.border }} thumbColor={C.white} />
    </View>
  );
}

export function Disclosure({ title, summary, initiallyOpen = false, plain, children }: {
  title: string; summary?: string; initiallyOpen?: boolean; plain?: boolean; children?: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={s.section}>
      <TouchableOpacity style={s.disclosureHead} onPress={() => setOpen(o => !o)} activeOpacity={0.6}>
        <Text style={[s.sectionTitle, { flex: 1 }]}>{title}</Text>
        {summary && !open ? <Text style={s.disclosureSummary} numberOfLines={1}>{summary}</Text> : null}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={C.textSoft} />
      </TouchableOpacity>
      {open && <View style={[s.group, plain && s.groupPlain]}>{plain ? children : withSeparators(children)}</View>}
    </View>
  );
}

export const Badge = ({ label, color }: { label: string; color: string }) => (
  <View style={[s.badge, { backgroundColor: color + '24' }]}>
    <Text style={[s.badgeText, { color }]}>{label}</Text>
  </View>
);

export function StatStrip({ items }: { items: { label: string; value: string; sub?: string; color?: string }[] }) {
  return (
    <View style={s.strip}>
      {items.map((it, i) => (
        <View key={it.label} style={[s.stripCell, i > 0 && s.stripDivider]}>
          <Text style={[s.stripValue, it.color ? { color: it.color } : null]} numberOfLines={1} adjustsFontSizeToFit>{it.value}</Text>
          <Text style={s.stripLabel} numberOfLines={1}>{it.label}</Text>
          {it.sub ? <Text style={s.stripSub} numberOfLines={1}>{it.sub}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export function EmptyState({ icon, title, body, action, onAction }: {
  icon: IconName; title: string; body?: string; action?: string; onAction?: () => void;
}) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={40} color={C.muted} />
      <Text style={s.emptyTitle}>{title}</Text>
      {body ? <Text style={s.emptyBody}>{body}</Text> : null}
      {action && onAction ? (
        <TouchableOpacity style={s.emptyBtn} onPress={onAction}><Text style={s.emptyBtnText}>{action}</Text></TouchableOpacity>
      ) : null}
    </View>
  );
}

export function HeaderButton({ label, icon, onPress, disabled, inset }: {
  label?: string; icon?: IconName; onPress: () => void; disabled?: boolean; inset?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} hitSlop={HIT} style={[{ paddingHorizontal: 4 }, inset && { marginHorizontal: 12 }]}>
      {icon
        ? <Ionicons name={icon} size={26} color={C.accent} />
        : <Text style={[s.headerBtn, disabled && { opacity: 0.4 }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

// ── form helpers used by the ballistics and truing screens ───────────────────

export function Field({ label, value, onChange, placeholder, keyboard = 'decimal-pad', hint }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; keyboard?: KeyboardTypeOptions; hint?: string;
}) {
  return (
    <View style={s.field}>
      <Text style={commonStyles.label} numberOfLines={1}>{label}</Text>
      <TextInput
        style={commonStyles.input} value={value} onChangeText={onChange}
        placeholder={placeholder ?? ''} placeholderTextColor={C.muted} keyboardType={keyboard}
      />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export const Row = ({ children }: { children: ReactNode }) => <View style={s.row}>{children}</View>;

export function Segment<V extends string>({ options, value, onChange }: {
  options: { value: V; label: string }[]; value: V; onChange: (v: V) => void;
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={{ paddingRight: 8 }}>
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
    <View style={[s.note, { backgroundColor: color + '14', borderLeftColor: color }]}>
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
          <View key={ri} style={[s.tr, ri > 0 && s.trLine, r.tone === 'pick' && s.trPick]}>
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
  section:       { marginTop: 18 },
  sectionHead:   { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8, marginHorizontal: 4 },
  sectionTitle: { fontFamily: F.semibold, fontSize: 14, color: C.textSoft },
  actions:       { flexDirection: 'row', gap: 16 },
  sectionAction: { fontFamily: F.semibold, fontSize: 15, color: C.accent },
  group: { backgroundColor: C.card, borderRadius: 12, overflow: 'hidden' },
  groupPlain:    { padding: 14 },
  sep:           { height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginLeft: 16 },
  footer:        { fontFamily: F.regular, fontSize: 12, color: C.muted, marginTop: 6, marginHorizontal: 4, lineHeight: 17 },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, minHeight: 52 },
  itemIcon:      { marginRight: 12 },
  dot:           { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  itemMain:      { flex: 1, minWidth: 0 },
  itemLabel: { fontFamily: F.medium, fontSize: 17, color: C.text },
  itemSub: { fontFamily: F.regular, fontSize: 14, color: C.textSoft, marginTop: 2 },
  itemValue: { fontFamily: F.numMedium, fontSize: 17, color: C.textSoft, marginLeft: 12, fontVariant: ['tabular-nums'], maxWidth: '55%' },
  inputLabel: { fontFamily: F.medium, fontSize: 17, color: C.text, marginRight: 12, maxWidth: '50%' },
  inlineInput: { fontFamily: F.numMedium, flex: 1, fontSize: 18, color: C.text, paddingVertical: 2, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: F.regular, fontSize: 15, color: C.muted, marginLeft: 6 },
  notes: { fontFamily: F.regular, color: C.text, fontSize: 16, minHeight: 90, padding: 14, lineHeight: 22 },
  disclosureHead:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginHorizontal: 4 },
  disclosureSummary: { fontFamily: F.regular, fontSize: 13, color: C.muted, maxWidth: '55%' },
  badge:         { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText:     { fontSize: 12, fontFamily: F.bold },
  strip:         { flexDirection: 'row', backgroundColor: C.card, borderRadius: 14, paddingVertical: 14 },
  stripCell:     { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  stripDivider:  { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: C.line },
  stripValue: { fontFamily: F.numBold, fontSize: 26, color: C.text, fontVariant: ['tabular-nums'] },
  stripLabel: { fontFamily: F.medium, fontSize: 13, color: C.textSoft, marginTop: 1 },
  stripSub:      { fontFamily: F.regular, fontSize: 11, color: C.muted, marginTop: 1 },
  empty:         { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24 },
  emptyTitle:    { fontSize: 17, fontFamily: F.bold, color: C.text, marginTop: 12 },
  emptyBody:     { fontFamily: F.regular, fontSize: 14, color: C.textSoft, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  emptyBtn:      { marginTop: 16, backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11 },
  emptyBtnText: { fontFamily: F.semibold, color: C.onAccent, fontSize: 16 },
  headerBtn: { fontFamily: F.semibold, color: C.accent, fontSize: 17 },
  field:         { flex: 1 },
  hint:          { fontFamily: F.regular, color: C.muted, fontSize: 11, marginTop: -6, marginBottom: 10 },
  row:           { flexDirection: 'row', gap: 10 },
  segment:       { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 10, padding: 3, marginBottom: 12 },
  segBtn:        { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segOn: { backgroundColor: C.thumb },
  segText: { fontFamily: F.medium, color: C.textSoft, fontSize: 15 },
  segTextOn: { fontFamily: F.semibold, color: C.text },
  chipScroll:    { marginBottom: 12, flexGrow: 0 },
  chip:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: C.surface, marginRight: 8 },
  chipOn:        { backgroundColor: C.accent + '2a' },
  chipText: { fontFamily: F.medium, color: C.textSoft, fontSize: 15 },
  chipTextOn:    { color: C.accent },
  note:          { borderLeftWidth: 3, borderRadius: 8, padding: 12, marginBottom: 10 },
  noteText: { fontFamily: F.regular, color: C.text, fontSize: 15, lineHeight: 21 },
  stat:          { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 12 },
  statLabel:     { color: C.textSoft, fontSize: 12, fontFamily: F.semibold },
  statValue: { fontFamily: F.numBold, color: C.text, fontSize: 22, marginTop: 3, fontVariant: ['tabular-nums'] },
  statSub:       { fontFamily: F.regular, color: C.muted, fontSize: 12, marginTop: 2 },
  table:         { marginBottom: 12, backgroundColor: C.card, borderRadius: 14, overflow: 'hidden' },
  thead:         { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  th:            { fontSize: 12, fontFamily: F.semibold, color: C.textSoft },
  tr:            { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 12 },
  trLine:        { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  trPick:        { backgroundColor: C.green + '14' },
  td: { fontFamily: F.numMedium, fontSize: 16, fontVariant: ['tabular-nums'] },
  secondary:     { backgroundColor: C.card, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  secondaryText: { color: C.text, fontFamily: F.semibold, fontSize: 15 },
});
