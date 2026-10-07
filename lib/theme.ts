import { StyleSheet } from 'react-native';

export const C = {
  bg:        '#0a0e17',  // base
  surface:   '#141d2e',  // inputs / bars — lifted off bg
  card:      '#1b2740',  // cards — clearly distinct from bg
  border:    '#2b3b56',  // more visible edges = crisper separation
  borderHi:  '#3b5075',
  accent:    '#4d8dff',  // slightly brighter blue for pop
  green:     '#2fd672',
  orange:    '#f9a83a',
  red:       '#f2565a',
  purple:    '#9b7cff',
  muted:     '#6c81a0',  // placeholders/hints — readable, not dim
  textSoft:  '#a1b6d2',  // secondary text + labels — clearly legible
  text:      '#eef3fb',  // primary text — crisp near-white
  white:     '#ffffff',
};

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const statusColor = (status: string) =>
  status === 'proven'    ? C.green  :
  status === 'promising' ? C.orange :
  status === 'retired'   ? C.muted  : C.textSoft;

export const commonStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 60,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.bg,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: C.textSoft,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    marginBottom: 6,
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    color: C.text,
    fontSize: 15,
    padding: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800' as const,
    color: C.accent,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    marginTop: 18,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 6,
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
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  primaryBtn: {
    backgroundColor: C.accent,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center' as const,
    marginTop: 16,
  },
  primaryBtnText: {
    color: C.white,
    fontWeight: '700' as const,
    fontSize: 15,
  },
  dangerBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: C.red,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center' as const,
    marginTop: 10,
  },
  dangerBtnText: {
    color: C.red,
    fontWeight: '700' as const,
    fontSize: 15,
  },
});
