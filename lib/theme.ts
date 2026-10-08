import { StyleSheet } from 'react-native';

// Palette (yours). `line` is the hairline between rows inside a card.
export const C = {
  bg:        '#0a0e17',  // base
  surface:   '#141d2e',  // inputs / bars — lifted off bg
  card:      '#1b2740',  // cards — clearly distinct from bg
  border:    '#2b3b56',  // input edges
  borderHi:  '#3b5075',
  line:      '#26344d',  // separators inside cards
  accent:    '#4d8dff',
  green:     '#2fd672',
  orange:    '#f9a83a',
  red:       '#f2565a',
  purple:    '#9b7cff',
  muted:     '#6c81a0',  // placeholders/hints
  textSoft:  '#a1b6d2',  // secondary text + labels
  text:      '#eef3fb',  // primary text
  white:     '#ffffff',
};

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const statusColor = (status: string) =>
  status === 'proven'    ? C.green  :
  status === 'promising' ? C.orange :
  status === 'retired'   ? C.muted  : C.textSoft;

// One family (system), hierarchy by size and weight. Numbers use tabular figures.
export const Type = StyleSheet.create({
  display:  { fontSize: 30, fontWeight: '800', color: C.text, letterSpacing: 0.2 },
  title:    { fontSize: 22, fontWeight: '800', color: C.text },
  headline: { fontSize: 17, fontWeight: '700', color: C.text },
  body:     { fontSize: 15, color: C.text },
  sub:      { fontSize: 13, color: C.textSoft },
  caption:  { fontSize: 12, color: C.muted },
  num:      { fontVariant: ['tabular-nums'] },
});

export const commonStyles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 80 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: C.textSoft,
    marginBottom: 6,
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    color: C.text,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: C.textSoft,
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 4,
  },
  fab: {
    position: 'absolute' as const,
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.accent,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  primaryBtn: {
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center' as const,
    marginTop: 16,
  },
  primaryBtnText: {
    color: C.white,
    fontWeight: '700' as const,
    fontSize: 16,
  },
  dangerBtn: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center' as const,
    marginTop: 6,
  },
  dangerBtnText: {
    color: C.red,
    fontWeight: '600' as const,
    fontSize: 15,
  },
});
