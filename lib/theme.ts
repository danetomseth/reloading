import { StyleSheet } from 'react-native';

export const C = {
  bg:        '#0a0f1a',
  surface:   '#111827',
  card:      '#1a2235',
  border:    '#1e2d42',
  borderHi:  '#2a3f5e',
  accent:    '#3b82f6',
  green:     '#22c55e',
  orange:    '#f59e0b',
  red:       '#ef4444',
  purple:    '#8b5cf6',
  muted:     '#4b6078',
  textSoft:  '#8ba3bf',
  text:      '#e2eaf4',
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 10,
  },
  label: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: C.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    marginBottom: 4,
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    color: C.text,
    fontSize: 14,
    padding: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: C.accent,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    marginTop: 16,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 4,
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
