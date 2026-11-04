// Small status row: shows when the app is offline, when changes are waiting
// to sync, or when the server rejected a queued change. Hidden otherwise.
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F } from '../lib/theme';
import { SyncStatus as Status, dismissFailed, getSyncStatus, subscribeSync, syncNow } from '../lib/cache';

export function useSyncStatus(): Status {
  const [s, setS] = useState<Status>(getSyncStatus);
  useEffect(() => subscribeSync(setS), []);
  return s;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function SyncStatus({ style }: { style?: StyleProp<ViewStyle> }) {
  const s = useSyncStatus();
  const nFailed = s.failed.length;
  if (!s.offline && !s.pending && !nFailed) return null;

  if (nFailed) {
    const show = () => Alert.alert(
      `${plural(nFailed, 'change')} didn't sync`,
      'The server turned these down, so they only exist on this phone until the next refresh:\n\n'
        + s.failed.slice(0, 5).map(f => `• ${f.kind} ${f.table}: ${f.error}`).join('\n'),
      [{ text: 'Keep', style: 'cancel' }, { text: 'Dismiss', style: 'destructive', onPress: () => { dismissFailed(); } }],
    );
    return (
      <TouchableOpacity style={[st.row, { backgroundColor: C.red + '18' }, style]} onPress={show} activeOpacity={0.7}>
        <Ionicons name="alert-circle-outline" size={16} color={C.red} />
        <Text style={st.text}>{plural(nFailed, 'change')} couldn't sync. Tap for details.</Text>
      </TouchableOpacity>
    );
  }

  const label = s.offline
    ? (s.pending ? `Offline. ${plural(s.pending, 'change')} will sync when you're back online.` : 'Offline. Showing data saved on this phone.')
    : s.syncing ? `Syncing ${plural(s.pending, 'change')}…` : `${plural(s.pending, 'change')} waiting to sync. Tap to retry.`;

  return (
    <TouchableOpacity style={[st.row, style]} onPress={() => { syncNow(); }} activeOpacity={0.7}>
      <Ionicons name={s.offline ? 'cloud-offline-outline' : 'cloud-upload-outline'} size={16} color={C.textSoft} />
      <Text style={st.text}>{label}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  row:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  text: { flex: 1, color: C.textSoft, fontFamily: F.medium, fontSize: 13 },
});

export default SyncStatus;
