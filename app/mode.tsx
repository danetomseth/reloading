// First-run choice between Field mode and the full Development app.
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C, F, Type, commonStyles } from '../lib/theme';
import { AppMode, setMode } from '../lib/mode';
import type { IconName } from '../components/Form';

const OPTIONS: { mode: AppMode; icon: IconName; title: string; body: string }[] = [
  { mode: 'field', icon: 'speedometer', title: 'Field', body: 'Dope, wind holds and hit chance for the rifle in your hands. Big numbers, one hand.' },
  { mode: 'full', icon: 'layers', title: 'Development', body: 'Loads, ladders, groups, truing and your range records.' },
];

export default function ModeChooser() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const choose = (m: AppMode) => {
    setMode(m);
    router.replace((m === 'field' ? '/field' : '/') as any);
  };
  return (
    <View style={[commonStyles.screen, st.wrap, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={Type.display}>LRS Tracker</Text>
      <Text style={[Type.sub, { marginTop: 6, marginBottom: 28 }]}>How do you want to use it?</Text>
      {OPTIONS.map(o => (
        <TouchableOpacity key={o.mode} style={st.card} activeOpacity={0.75} onPress={() => choose(o.mode)}>
          <View style={st.icon}><Ionicons name={o.icon} size={26} color={C.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={st.title}>{o.title}</Text>
            <Text style={st.body}>{o.body}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </TouchableOpacity>
      ))}
      <Text style={[Type.caption, { marginTop: 8 }]}>You can switch at any time. The app opens in the mode you used last.</Text>
    </View>
  );
}

const st = StyleSheet.create({
  wrap:  { paddingHorizontal: 20 },
  card:  { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 16, padding: 18, marginBottom: 14 },
  icon:  { width: 48, height: 48, borderRadius: 12, backgroundColor: C.accent + '1f', alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.semibold, fontSize: 20, color: C.text },
  body:  { fontFamily: F.regular, fontSize: 15, color: C.textSoft, marginTop: 3, lineHeight: 20 },
});
