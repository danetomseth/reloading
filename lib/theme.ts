import { Appearance, Platform, Settings, StyleSheet } from 'react-native';

// ── appearance ───────────────────────────────────────────────────────────────
// Styles are built once at launch, so a change applies after a restart.
// The choice is kept in iOS user defaults because it has to be read
// synchronously, before the first StyleSheet is created.
export type ThemeMode = 'system' | 'dark' | 'light';
const THEME_KEY = 'lrs.theme';

function readMode(): ThemeMode {
  try {
    const v = Platform.OS === 'ios' ? Settings.get(THEME_KEY) : null;
    return v === 'dark' || v === 'light' ? v : 'system';
  } catch { return 'system'; }
}
export const themeMode: ThemeMode = readMode();
export const isDark = themeMode === 'dark' || (themeMode === 'system' && Appearance.getColorScheme() !== 'light');
export function saveThemeMode(mode: ThemeMode) {
  if (Platform.OS === 'ios') Settings.set({ [THEME_KEY]: mode });
}

// ── color ────────────────────────────────────────────────────────────────────
// Neutral, platform-grade grays; one accent: cartridge brass. Brass marks
// actions and selection only. Status colors never reuse it.
const DARK = {
  bg:       '#000000',
  card:     '#1C1C1E',
  surface:  '#2C2C2E',  // controls, inputs, chips
  thumb:    '#545458',  // selected segment
  raised:   '#3A3A3C',
  border:   '#3A3A3C',
  borderHi: '#48484A',
  line:     '#38383A',  // separators inside cards
  accent:   '#D6AE5E',  // brass
  onAccent: '#1A1406',
  green:    '#30D158',
  teal:     '#40C8E0',
  orange:   '#FF9F0A',
  red:      '#FF453A',
  purple:   '#BF5AF2',
  muted:    '#6E6E73',
  textSoft: '#98989F',
  text:     '#FFFFFF',
  white:    '#FFFFFF',
};
const LIGHT: typeof DARK = {
  bg:       '#F2F2F7',
  card:     '#FFFFFF',
  surface:  '#E5E5EA',
  thumb:    '#FFFFFF',
  raised:   '#D1D1D6',
  border:   '#C7C7CC',
  borderHi: '#AEAEB2',
  line:     '#D8D8DC',
  accent:   '#946F1F',  // darker brass for contrast on white
  onAccent: '#FFFFFF',
  green:    '#248A3D',
  teal:     '#0071A4',
  orange:   '#C93400',
  red:      '#D70015',
  purple:   '#8944AB',
  muted:    '#8E8E93',
  textSoft: '#5F5F65',
  text:     '#000000',
  white:    '#FFFFFF',
};
export const C = isDark ? DARK : LIGHT;

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const statusColor = (status: string) =>
  status === 'proven'    ? C.green :
  status === 'promising' ? C.teal  :
  status === 'retired'   ? C.muted : C.textSoft;

// ── type ─────────────────────────────────────────────────────────────────────
// Barlow (DIN lineage: road signs, instruments) for text; Barlow Semi
// Condensed for numbers, like engraved turret figures. Weights are separate
// families because iOS won't synthesize them for custom fonts.
export const F = {
  regular:   'Barlow-Regular',
  medium:    'Barlow-Medium',
  semibold:  'Barlow-SemiBold',
  bold:      'Barlow-Bold',
  numMedium: 'BarlowSemiCondensed-Medium',
  num:       'BarlowSemiCondensed-SemiBold',
  numBold:   'BarlowSemiCondensed-Bold',
};
export const FONTS = {
  'Barlow-Regular':               require('../assets/fonts/Barlow-Regular.ttf'),
  'Barlow-Medium':                require('../assets/fonts/Barlow-Medium.ttf'),
  'Barlow-SemiBold':              require('../assets/fonts/Barlow-SemiBold.ttf'),
  'Barlow-Bold':                  require('../assets/fonts/Barlow-Bold.ttf'),
  'BarlowSemiCondensed-Medium':   require('../assets/fonts/BarlowSemiCondensed-Medium.ttf'),
  'BarlowSemiCondensed-SemiBold': require('../assets/fonts/BarlowSemiCondensed-SemiBold.ttf'),
  'BarlowSemiCondensed-Bold':     require('../assets/fonts/BarlowSemiCondensed-Bold.ttf'),
};

export const Type = StyleSheet.create({
  display:  { fontFamily: F.bold, fontSize: 32, color: C.text, letterSpacing: 0.2 },
  title:    { fontFamily: F.semibold, fontSize: 22, color: C.text },
  headline: { fontFamily: F.semibold, fontSize: 17, color: C.text },
  body:     { fontFamily: F.regular, fontSize: 16, color: C.text, lineHeight: 22 },
  sub:      { fontFamily: F.regular, fontSize: 14, color: C.textSoft, lineHeight: 19 },
  caption:  { fontFamily: F.regular, fontSize: 13, color: C.muted, lineHeight: 17 },
  num:      { fontFamily: F.num, fontVariant: ['tabular-nums'] },
});

export const commonStyles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 80 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  card:    { backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 12 },
  label:   { fontFamily: F.medium, fontSize: 14, color: C.textSoft, marginBottom: 6 },
  input: {
    fontFamily: F.regular,
    backgroundColor: C.surface,
    borderRadius: 10,
    color: C.text,
    fontSize: 17,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 12,
  },
  sectionTitle: { fontFamily: F.semibold, fontSize: 14, color: C.textSoft, marginTop: 24, marginBottom: 8, marginLeft: 4 },
  fab: {
    position: 'absolute' as const,
    bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.accent,
    justifyContent: 'center' as const, alignItems: 'center' as const,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  primaryBtn:     { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' as const, marginTop: 16 },
  primaryBtnText: { fontFamily: F.semibold, color: C.onAccent, fontSize: 17 },
  dangerBtn:      { backgroundColor: 'transparent', borderRadius: 12, paddingVertical: 15, alignItems: 'center' as const, marginTop: 6 },
  dangerBtnText:  { fontFamily: F.medium, color: C.red, fontSize: 16 },
});
